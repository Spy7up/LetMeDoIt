package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 列表角色视角（仅查询用，不落库）
 * <p>
 * 同一条任务在不同人眼里文案与按钮不同，所以列表必须区分视角。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum TaskRoleEnum implements BaseEnum {

    ASSIGNEE(1, "我收到的"),

    CREATOR(2, "我发出的");

    private final Integer value;

    private final String desc;
}
