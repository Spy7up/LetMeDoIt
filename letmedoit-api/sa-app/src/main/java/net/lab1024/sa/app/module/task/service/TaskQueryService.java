package net.lab1024.sa.app.module.task.service;

import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.friend.dao.FriendDao;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskEventTypeEnum;
import net.lab1024.sa.app.module.task.constant.TaskRoleEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskTimeRangeEnum;
import net.lab1024.sa.app.module.task.dao.TaskDao;
import net.lab1024.sa.app.module.task.dao.TaskEventDao;
import net.lab1024.sa.app.module.task.dao.TaskParticipantDao;
import net.lab1024.sa.app.module.task.domain.dto.TaskParticipantRow;
import net.lab1024.sa.app.module.task.domain.dto.TaskQueryParam;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.form.TaskQueryForm;
import net.lab1024.sa.app.module.task.domain.vo.TaskDetailVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskEventVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskListVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskParticipantVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskStatsVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskSummaryVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskUserVO;
import net.lab1024.sa.app.module.task.manager.TaskManager;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import net.lab1024.sa.base.common.domain.PageResult;
import net.lab1024.sa.base.common.util.SmartPageUtil;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 任务查询（列表 / 详情 / 摘要 / 统计）
 * <p>
 * 查询类逻辑单独拆出来，让 TaskService 只负责状态流转与校验。
 *
 * @author letmedoit
 */
@Service
public class TaskQueryService {

    /**
     * 列表卡片上最多展示几个头像
     */
    private static final int AVATAR_LIMIT = 4;

    /**
     * 摘要里最多展示几个"在等我的人"
     */
    private static final int WAITING_USER_LIMIT = 3;

    @Resource
    private TaskDao taskDao;

    @Resource
    private TaskParticipantDao taskParticipantDao;

    @Resource
    private TaskEventDao taskEventDao;

    @Resource
    private WxMemberService wxMemberService;

    @Resource
    private FriendDao friendDao;

    /**
     * 任务列表
     */
    public PageResult<TaskListVO> query(TaskQueryForm queryForm, Long memberId) {
        TaskQueryParam param = buildQueryParam(queryForm, memberId);
        Page<?> page = SmartPageUtil.convert2PageQuery(queryForm);
        List<TaskListVO> list = taskDao.queryPage(param, page);
        assembleList(list, memberId);
        return SmartPageUtil.convert2PageResult(page, list);
    }

    /**
     * 任务详情
     */
    public TaskDetailVO detail(TaskEntity task, Long memberId) {
        TaskDetailVO detail = new TaskDetailVO();
        detail.setTaskId(task.getTaskId());
        detail.setTitle(task.getTitle());
        detail.setDescription(task.getDescription());
        detail.setCompletionMode(task.getCompletionMode());
        detail.setCompletionModeDesc(descOfCompletionMode(task.getCompletionMode()));
        detail.setStatus(task.getStatus());
        detail.setStatusDesc(descOfStatus(task.getStatus()));
        detail.setStartTime(task.getStartTime());
        detail.setDeadline(task.getDeadline());
        detail.setRemindMinutes(task.getRemindMinutes());
        detail.setOverdueFlag(isOverdue(task));
        detail.setCreateTime(task.getCreateTime());
        detail.setUpdateTime(task.getUpdateTime());

        List<TaskParticipantRow> rows = taskParticipantDao.queryByTaskId(task.getTaskId(), Boolean.FALSE);
        List<TaskParticipantVO> participants = rows.stream().map(this::toParticipantVO).collect(Collectors.toList());
        detail.setParticipants(participants);
        fillCounts(detail, participants);

        TaskParticipantVO me = participants.stream()
                .filter(item -> Objects.equals(item.getMemberId(), memberId))
                .findFirst().orElse(null);
        detail.setMe(me);
        detail.setCreatorFlag(Objects.equals(task.getCreatorId(), memberId));
        detail.setCreator(toUserVO(wxMemberService.getById(task.getCreatorId())));
        fillPermission(detail, task, me);

        List<TaskEventVO> events = taskEventDao.queryByTaskId(task.getTaskId());
        events.forEach(event -> event.setEventTypeDesc(descOfEventType(event.getEventType())));
        detail.setEvents(events);
        return detail;
    }

    /**
     * 首页摘要
     */
    public TaskSummaryVO summary(Long memberId) {
        TaskSummaryVO summary = taskDao.querySummaryCount(memberId, LocalDateTime.now(),
                TaskManager.ACTIVE_TASK_STATUS, TaskManager.ACTIONABLE_PARTICIPANT_STATUS, Boolean.FALSE);
        if (summary == null) {
            summary = new TaskSummaryVO();
            summary.setAssigneeCount(0);
            summary.setCreatorCount(0);
            summary.setOverdueCount(0);
        }
        summary.setWaitingUsers(taskDao.queryWaitingUsers(memberId,
                TaskManager.ACTIVE_TASK_STATUS, TaskManager.ACTIONABLE_PARTICIPANT_STATUS,
                Boolean.FALSE, WAITING_USER_LIMIT));
        return summary;
    }

