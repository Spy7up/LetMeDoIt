package net.lab1024.sa.app.module.task.service;

import com.alibaba.fastjson.JSON;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.friend.dao.FriendDao;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.dao.TaskDao;
import net.lab1024.sa.app.module.task.dao.TaskParticipantDao;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import net.lab1024.sa.app.module.task.domain.form.TaskAddForm;
import net.lab1024.sa.app.module.task.domain.form.TaskCompleteForm;
import net.lab1024.sa.app.module.task.domain.form.TaskParticipantAddForm;
import net.lab1024.sa.app.module.task.domain.form.TaskQueryForm;
import net.lab1024.sa.app.module.task.domain.form.TaskRejectForm;
import net.lab1024.sa.app.module.task.domain.form.TaskUpdateForm;
import net.lab1024.sa.app.module.task.domain.vo.TaskDetailVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskListVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskStatsVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskSummaryVO;
import net.lab1024.sa.app.module.task.manager.TaskManager;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.domain.PageResult;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 任务业务编排
 * <p>
 * 只做「校验 + 调 manager + 生成通知 + 组装返回」，事务在 TaskManager。
 * 状态常量统一从 TaskManager 取，避免散落。
 *
 * @author letmedoit
 */
@Slf4j
@Service
public class TaskService {

    /**
     * 催办最小间隔（秒）
     */
    private static final long REMIND_INTERVAL_SECONDS = 60L;

    /**
     * 「某一天」模式允许的最晚开始时间点（当天几点之前必须开始）
     */
    private static final int START_LATEST_HOUR = 22;

    @Resource
    private TaskDao taskDao;

    @Resource
    private TaskParticipantDao taskParticipantDao;

    @Resource
    private FriendDao friendDao;

    @Resource
    private WxMemberService wxMemberService;

    @Resource
    private TaskManager taskManager;

    @Resource
    private TaskQueryService taskQueryService;

    @Resource
    private TaskNoticeService taskNoticeService;

    /* ---------------- 查询 ---------------- */

    public ResponseDTO<PageResult<TaskListVO>> query(TaskQueryForm queryForm, Long memberId) {
        return ResponseDTO.ok(taskQueryService.query(queryForm, memberId));
    }

