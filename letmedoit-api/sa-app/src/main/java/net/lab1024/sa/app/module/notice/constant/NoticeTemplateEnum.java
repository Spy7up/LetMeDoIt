package net.lab1024.sa.app.module.notice.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * 服务通知模板
 * <p>
 * templateKey 与小程序端 config/notify.js、公众平台订阅消息模板三者保持一致。
 * title 是卡片上那行大标题（微信侧由模板固定，这里同步保存一份，便于消息中心渲染）。
 * <p>
 * wechat 表示这条通知是否走微信订阅消息：受「个人主体只能用一次性订阅」限制，
 * 我们只申请 4 个模板，任务开始 / 变更 / 撤回三种通知只在站内展示。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum NoticeTemplateEnum {

    TASK_ASSIGNED("TASK_ASSIGNED", "任务委托通知", true),

    TASK_REMIND("TASK_REMIND", "任务到期提醒", true),

    TASK_COMPLETED("TASK_COMPLETED", "任务完成通知", true),

    TASK_ALL_DONE("TASK_ALL_DONE", "全员完成通知", true),

    TASK_START("TASK_START", "任务开始通知", false),

    TASK_EDITED("TASK_EDITED", "任务变更通知", false),

    TASK_CANCELLED("TASK_CANCELLED", "任务取消通知", false);

    private final String key;

    private final String title;

    /**
     * 是否下发微信订阅消息（false 只写站内通知表）
     */
    private final boolean wechat;

    public static NoticeTemplateEnum getByKey(String key) {
        for (NoticeTemplateEnum item : values()) {
            if (item.getKey().equals(key)) {
                return item;
            }
        }
        return null;
    }

    /**
     * 会走微信订阅消息的模板，前端设置页与额度接口都以此为准
     */
    public static List<NoticeTemplateEnum> wechatList() {
        List<NoticeTemplateEnum> list = new ArrayList<>();
        for (NoticeTemplateEnum item : values()) {
            if (item.isWechat()) {
                list.add(item);
            }
        }
        return list;
    }
}