    /**
     * 我的统计
     */
    public TaskStatsVO stats(Long memberId) {
        TaskStatsVO stats = taskDao.queryStats(memberId, ParticipantStatusEnum.COMPLETED.getValue(), Boolean.FALSE);
        if (stats == null) {
            stats = new TaskStatsVO();
        }
        int completed = stats.getCompletedCount() == null ? 0 : stats.getCompletedCount();
        int onTime = stats.getOnTimeCount() == null ? 0 : stats.getOnTimeCount();
        stats.setOnTimeRate(completed == 0
                ? BigDecimal.ONE
                : BigDecimal.valueOf(onTime).divide(BigDecimal.valueOf(completed), 2, RoundingMode.HALF_UP));
        stats.setFriendCount(friendDao.countByMember(memberId, Boolean.FALSE));
        return stats;
    }

    /* ---------------- 内部组装 ---------------- */

    private TaskQueryParam buildQueryParam(TaskQueryForm queryForm, Long memberId) {
        TaskQueryParam param = new TaskQueryParam();
        param.setQuery(queryForm);
        param.setMemberId(memberId);
        LocalDateTime now = LocalDateTime.now();
        param.setNow(now);
        param.setDeletedFlag(Boolean.FALSE);
        param.setActiveTaskStatusList(TaskManager.ACTIVE_TASK_STATUS);
        param.setDoneParticipantStatus(ParticipantStatusEnum.COMPLETED.getValue());
        // 时间范围按「创建时间」筛，起点在服务端算，避免手机时区不同算出不同的「今天」
        param.setCreateStartTime(resolveCreateStartTime(queryForm.getTimeRange(), now));
        return param;
    }

    /**
     * 时间范围 → 创建时间起点；null 表示不限
     */
    private LocalDateTime resolveCreateStartTime(Integer timeRange, LocalDateTime now) {
        if (timeRange == null || TaskTimeRangeEnum.ALL.getValue().equals(timeRange)) {
            return null;
        }
        LocalDate today = now.toLocalDate();
        if (TaskTimeRangeEnum.TODAY.getValue().equals(timeRange)) {
            return today.atStartOfDay();
        }
        if (TaskTimeRangeEnum.LAST_7_DAYS.getValue().equals(timeRange)) {
            // 含今天共 7 天
            return today.minusDays(6).atStartOfDay();
        }
        if (TaskTimeRangeEnum.LAST_30_DAYS.getValue().equals(timeRange)) {
            return today.minusDays(29).atStartOfDay();
        }
        return null;
    }

    /**
     * 列表补全：描述文案、角色、参与者头像、委托人
     */
    private void assembleList(List<TaskListVO> list, Long memberId) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> taskIds = list.stream().map(TaskListVO::getTaskId).collect(Collectors.toList());
        Map<Long, List<TaskParticipantRow>> rowMap = taskParticipantDao
                .queryByTaskIds(taskIds, Boolean.FALSE)
                .stream()
                .collect(Collectors.groupingBy(TaskParticipantRow::getTaskId));

        List<Long> creatorIds = list.stream().map(TaskListVO::getCreatorId).distinct().collect(Collectors.toList());
        Map<Long, WxMemberEntity> memberMap = wxMemberService.queryByIds(creatorIds).stream()
                .collect(Collectors.toMap(WxMemberEntity::getMemberId, item -> item));

