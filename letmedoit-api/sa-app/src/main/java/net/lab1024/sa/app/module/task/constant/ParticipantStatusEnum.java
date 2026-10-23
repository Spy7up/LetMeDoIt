package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 参与者在任务中的状态（一人一格）
 * <p>
 * 与 t_task_participant.status 一一对应。
 * SKIPPED 只出现在「任一人完成」模式下：其他人做完后，剩余的人自动跳过。
 * <p>
 * 展示文案以数据字典 TASK_PARTICIPANT_STATUS 为准，desc 仅兜底。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum ParticipantStatusEnum implements BaseEnum {

    PENDING(0, "待接受"),

    ACCEPTED(1, "已接受"),

    COMPLETED(2, "已完成"),

    REJECTED(3, "已拒绝"),

    SKIPPED(4, "已跳过");

    private final Integer value;

    private final String desc;
}
