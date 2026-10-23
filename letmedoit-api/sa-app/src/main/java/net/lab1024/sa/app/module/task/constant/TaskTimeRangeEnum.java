package net.lab1024.sa.app.module.task.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import net.lab1024.sa.base.common.enumeration.BaseEnum;

/**
 * 列表的「创建时间」筛选范围
 * <p>
 * 只筛创建时间（什么时候派的活），不是截止时间。
 * 起点由服务端按服务器时区算，避免手机时区不同算出不同的「今天」。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum TaskTimeRangeEnum implements BaseEnum {

    /**
     * 不限（默认）：不传或传 0 都视为不限
     */
    ALL(0, "不限"),

    TODAY(1, "今天"),

    LAST_7_DAYS(2, "近 7 天"),

    LAST_30_DAYS(3, "近 30 天");

    private final Integer value;

    private final String desc;
}