        for (TaskListVO item : list) {
            List<TaskParticipantRow> rows = rowMap.getOrDefault(item.getTaskId(), Collections.emptyList());
            item.setStatusDesc(descOfStatus(item.getStatus()));
            item.setCompletionModeDesc(descOfCompletionMode(item.getCompletionMode()));
            item.setParticipantCount(rows.isEmpty() ? item.getParticipantCount() : rows.size());
            item.setParticipants(rows.stream()
                    .limit(AVATAR_LIMIT)
                    .map(this::toUserVO)
                    .collect(Collectors.toList()));
            item.setCreator(toUserVO(memberMap.get(item.getCreatorId())));
            Integer myStatus = rows.stream()
                    .filter(row -> Objects.equals(row.getMemberId(), memberId))
                    .map(TaskParticipantRow::getStatus)
                    .findFirst().orElse(null);
            item.setMyStatus(myStatus);
            item.setRole(myStatus == null ? TaskRoleEnum.CREATOR.getValue() : TaskRoleEnum.ASSIGNEE.getValue());
        }
    }

    private TaskParticipantVO toParticipantVO(TaskParticipantRow row) {
        TaskParticipantVO vo = new TaskParticipantVO();
        vo.setMemberId(row.getMemberId());
        vo.setNickname(row.getNickname());
        vo.setAvatar(row.getAvatar());
        vo.setStatus(row.getStatus());
        vo.setStatusDesc(descOfParticipantStatus(row.getStatus()));
        vo.setCompleteTime(row.getCompleteTime());
        vo.setCompleteRemark(row.getCompleteRemark());
        vo.setCompleteImages(parseImages(row.getCompleteImages()));
        vo.setRejectReason(row.getRejectReason());
        return vo;
    }

    private TaskUserVO toUserVO(TaskParticipantRow row) {
        TaskUserVO vo = new TaskUserVO();
        vo.setMemberId(row.getMemberId());
        vo.setNickname(row.getNickname());
        vo.setAvatar(row.getAvatar());
        return vo;
    }

    private TaskUserVO toUserVO(WxMemberEntity entity) {
        if (entity == null) {
            return null;
        }
        TaskUserVO vo = new TaskUserVO();
        vo.setMemberId(entity.getMemberId());
        vo.setNickname(entity.getNickname());
        vo.setAvatar(entity.getAvatar());
        return vo;
    }

    private void fillCounts(TaskDetailVO detail, List<TaskParticipantVO> participants) {
        detail.setTotalCount(participants.size());
        detail.setDoneCount(countByStatus(participants, ParticipantStatusEnum.COMPLETED));
        detail.setAcceptedCount(countByStatus(participants, ParticipantStatusEnum.ACCEPTED));
        detail.setRejectedCount(countByStatus(participants, ParticipantStatusEnum.REJECTED));
        detail.setSkippedCount(countByStatus(participants, ParticipantStatusEnum.SKIPPED));
    }

    private int countByStatus(List<TaskParticipantVO> participants, ParticipantStatusEnum status) {
        return (int) participants.stream().filter(p -> status.getValue().equals(p.getStatus())).count();
    }

    /**
     * 权限位全部由服务端算，前端只读，避免两端规则漂移
     */
    private void fillPermission(TaskDetailVO detail, TaskEntity task, TaskParticipantVO me) {
        boolean creator = Boolean.TRUE.equals(detail.getCreatorFlag());
        boolean taskActive = TaskManager.ACTIONABLE_TASK_STATUS.contains(task.getStatus());
        boolean notStarted = Arrays.asList(TaskStatusEnum.SCHEDULED.getValue(), TaskStatusEnum.PENDING.getValue())
                .contains(task.getStatus());

        boolean pendingMine = me != null && ParticipantStatusEnum.PENDING.getValue().equals(me.getStatus());
        boolean acceptedMine = me != null && ParticipantStatusEnum.ACCEPTED.getValue().equals(me.getStatus());

        detail.setCanAccept(pendingMine && taskActive);
        detail.setCanReject(pendingMine && taskActive);
        detail.setCanComplete(acceptedMine && taskActive);
        detail.setCanCancel(creator && taskActive);
        detail.setCanRemind(creator && taskActive);
        detail.setCanAddParticipant(creator && notStarted && detail.getTotalCount() < TaskManager.MAX_PARTICIPANT);
        detail.setCanEdit(creator && notStarted);
    }

    private boolean isOverdue(TaskEntity task) {
        return TaskManager.ACTIONABLE_TASK_STATUS.contains(task.getStatus())
                && task.getDeadline() != null
                && task.getDeadline().isBefore(LocalDateTime.now());
    }

    private List<String> parseImages(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return com.alibaba.fastjson.JSON.parseArray(json, String.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    /* ---------------- 枚举文案 ---------------- */

    private String descOfStatus(Integer status) {
        for (TaskStatusEnum item : TaskStatusEnum.values()) {
            if (item.getValue().equals(status)) {
                return item.getDesc();
            }
        }
        return "";
    }

    private String descOfCompletionMode(Integer mode) {
        for (CompletionModeEnum item : CompletionModeEnum.values()) {
            if (item.getValue().equals(mode)) {
                return item.getDesc();
            }
        }
        return "";
    }

    private String descOfParticipantStatus(Integer status) {
        for (ParticipantStatusEnum item : ParticipantStatusEnum.values()) {
            if (item.getValue().equals(status)) {
                return item.getDesc();
            }
        }
        return "";
    }

    private String descOfEventType(Integer type) {
        for (TaskEventTypeEnum item : TaskEventTypeEnum.values()) {
            if (item.getValue().equals(type)) {
                return item.getDesc();
            }
        }
        return "";
    }
}
