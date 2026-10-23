package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 完成条件
 * <p>
 * ANY：任一人完成即整单完成，其余人自动置为「已跳过」
 * ALL：所有人都完成才算完成
 * <p>
 * 展示文案以数据字典 TASK_COMPLETION_MODE 为准，desc 仅兜底。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum CompletionModeEnum implements BaseEnum {

    ANY(1, "任一人完成"),

    ALL(2, "全员完成");

    private final Integer value;

    private final String desc;
}
