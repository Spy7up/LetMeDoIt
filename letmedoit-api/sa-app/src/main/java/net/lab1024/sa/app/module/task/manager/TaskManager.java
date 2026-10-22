package net.lab1024.sa.app.module.task.manager;

import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskEventTypeEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.dao.TaskDao;
import net.lab1024.sa.app.module.task.dao.TaskEventDao;
import net.lab1024.sa.app.module.task.dao.TaskParticipantDao;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskEventEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import net.lab1024.sa.app.module.task.service.TaskStatusCalculator;
import net.lab1024.sa.base.common.exception.BusinessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * 任务事务层
 * <p>
 * 只做「多表写入 + 状态机推进 + 聚合状态重算」，不返回 ResponseDTO、不处理前端参数。
 * 所有状态流转都用带期望状态的条件更新，受影响行数为 0 即视为并发冲突。
 *
 * @author letmedoit
 */
@Component
public class TaskManager {

    /**
     * 未结束的任务状态（预约中 / 待接受 / 进行中）
     */
    public static final List<Integer> ACTIVE_TASK_STATUS = Arrays.asList(
            TaskStatusEnum.SCHEDULED.getValue(),
            TaskStatusEnum.PENDING.getValue(),
            TaskStatusEnum.IN_PROGRESS.getValue()
    );

    /**
     * 允许接受/完成的状态
     */
    public static final List<Integer> ACTIONABLE_TASK_STATUS = Arrays.asList(
            TaskStatusEnum.PENDING.getValue(),
            TaskStatusEnum.IN_PROGRESS.getValue()
    );

    /**
     * 需要我动手的参与状态（待接受 / 已接受）
     */
    public static final List<Integer> ACTIONABLE_PARTICIPANT_STATUS = Arrays.asList(
            ParticipantStatusEnum.PENDING.getValue(),
            ParticipantStatusEnum.ACCEPTED.getValue()
    );

    /**
     * 单条任务最多参与人数
     */
    public static final int MAX_PARTICIPANT = 10;

    /**
     * 能否编辑：
     * 预约中 / 待接受 —— 委托人随便改（还没人接，改动不影响别人）；
     * 进行中 —— 只允许再改一次，现在已经有人在做，反复改会让人白干。
     */
    public static boolean canEdit(TaskEntity task) {
        if (task == null || task.getStatus() == null) {
            return false;
        }
        Integer status = task.getStatus();
        if (TaskStatusEnum.SCHEDULED.getValue().equals(status)
                || TaskStatusEnum.PENDING.getValue().equals(status)) {
            return true;
        }
        if (TaskStatusEnum.IN_PROGRESS.getValue().equals(status)) {
            return task.getEditCount() == null || task.getEditCount() == 0;
        }
        return false;
    }

    @Resource
    private TaskDao taskDao;

    @Resource
    private TaskParticipantDao taskParticipantDao;

    @Resource
    private TaskEventDao taskEventDao;

    /**
     * 创建任务 + 写参与者 + 重算状态 + 记事件
     *
     * @param task      任务实体（taskId 由自增回填）
     * @param memberIds 参与者
     * @return 任务ID
     */
    @Transactional(rollbackFor = Exception.class)
    public Long create(TaskEntity task, List<Long> memberIds) {
        LocalDateTime now = LocalDateTime.now();
        task.setStatus(TaskStatusEnum.PENDING.getValue());
        task.setDeletedFlag(Boolean.FALSE);
        task.setCreateTime(now);
        task.setUpdateTime(now);
        taskDao.insert(task);

        insertParticipants(task.getTaskId(), memberIds, now);
        refreshStatus(task);
        addEvent(task.getTaskId(), task.getCreatorId(), TaskEventTypeEnum.CREATE,
                memberIds.size() > 1 ? "布置了任务，交给 " + memberIds.size() + " 人" : "布置了任务", now);
        return task.getTaskId();
    }

