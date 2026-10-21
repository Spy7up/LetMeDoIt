package net.lab1024.sa.app.module.task.service;

import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 聚合状态计算器
 * <p>
 * 这是整个产品最核心的一条规则，独立成类便于单测与后台复用：
 * 参与者状态 + 完成条件 → 任务聚合状态。
 * <p>
 * 判定顺序（顺序不能调）：
 * 1. 定时未开始且无人动作 → 预约中
 * 2. 全部拒绝/跳过 → 已拒绝
 * 3. 全员完成，或「任一人」模式有人完成 → 已完成
 * 4. 有人接受或完成 → 进行中
 * 5. 其余 → 待接受
 *
 * @author letmedoit
 */
public final class TaskStatusCalculator {

    private TaskStatusCalculator() {
    }

    /**
     * @param task         任务（读取 startTime / completionMode）
     * @param participants 未删除的参与者
     * @return 聚合状态值
     */
    public static Integer calculate(TaskEntity task, List<TaskParticipantEntity> participants) {
        if (CollectionUtils.isEmpty(participants)) {
            return TaskStatusEnum.PENDING.getValue();
        }

        boolean acted = participants.stream().anyMatch(p -> isAccepted(p) || isCompleted(p));

        // 1. 定时任务：到点前且无人动作，保持预约中
        if (task.getStartTime() != null && task.getStartTime().isAfter(LocalDateTime.now()) && !acted) {
            return TaskStatusEnum.SCHEDULED.getValue();
        }

        // 2. 没人还有效参与
        long activeCount = participants.stream().filter(p -> !isRejected(p) && !isSkipped(p)).count();
        if (activeCount == 0) {
            return TaskStatusEnum.REJECTED.getValue();
        }

        long doneCount = participants.stream().filter(TaskStatusCalculator::isCompleted).count();

        // 3. 全员完成 或 任一人完成
        if (doneCount == participants.size()) {
            return TaskStatusEnum.COMPLETED.getValue();
        }
        boolean anyMode = CompletionModeEnum.ANY.getValue().equals(task.getCompletionMode());
        if (anyMode && doneCount > 0) {
            return TaskStatusEnum.COMPLETED.getValue();
        }

        // 4. 有人已经接了
        if (acted) {
            return TaskStatusEnum.IN_PROGRESS.getValue();
        }
        return TaskStatusEnum.PENDING.getValue();
    }

    private static boolean isAccepted(TaskParticipantEntity participant) {
        return ParticipantStatusEnum.ACCEPTED.getValue().equals(participant.getStatus());
    }

    private static boolean isCompleted(TaskParticipantEntity participant) {
        return ParticipantStatusEnum.COMPLETED.getValue().equals(participant.getStatus());
    }

    private static boolean isRejected(TaskParticipantEntity participant) {
        return ParticipantStatusEnum.REJECTED.getValue().equals(participant.getStatus());
    }

    private static boolean isSkipped(TaskParticipantEntity participant) {
        return ParticipantStatusEnum.SKIPPED.getValue().equals(participant.getStatus());
    }
}
