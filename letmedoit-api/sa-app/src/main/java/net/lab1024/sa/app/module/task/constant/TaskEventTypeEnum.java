package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 任务事件类型（append-only，详情页时间线与后台追溯共用）
 * <p>
 * 展示文案以数据字典 TASK_EVENT_TYPE 为准，desc 仅兜底。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum TaskEventTypeEnum implements BaseEnum {

    CREATE(1, "创建任务"),

    INVITE(2, "邀请参与"),

    ACCEPT(3, "接受任务"),

    REJECT(4, "拒绝任务"),

    COMPLETE(5, "完成任务"),

    CANCEL(6, "撤回任务"),

    REMIND(7, "催办"),

    START(8, "定时生效"),

    SKIP(9, "自动跳过");

    private final Integer value;

    private final String desc;
}