    public ResponseDTO<TaskDetailVO> detail(Long taskId, Long memberId) {
        TaskEntity task = taskDao.queryById(taskId, Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        if (!isRelated(task, memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "这不是你的任务");
        }
        return ResponseDTO.ok(taskQueryService.detail(task, memberId));
    }

    public ResponseDTO<TaskSummaryVO> summary(Long memberId) {
        return ResponseDTO.ok(taskQueryService.summary(memberId));
    }

    public ResponseDTO<TaskStatsVO> stats(Long memberId) {
        return ResponseDTO.ok(taskQueryService.stats(memberId));
    }

    /* ---------------- 写操作 ---------------- */

    /**
     * 布置任务
     */
    public ResponseDTO<TaskDetailVO> create(TaskAddForm addForm, Long memberId) {
        List<Long> memberIds = distinct(addForm.getMemberIds());
        if (memberIds.isEmpty()) {
            return ResponseDTO.userErrorParam("至少选一个人");
        }
        if (addForm.getDeadline().isBefore(LocalDateTime.now())) {
            return ResponseDTO.userErrorParam("截止时间不能早于现在");
        }
        if (addForm.getStartTime() != null) {
            String startError = checkStartTime(addForm.getStartTime(), addForm.getDeadline());
            if (startError != null) {
                return ResponseDTO.userErrorParam(startError);
            }
        }
        ResponseDTO<TaskDetailVO> friendCheck = checkFriends(memberId, memberIds);
        if (friendCheck != null) {
            return friendCheck;
        }

        TaskEntity task = new TaskEntity();
        task.setTitle(addForm.getTitle().trim());
        task.setDescription(addForm.getDescription());
        task.setCreatorId(memberId);
        task.setCompletionMode(addForm.getCompletionMode());
        task.setStartTime(addForm.getStartTime());
        // 到点通知默认开（产品默认「到点就发送通知」）
        task.setStartNotifyFlag(addForm.getStartNotifyFlag() == null || addForm.getStartNotifyFlag());
        task.setDeadline(addForm.getDeadline());
        task.setRemindMinutes(addForm.getRemindMinutes() == null ? 0 : addForm.getRemindMinutes());
        task.setRemindTime(calcRemindTime(addForm.getDeadline(), task.getRemindMinutes()));

        taskManager.create(task, memberIds);

        WxMemberEntity creator = wxMemberService.getById(memberId);
        taskNoticeService.notifyAssigned(task, displayNameOf(creator),
                memberIds.stream().filter(id -> !Objects.equals(id, memberId)).collect(Collectors.toList()),
                memberIds.size());

        log.info("任务创建, taskId={}, creatorId={}, 参与人数={}", task.getTaskId(), memberId, memberIds.size());
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(task.getTaskId(), Boolean.FALSE), memberId));
    }

    /**
     * 编辑任务（仅未开始前）
     */
    public ResponseDTO<TaskDetailVO> update(TaskUpdateForm form, Long memberId) {
        TaskEntity task = taskDao.queryById(form.getTaskId(), Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        if (!Objects.equals(task.getCreatorId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "只有布置的人能修改");
        }
        if (!TaskManager.canEdit(task)) {
            return ResponseDTO.userErrorParam(
                    TaskStatusEnum.IN_PROGRESS.getValue().equals(task.getStatus())
                            ? "已经改过一次了，不能再改"
                            : "任务已经结束，改不了了");
        }
        if (form.getDeadline() != null && form.getDeadline().isBefore(LocalDateTime.now())) {
            return ResponseDTO.userErrorParam("截止时间不能早于现在");
        }

        TaskEntity update = new TaskEntity();
        update.setTaskId(task.getTaskId());
        update.setTitle(StringUtils.hasText(form.getTitle()) ? form.getTitle().trim() : null);
        update.setDescription(form.getDescription());
        update.setCompletionMode(form.getCompletionMode());
        update.setDeadline(form.getDeadline());
        update.setRemindMinutes(form.getRemindMinutes());
        if (form.getDeadline() != null) {
            int minutes = form.getRemindMinutes() == null ? task.getRemindMinutes() : form.getRemindMinutes();
            task.setRemindTime(calcRemindTime(form.getDeadline(), minutes));
            update.setRemindTime(task.getRemindTime());
        }
        update.setStatus(task.getStatus());
        update.setCreatorId(memberId);
        // 只有「进行中」的编辑才计数：预约中/待接受随便改，进行中只给一次
        if (TaskStatusEnum.IN_PROGRESS.getValue().equals(task.getStatus())) {
            update.setEditCount(task.getEditCount() == null ? 1 : task.getEditCount() + 1);
        }

        // 开始时间点只有预约中的任务能改：改完到点仍然自动生效
        boolean scheduledTask = TaskStatusEnum.SCHEDULED.getValue().equals(task.getStatus());
        // 关掉「开始时间点」：清空开始时间，任务立刻退回待接受
        boolean removeStart = scheduledTask && Boolean.TRUE.equals(form.getRemoveStartTime());

        if (scheduledTask && !removeStart && form.getStartTime() != null) {
            LocalDateTime newDeadline = form.getDeadline() != null ? form.getDeadline() : task.getDeadline();
            String startError = checkStartTime(form.getStartTime(), newDeadline);
            if (startError != null) {
                return ResponseDTO.userErrorParam(startError);
            }
            update.setStartTime(form.getStartTime());
        }
        if (scheduledTask && form.getStartNotifyFlag() != null) {
            update.setStartNotifyFlag(form.getStartNotifyFlag());
        }

        TaskEntity merged = merge(task, update);
        if (removeStart) {
            // updateById 会忽略 null，必须单独清一次；refreshStatus 随后把它算成待接受
            taskDao.clearStartTime(task.getTaskId(), LocalDateTime.now());
            merged.setStartTime(null);
        }
        taskManager.update(merged, "编辑了任务");

        // 改动要让所有人都知道：出自己以外的参与者都收一条
        List<Long> others = taskManager.queryParticipants(task.getTaskId()).stream()
                .map(TaskParticipantEntity::getMemberId)
                .filter(id -> !Objects.equals(id, memberId))
                .distinct()
                .collect(Collectors.toList());
        taskNoticeService.notifyEdited(merged, displayNameOf(wxMemberService.getById(memberId)), others);

        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(task.getTaskId(), Boolean.FALSE), memberId));
    }

    /**
     * 接受任务（只改我那一格）
     */
    public ResponseDTO<TaskDetailVO> accept(Long taskId, Long memberId) {
        TaskEntity task = taskDao.queryById(taskId, Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        TaskParticipantEntity mine = taskParticipantDao.queryByTaskAndMember(taskId, memberId, Boolean.FALSE);
        if (mine == null) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "你不在这个任务里");
        }
        if (!ParticipantStatusEnum.PENDING.getValue().equals(mine.getStatus())) {
            return ResponseDTO.userErrorParam("你已经处理过了");
        }
        if (!TaskManager.ACTIONABLE_TASK_STATUS.contains(task.getStatus())) {
            return ResponseDTO.userErrorParam("任务已经不在可接受状态");
        }
        taskManager.accept(task, mine, "接受了任务");
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(taskId, Boolean.FALSE), memberId));
    }

    /**
     * 拒绝任务（只拒绝我那一格，任务本身继续给别人）
     */
    public ResponseDTO<TaskDetailVO> reject(TaskRejectForm form, Long memberId) {
        TaskEntity task = taskDao.queryById(form.getTaskId(), Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        TaskParticipantEntity mine = taskParticipantDao.queryByTaskAndMember(task.getTaskId(), memberId, Boolean.FALSE);
        if (mine == null) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "你不在这个任务里");
        }
        if (!ParticipantStatusEnum.PENDING.getValue().equals(mine.getStatus())) {
            return ResponseDTO.userErrorParam("你已经处理过了");
        }
        taskManager.reject(task, mine, form.getReason(), "拒绝了任务：" + form.getReason());
        log.info("任务被拒绝, taskId={}, memberId={}", task.getTaskId(), memberId);
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(task.getTaskId(), Boolean.FALSE), memberId));
    }

    /**
     * 完成我这份
     */
    public ResponseDTO<TaskDetailVO> complete(TaskCompleteForm form, Long memberId) {
        TaskEntity task = taskDao.queryById(form.getTaskId(), Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        TaskParticipantEntity mine = taskParticipantDao.queryByTaskAndMember(task.getTaskId(), memberId, Boolean.FALSE);
        if (mine == null) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "你不在这个任务里");
        }
        if (ParticipantStatusEnum.COMPLETED.getValue().equals(mine.getStatus())) {
            return ResponseDTO.userErrorParam("你已经完成过了");
        }
        if (!ParticipantStatusEnum.ACCEPTED.getValue().equals(mine.getStatus())) {
            return ResponseDTO.userErrorParam("先接受任务才能完成");
        }

        String remark = StringUtils.hasText(form.getRemark()) ? form.getRemark().trim() : "";
        String imagesJson = CollectionUtils.isEmpty(form.getImages()) ? null : JSON.toJSONString(form.getImages());
        String content = "完成了自己那份" + (StringUtils.hasText(remark) ? "：" + remark : "");
        boolean finished = taskManager.complete(task, mine, remark, imagesJson, content);

        notifyCompleted(task, mine, memberId, finished);
        log.info("任务完成一份, taskId={}, memberId={}, finished={}", task.getTaskId(), memberId, finished);
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(task.getTaskId(), Boolean.FALSE), memberId));
    }

    /**
     * 撤回任务（委托人）
     */
    public ResponseDTO<TaskDetailVO> cancel(Long taskId, Long memberId) {
        TaskEntity task = taskDao.queryById(taskId, Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        if (!Objects.equals(task.getCreatorId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "只有布置的人能撤回");
        }
        taskManager.cancel(task, "撤回了任务");

        // 撤回要让所有参与者都知道（含已做完的人，他们那份也不用交了）
        List<Long> others = taskManager.queryParticipants(taskId).stream()
                .map(TaskParticipantEntity::getMemberId)
                .filter(id -> !Objects.equals(id, memberId))
                .distinct()
                .collect(Collectors.toList());
        taskNoticeService.notifyCancelled(task, displayNameOf(wxMemberService.getById(memberId)), others);

        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(taskId, Boolean.FALSE), memberId));
    }

    /**
     * 催一下（委托人，只催还没完成的人）
     */
    public ResponseDTO<TaskDetailVO> remind(Long taskId, Long memberId) {
        TaskEntity task = taskDao.queryById(taskId, Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        if (!Objects.equals(task.getCreatorId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "只有布置的人能催");
        }
        if (!TaskManager.ACTIONABLE_TASK_STATUS.contains(task.getStatus())) {
            return ResponseDTO.userErrorParam("这个任务不用催了");
        }
        if (task.getLastRemindTime() != null
                && task.getLastRemindTime().plusSeconds(REMIND_INTERVAL_SECONDS).isAfter(LocalDateTime.now())) {
            return ResponseDTO.userErrorParam("刚催过啦，TA 马上就看得到");
        }

        List<TaskParticipantEntity> participants = taskManager.queryParticipants(taskId);
        List<Long> waiting = participants.stream()
                .filter(p -> TaskManager.ACTIONABLE_PARTICIPANT_STATUS.contains(p.getStatus()))
                .map(TaskParticipantEntity::getMemberId)
                .filter(id -> !Objects.equals(id, memberId))
                .collect(Collectors.toList());
        if (waiting.isEmpty()) {
            return ResponseDTO.userErrorParam("都做完了，不用催");
        }

        taskManager.remind(task, "提醒了 " + waiting.size() + " 人");
        taskNoticeService.notifyRemind(task, displayNameOf(wxMemberService.getById(memberId)), waiting);
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(taskId, Boolean.FALSE), memberId));
    }

    /**
     * 追加参与者（仅未开始前）
     */
    public ResponseDTO<TaskDetailVO> addParticipants(TaskParticipantAddForm form, Long memberId) {
        TaskEntity task = taskDao.queryById(form.getTaskId(), Boolean.FALSE);
        if (task == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "任务不存在或已被删除");
        }
        if (!Objects.equals(task.getCreatorId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "只有布置的人能加人");
        }
        // 加人只在还没开始时允许（进行中即使还能编辑一次，也不能再拉人进来）
        boolean notStarted = TaskStatusEnum.SCHEDULED.getValue().equals(task.getStatus())
                || TaskStatusEnum.PENDING.getValue().equals(task.getStatus());
        if (!notStarted) {
            return ResponseDTO.userErrorParam("已经开始了，加不了人");
        }

        List<TaskParticipantEntity> exists = taskManager.queryParticipants(task.getTaskId());
        List<Long> existIds = exists.stream().map(TaskParticipantEntity::getMemberId).collect(Collectors.toList());
        List<Long> toAdd = distinct(form.getMemberIds()).stream()
                .filter(id -> !existIds.contains(id))
                .collect(Collectors.toList());
        if (toAdd.isEmpty()) {
            return ResponseDTO.userErrorParam("TA 已经在任务里了");
        }
        if (existIds.size() + toAdd.size() > TaskManager.MAX_PARTICIPANT) {
            return ResponseDTO.userErrorParam("一条任务最多 " + TaskManager.MAX_PARTICIPANT + " 个人");
        }
        ResponseDTO<TaskDetailVO> friendCheck = checkFriends(memberId, toAdd);
        if (friendCheck != null) {
            return friendCheck;
        }

        taskManager.addParticipants(task, toAdd);
        WxMemberEntity creator = wxMemberService.getById(memberId);
        taskNoticeService.notifyAssigned(task, displayNameOf(creator),
                toAdd.stream().filter(id -> !Objects.equals(id, memberId)).collect(Collectors.toList()),
                existIds.size() + toAdd.size());
        return ResponseDTO.ok(taskQueryService.detail(taskDao.queryById(task.getTaskId(), Boolean.FALSE), memberId));
    }

    /* ---------------- 内部 ---------------- */

    /**
     * 完成后的通知：委托人不在自己完成时收到自己的通知
     */
    private void notifyCompleted(TaskEntity task, TaskParticipantEntity mine, Long memberId, boolean finished) {
        if (Objects.equals(task.getCreatorId(), memberId)) {
            return;
        }
        List<TaskParticipantEntity> participants = taskManager.queryParticipants(task.getTaskId());
        int total = participants.size();
        int done = (int) participants.stream()
                .filter(p -> ParticipantStatusEnum.COMPLETED.getValue().equals(p.getStatus()))
                .count();
        taskNoticeService.notifyCompleted(task, displayNameOf(wxMemberService.getById(memberId)),
                task.getCreatorId(), done, total, finished);
    }

    /**
     * 参与者必须都是好友（自己除外）
     *
     * @return null 表示校验通过
     */
    private ResponseDTO<TaskDetailVO> checkFriends(Long memberId, List<Long> memberIds) {
        List<Long> others = memberIds.stream().filter(id -> !Objects.equals(id, memberId)).collect(Collectors.toList());
        if (others.isEmpty()) {
            return null;
        }
        List<Long> friendIds = friendDao.queryFriendMemberIds(memberId, Boolean.FALSE);
        for (Long id : others) {
            if (!friendIds.contains(id)) {
                return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "有参与者还不是你的好友");
            }
        }
        return null;
    }

    private boolean isRelated(TaskEntity task, Long memberId) {
        if (Objects.equals(task.getCreatorId(), memberId)) {
            return true;
        }
        return taskParticipantDao.queryByTaskAndMember(task.getTaskId(), memberId, Boolean.FALSE) != null;
    }

    private List<Long> distinct(List<Long> ids) {
        if (CollectionUtils.isEmpty(ids)) {
            return new ArrayList<>();
        }
        return ids.stream().filter(Objects::nonNull).distinct().collect(Collectors.toList());
    }

    private String displayNameOf(WxMemberEntity member) {
        if (member == null) {
            return "有人";
        }
        return StringUtils.hasText(member.getNickname()) ? member.getNickname() : "微信用户";
    }

    /**
     * 开始时间点校验，返回错误文案；通过返回 null
     * <p>
     * 规则：必须在以后、必须早于截止；「某一天」任务的截止是当天 23:59:59，
     * 此时开始时间点不能晚于当天 22:00（否则留不出做事的时间）。
     */
    private String checkStartTime(LocalDateTime startTime, LocalDateTime deadline) {
        if (startTime.isBefore(LocalDateTime.now())) {
            return "开始时间点要在以后";
        }
        if (deadline == null || !startTime.isBefore(deadline)) {
            return "开始时间点要早于截止时间";
        }
        if (isWholeDayDeadline(deadline)) {
            LocalDateTime latest = deadline.toLocalDate().atTime(START_LATEST_HOUR, 0);
            if (startTime.isAfter(latest)) {
                return "「某一天」的任务，开始时间点要在当天 " + START_LATEST_HOUR + ":00 之前";
            }
        }
        return null;
    }

    /**
     * 截止时间是不是「某一天」模式（当天 23:59:59，前后端约定）
     */
    private boolean isWholeDayDeadline(LocalDateTime deadline) {
        return deadline != null
                && deadline.getHour() == 23
                && deadline.getMinute() == 59
                && deadline.getSecond() == 59;
    }

    /**
     * 提醒时间 = 截止时间 - 提前分钟数；不提醒返回 null
     */
    private LocalDateTime calcRemindTime(LocalDateTime deadline, Integer remindMinutes) {
        if (deadline == null || remindMinutes == null || remindMinutes <= 0) {
            return null;
        }
        LocalDateTime remindTime = deadline.minusMinutes(remindMinutes);
        // 算出来的提醒时间已经过去（比如截止还有 23 小时却选了「提前 1 天」），
        // 就不补发——否则一发布就收到一条「到期提醒」，很吓人
        return remindTime.isAfter(LocalDateTime.now()) ? remindTime : null;
    }

    /**
     * 编辑时把非空字段合并回原实体，避免 updateById 把未传字段覆盖成 null
     */
    private TaskEntity merge(TaskEntity task, TaskEntity update) {
        TaskEntity merged = new TaskEntity();
        merged.setTaskId(task.getTaskId());
        merged.setTitle(update.getTitle() != null ? update.getTitle() : task.getTitle());
        merged.setDescription(update.getDescription() != null ? update.getDescription() : task.getDescription());
        merged.setCompletionMode(update.getCompletionMode() != null ? update.getCompletionMode() : task.getCompletionMode());
        merged.setDeadline(update.getDeadline() != null ? update.getDeadline() : task.getDeadline());
        merged.setRemindMinutes(update.getRemindMinutes() != null ? update.getRemindMinutes() : task.getRemindMinutes());
        merged.setRemindTime(update.getRemindTime() != null ? update.getRemindTime() : task.getRemindTime());
        merged.setStatus(task.getStatus());
        merged.setCreatorId(task.getCreatorId());
        merged.setStartTime(update.getStartTime() != null ? update.getStartTime() : task.getStartTime());
        merged.setStartNotifyFlag(update.getStartNotifyFlag() != null ? update.getStartNotifyFlag() : task.getStartNotifyFlag());
        merged.setEditCount(update.getEditCount() != null ? update.getEditCount() : task.getEditCount());
        return merged;
    }
}
