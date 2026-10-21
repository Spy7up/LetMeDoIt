package net.lab1024.sa.app.module.notice.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 服务通知模板
 * <p>
 * templateKey 与小程序端 config/notify.js、公众平台订阅消息模板三者保持一致。
 * title 是卡片上那行大标题（微信侧由模板固定，这里同步保存一份，便于消息中心渲染）。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum NoticeTemplateEnum {

    TASK_ASSIGNED("TASK_ASSIGNED", "任务委托通知"),

    TASK_REMIND("TASK_REMIND", "任务到期提醒"),

    TASK_COMPLETED("TASK_COMPLETED", "任务完成通知"),

    TASK_ALL_DONE("TASK_ALL_DONE", "全员完成通知");

    private final String key;

    private final String title;

    public static NoticeTemplateEnum getByKey(String key) {
        for (NoticeTemplateEnum item : values()) {
            if (item.getKey().equals(key)) {
                return item;
            }
        }
        return null;
    }
}
