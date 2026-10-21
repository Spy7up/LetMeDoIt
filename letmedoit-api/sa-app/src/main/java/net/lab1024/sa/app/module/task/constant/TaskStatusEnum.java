package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 任务聚合状态
 * <p>
 * 由「参与者状态 + 完成条件」计算得出，写入时落库，不是每次查询实时计算。
 * 与 t_task.status 一一对应。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum TaskStatusEnum implements BaseEnum {

    SCHEDULED(0, "预约中"),

    PENDING(1, "待接受"),

    IN_PROGRESS(2, "进行中"),

    COMPLETED(3, "已完成"),

    REJECTED(4, "已拒绝"),

    CANCELLED(5, "已撤回");

    private final Integer value;

    private final String desc;
}
