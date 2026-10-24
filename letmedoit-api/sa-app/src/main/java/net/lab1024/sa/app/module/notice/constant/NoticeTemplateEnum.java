package net.lab1024.sa.app.module.notice.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * 服务通知模板
 * <p>
 * templateKey 与小程序端 config/notify.js、公众平台订阅消息模板三者保持一致。
 * title 是卡片上那行大标题（微信侧由模板固定，这里同步保存一份，便于消息中心渲染）。
 * <p>
 * 微信侧的关键取舍：受「个人主体只能用一次性订阅」限制，额度按模板分别记账，
 * 所以<b>多个站内通知共用一个微信模板</b>——接受 / 拒绝 / 完成 / 逾期都走
 * {@code TASK_STATUS}，靠 phrase 字段区分状态。这样创建者只需授权 1 次就能覆盖全部状态，
 * 而不是为每种状态各授权一个模板。
 * <p>
 * wxTemplateKey 为 null 表示只写站内通知表，不发微信卡片。
 *
 * @author letmedoit
 */
@Getter
@AllArgsConstructor
public enum NoticeTemplateEnum {

    /**
     * 参与者收：有人给你派活（或把你加进任务）
     */
    TASK_ASSIGNED("TASK_ASSIGNED", "任务委托通知", "TASK_ASSIGNED"),

    /**
     * 参与者收：快到截止时间了
     */
    TASK_REMIND("TASK_REMIND", "任务到期提醒", "TASK_REMIND"),

    /**
     * 创建者收：有人接受了任务
     */
    TASK_ACCEPTED("TASK_ACCEPTED", "任务被接受", "TASK_STATUS"),

    /**
     * 创建者收：有人拒绝了任务
     */
    TASK_REJECTED("TASK_REJECTED", "任务被拒绝", "TASK_STATUS"),

    /**
     * 创建者收：有人完成了自己那份
     */
    TASK_COMPLETED("TASK_COMPLETED", "任务完成通知", "TASK_STATUS"),

    /**
     * 创建者收：过了截止时间还没全部做完
     */
    TASK_OVERDUE("TASK_OVERDUE", "任务已逾期", "TASK_STATUS"),

    /**
     * 创建者 + 全体参与者：所有人都做完了
     */
    TASK_ALL_DONE("TASK_ALL_DONE", "全员完成通知", "TASK_ALL_DONE"),

    TASK_START("TASK_START", "任务开始通知", null),

    TASK_EDITED("TASK_EDITED", "任务变更通知", null),

    TASK_CANCELLED("TASK_CANCELLED", "任务取消通知", null);

    private final String key;

    private final String title;

    /**
     * 对应的微信订阅模板 key；null 表示只写站内通知，不发微信卡片
     */
    private final String wxTemplateKey;

    /**
     * 是否下发微信订阅消息（false 只写站内通知表）
     */
    public boolean isWechat() {
        return wxTemplateKey != null;
    }

    /**
     * 实际要用的微信模板 key，投递层按它取配置；不走微信的返回 null
     */
    public String wxKey() {
        return wxTemplateKey;
    }

    public static NoticeTemplateEnum getByKey(String key) {
        for (NoticeTemplateEnum item : values()) {
            if (item.getKey().equals(key)) {
                return item;
            }
        }
        return null;
    }

    /**
     * 会走微信订阅消息的站内通知（7 个）
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

    /**
     * 去重后的微信模板 key（4 个）
     * <p>
     * 额度接口和配置都以此为准：4 个状态共用 TASK_STATUS 一个模板，
     * 如果按 wechatList 逐个出，设置页会显示 4 行一模一样的额度，用户会以为有 4 份额度。
     */
    public static List<String> wechatTemplateKeys() {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (NoticeTemplateEnum item : values()) {
            if (item.wxTemplateKey != null) {
                set.add(item.wxTemplateKey);
            }
        }
        return new ArrayList<>(set);
    }

    /**
     * 取某个微信模板对应的第一个枚举，用于拿展示标题
     */
    public static NoticeTemplateEnum ofTemplateKey(String wxTemplateKey) {
        if (wxTemplateKey == null) {
            return null;
        }
        for (NoticeTemplateEnum item : values()) {
            if (wxTemplateKey.equals(item.wxTemplateKey)) {
                return item;
            }
        }
        return null;
    }
}