    /**
     * 接受任务（只改我那一格）
     *
     * @param task        任务
     * @param participant 我的那一格
     * @param content     事件文案
     */
    @Transactional(rollbackFor = Exception.class)
    public void accept(TaskEntity task, TaskParticipantEntity participant, String content) {
        LocalDateTime now = LocalDateTime.now();
        int rows = taskParticipantDao.updateStatus(participant.getParticipantId(),
                ParticipantStatusEnum.PENDING.getValue(),
                ParticipantStatusEnum.ACCEPTED.getValue(),
                now);
        if (rows == 0) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }
        refreshStatus(task);
        addEvent(task.getTaskId(), participant.getMemberId(), TaskEventTypeEnum.ACCEPT, content, now);
    }

    /**
     * 拒绝任务（只拒绝我那一格）
     */
    @Transactional(rollbackFor = Exception.class)
    public void reject(TaskEntity task, TaskParticipantEntity participant, String reason, String content) {
        LocalDateTime now = LocalDateTime.now();
        int rows = taskParticipantDao.updateReject(participant.getParticipantId(),
                ParticipantStatusEnum.PENDING.getValue(),
                ParticipantStatusEnum.REJECTED.getValue(),
                reason, now);
        if (rows == 0) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }
        refreshStatus(task);
        addEvent(task.getTaskId(), participant.getMemberId(), TaskEventTypeEnum.REJECT, content, now);
    }

    /**
     * 完成我这份
     * <p>
     * 「任一人完成」模式下，其余还没完成的人自动置为已跳过（不再提醒、不追责）
     *
     * @return 是否因本次完成而整单结束
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean complete(TaskEntity task, TaskParticipantEntity participant,
                            String remark, String imagesJson, String content) {
        LocalDateTime now = LocalDateTime.now();
        int rows = taskParticipantDao.updateComplete(participant.getParticipantId(),
                ParticipantStatusEnum.ACCEPTED.getValue(),
                ParticipantStatusEnum.COMPLETED.getValue(),
                now, remark, imagesJson, now);
        if (rows == 0) {
            throw new BusinessException("任务状态已变化，请刷新后重试");
        }

        boolean anyMode = CompletionModeEnum.ANY.getValue().equals(task.getCompletionMode());
        if (anyMode) {
            int skipped = taskParticipantDao.skipOthers(task.getTaskId(), participant.getMemberId(),
                    Arrays.asList(ParticipantStatusEnum.PENDING.getValue(), ParticipantStatusEnum.ACCEPTED.getValue()),
                    ParticipantStatusEnum.SKIPPED.getValue(), now);
            if (skipped > 0) {
                addEvent(task.getTaskId(), null, TaskEventTypeEnum.SKIP,
                        "有人先做完了，" + skipped + " 人无需参与", now);
            }
        }

        refreshStatus(task);
        addEvent(task.getTaskId(), participant.getMemberId(), TaskEventTypeEnum.COMPLETE, content, now);
        return TaskStatusEnum.COMPLETED.getValue().equals(task.getStatus());
    }

    /**
     * 撤回任务
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(TaskEntity task, String content) {
        LocalDateTime now = LocalDateTime.now();
        int rows = taskDao.updateStatus(task.getTaskId(), ACTIVE_TASK_STATUS, TaskStatusEnum.CANCELLED.getValue(), now);
        if (rows == 0) {
            throw new BusinessException("任务已经结束，不能撤回");
        }
        task.setStatus(TaskStatusEnum.CANCELLED.getValue());
        task.setUpdateTime(now);
        addEvent(task.getTaskId(), task.getCreatorId(), TaskEventTypeEnum.CANCEL, content, now);
    }

    /**
     * 追加参与者
     *
     * @return 追加成功的人数
     */
    @Transactional(rollbackFor = Exception.class)
    public int addParticipants(TaskEntity task, List<Long> memberIds) {
        LocalDateTime now = LocalDateTime.now();
        insertParticipants(task.getTaskId(), memberIds, now);
        refreshStatus(task);
        return memberIds.size();
    }

    /**
     * 催办：只更新最后催办时间，提醒内容由 service 写通知
     */
    @Transactional(rollbackFor = Exception.class)
    public void remind(TaskEntity task, String content) {
        LocalDateTime now = LocalDateTime.now();
        taskDao.updateRemind(task.getTaskId(), task.getRemindTime(), now, now);
        task.setLastRemindTime(now);
        addEvent(task.getTaskId(), task.getCreatorId(), TaskEventTypeEnum.REMIND, content, now);
    }

    /**
     * 编辑任务（未开始前）
     */
    @Transactional(rollbackFor = Exception.class)
    public void update(TaskEntity task, String content) {
        LocalDateTime now = LocalDateTime.now();
        task.setUpdateTime(now);
        taskDao.updateById(task);
        refreshStatus(task);
        addEvent(task.getTaskId(), task.getCreatorId(), TaskEventTypeEnum.CREATE, content, now);
    }

    /**
     * 预约任务到点生效：重算状态（START 时间已过，不会再被判为预约中）+ 记事件 + 重排提醒
     */
    @Transactional(rollbackFor = Exception.class)
    public void activate(TaskEntity task) {
        LocalDateTime now = LocalDateTime.now();
        refreshStatus(task);
        addEvent(task.getTaskId(), null, TaskEventTypeEnum.START, "预约任务已生效", now);
        if (task.getRemindMinutes() != null && task.getRemindMinutes() > 0 && task.getDeadline() != null) {
            taskDao.updateRemind(task.getTaskId(),
                    task.getDeadline().minusMinutes(task.getRemindMinutes()), null, now);
        }
    }

    /**
     * 查询未删除的参与者（事务内重算状态用）
     */
    public List<TaskParticipantEntity> queryParticipants(Long taskId) {
        return taskParticipantDao.queryEntityByTaskId(taskId, Boolean.FALSE);
    }

    /**
     * 重算并落库聚合状态
     */
    public void refreshStatus(TaskEntity task) {
        List<TaskParticipantEntity> participants = queryParticipants(task.getTaskId());
        Integer newStatus = TaskStatusCalculator.calculate(task, participants);
        if (Objects.equals(newStatus, task.getStatus())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        int rows = taskDao.updateStatus(task.getTaskId(), ACTIVE_TASK_STATUS, newStatus, now);
        if (rows > 0) {
            task.setStatus(newStatus);
            task.setUpdateTime(now);
        }
    }

    private void insertParticipants(Long taskId, List<Long> memberIds, LocalDateTime now) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return;
        }
        List<TaskParticipantEntity> list = new ArrayList<>(memberIds.size());
        for (Long memberId : memberIds) {
            TaskParticipantEntity entity = new TaskParticipantEntity();
            entity.setTaskId(taskId);
            entity.setMemberId(memberId);
            entity.setStatus(ParticipantStatusEnum.PENDING.getValue());
            entity.setDeletedFlag(Boolean.FALSE);
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            list.add(entity);
        }
        taskParticipantDao.insertBatch(list);
    }

    private void addEvent(Long taskId, Long actorId, TaskEventTypeEnum type, String content, LocalDateTime now) {
        TaskEventEntity event = new TaskEventEntity();
        event.setTaskId(taskId);
        event.setActorId(actorId);
        event.setEventType(type.getValue());
        event.setContent(content);
        event.setCreateTime(now);
        taskEventDao.insert(event);
    }
}
