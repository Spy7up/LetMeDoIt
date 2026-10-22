package net.lab1024.sa.app.config;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 微信小程序配置
 * <p>
 * 注意：appid / secret 只从环境变量注入，禁止写入代码仓库
 *
 * @author smart-admin
 */
@Slf4j
@Data
@Component
@ConfigurationProperties(prefix = "wx.miniapp")
public class WxProperties {

    /**
     * 小程序 appid
     */
    private String appid;

    /**
     * 小程序 secret
     */
    private String secret;

    /**
     * 本地无凭证时开启，用假 openid 跑通链路；生产必须为 false
     */
    private boolean mock = false;

    /**
     * 调用微信接口的超时时间（毫秒）
     */
    private int timeout = 5000;

    /**
     * 旧版模板白名单，保留兼容；新配置请用 subscribeTemplates
     */
    private List<String> subscribeTemplateIds = new ArrayList<>();

    /**
     * 订阅消息模板配置，key 与 NoticeTemplateEnum / 前端 config/notify.js 一一对应
     * <p>
     * 模板审核通过前 id 留空，投递层会直接跳过（只走站内通知），不影响业务。
     * 之所以做成配置而不是枚举常量：换模板 id 时只改环境变量，不用重新发版。
     */
    private Map<String, SubscribeTemplate> subscribeTemplates = new LinkedHashMap<>();

    /**
     * 订阅消息跳转版本：developer / trial / formal
     */
    private String miniprogramState = "formal";

    /**
     * 过滤掉占位符未替换产生的空串，避免白名单变成 ["",] 导致所有模板都被拒绝
     */
    public List<String> getSubscribeTemplateIds() {
        if (subscribeTemplateIds == null) {
            return new ArrayList<>();
        }
        List<String> result = new ArrayList<>(subscribeTemplateIds.size());
        for (String id : subscribeTemplateIds) {
            if (StringUtils.hasText(id)) {
                result.add(id.trim());
            }
        }
        return result;
    }

    /**
     * 取一个已配置（id 非空）的模板；未配置返回 null，调用方据此安静跳过
     *
     * @param key 模板标识，如 TASK_REMIND
     */
    public SubscribeTemplate getTemplate(String key) {
        if (!StringUtils.hasText(key) || subscribeTemplates == null || subscribeTemplates.isEmpty()) {
            return null;
        }
        SubscribeTemplate template = findByKey(key.trim());
        if (template == null || !StringUtils.hasText(template.getId())) {
            return null;
        }
        return template;
    }

    /**
     * 反查模板标识：订阅表存的是 templateId，展示与额度回显要 key
     */
    public String getKeyByTemplateId(String templateId) {
        if (!StringUtils.hasText(templateId) || subscribeTemplates == null || subscribeTemplates.isEmpty()) {
            return null;
        }
        String target = templateId.trim();
        for (Map.Entry<String, SubscribeTemplate> entry : subscribeTemplates.entrySet()) {
            SubscribeTemplate template = entry.getValue();
            if (template != null && target.equals(trim(template.getId()))) {
                return entry.getKey();
            }
        }
        return null;
    }

    /**
     * 当前生效的模板 id 列表（只含已填 id 的），用于下发前的白名单校验
     */
    public List<String> getConfiguredTemplateIds() {
        List<String> ids = new ArrayList<>();
        if (subscribeTemplates == null || subscribeTemplates.isEmpty()) {
            return ids;
        }
        for (SubscribeTemplate template : subscribeTemplates.values()) {
            if (template != null && StringUtils.hasText(template.getId())) {
                ids.add(template.getId().trim());
            }
        }
        return ids;
    }

    /**
     * YAML 里的 key 正常保序保大小写；这里再做一次忽略大小写的兜底，
     * 防止有人用 properties / 环境变量注入时 key 被转成小写导致匹配不上。
     */
    private SubscribeTemplate findByKey(String key) {
        SubscribeTemplate direct = subscribeTemplates.get(key);
        if (direct != null) {
            return direct;
        }
        for (Map.Entry<String, SubscribeTemplate> entry : subscribeTemplates.entrySet()) {
            if (key.equalsIgnoreCase(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    @PostConstruct
    public void check() {
        if (mock) {
            log.warn("【微信小程序】mock 模式已开启，不会真实调用微信接口，请勿在生产环境使用！");
            return;
        }
        if (!StringUtils.hasText(appid) || !StringUtils.hasText(secret)) {
            throw new IllegalStateException("wx.miniapp.appid / wx.miniapp.secret 未配置，请在环境变量中注入（本地开发可设置 wx.miniapp.mock=true）");
        }
        int configured = getConfiguredTemplateIds().size();
        if (configured == 0) {
            log.warn("【订阅消息】subscribe-templates 未配置任何模板 id，所有订阅消息只会跳过，仅站内通知生效");
        } else {
            log.info("【订阅消息】已配置 {} 个模板：{}", configured, getConfiguredTemplateIds());
        }
    }

    /**
     * 单个订阅消息模板
     */
    @Data
    public static class SubscribeTemplate {

        /**
         * 微信后台的模板 id，未审核通过先留空
         */
        private String id;

        /**
         * 点击卡片跳转的小程序页面（不带前导斜杠，不带 .html）
         */
        private String page = "pages/tasks/detail/index";

        /**
         * 模板关键词顺序，必须与微信后台模板完全一致，否则报 47003
         */
        private List<String> keywords = new ArrayList<>();
    }
}
