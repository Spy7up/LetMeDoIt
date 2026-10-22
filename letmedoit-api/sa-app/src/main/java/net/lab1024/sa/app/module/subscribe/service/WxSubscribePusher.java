package net.lab1024.sa.app.module.subscribe.service;

import com.alibaba.fastjson.JSON;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.config.SubscribePushConfig;
import net.lab1024.sa.app.config.WxProperties;
import net.lab1024.sa.app.module.notice.constant.NoticeTemplateEnum;
import net.lab1024.sa.app.module.notice.domain.entity.NoticeEntity;
import net.lab1024.sa.app.module.notice.domain.vo.NoticeVO;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 订阅消息投递（站内通知 → 微信卡片）
 * <p>
 * 设计要点：
 * 1. **内容已经在 t_task_notice 里了**，这里只做「按模板关键词装箱」，不重复传业务字段；
 * 2. 模板未配置（id 为空）时安静跳过——模板审核期间就是这样，业务完全不受影响；
 * 3. 全程不抛异常、不影响主流程，失败只有日志；
 * 4. 异步执行，且由调用方保证在事务提交后再进来（见 TaskNoticeService#pushAfterCommit）。
 *
 * @author letmedoit
 */
@Slf4j
@Service
public class WxSubscribePusher {

    /**
     * 微信关键词长度上限，超出会被接口拒绝（47003）
     */
    private static final int THING_MAX = 20;
    private static final int PHRASE_MAX = 5;
    private static final int TEXT_MAX = 32;

    /**
     * 值缺失时的占位，微信不接受空字符串
     */
    private static final String EMPTY_VALUE = "—";

    @Resource
    private WxProperties wxProperties;

    @Resource
    private WxSubscribeService wxSubscribeService;

    @Resource(name = SubscribePushConfig.EXECUTOR)
    private ThreadPoolTaskExecutor subscribePushExecutor;

    /**
     * 批量投递（异步）
     *
     * @param notices 刚落库的站内通知
     */
    public void pushAsync(List<NoticeEntity> notices) {
        if (CollectionUtils.isEmpty(notices)) {
            return;
        }
        List<NoticeEntity> batch = new ArrayList<>(notices);
        if (batch.size() > SubscribePushConfig.MAX_PUSH_PER_BATCH) {
            log.warn("订阅消息单批 {} 条超过上限 {}，其余只保留站内通知", batch.size(), SubscribePushConfig.MAX_PUSH_PER_BATCH);
            batch = new ArrayList<>(batch.subList(0, SubscribePushConfig.MAX_PUSH_PER_BATCH));
        }
        List<NoticeEntity> task = batch;
        try {
            subscribePushExecutor.execute(() -> {
                int ok = 0;
                for (NoticeEntity notice : task) {
                    if (pushOne(notice)) {
                        ok++;
                    }
                }
                log.info("订阅消息投递完成，成功 {}/{} 条", ok, task.size());
            });
        } catch (Exception e) {
            // 队列满或线程池关闭：订阅消息是可丢通道，站内通知已经落库，这里只记录
            log.warn("订阅消息投递任务提交失败，仅保留站内通知: {}", e.getMessage());
        }
    }

    /**
     * 投递单条
     *
     * @return 是否真的发出去了
     */
    private boolean pushOne(NoticeEntity notice) {
        try {
            if (notice == null || notice.getMemberId() == null) {
                return false;
            }
            String templateKey = notice.getTemplateKey();
            if (!StringUtils.hasText(templateKey)) {
                return false;
            }
            // 只有标了 wechat 的通知才走微信，其余三种只在站内展示
            NoticeTemplateEnum templateEnum = NoticeTemplateEnum.getByKey(templateKey);
            if (templateEnum == null || !templateEnum.isWechat()) {
                return false;
            }
            WxProperties.SubscribeTemplate template = wxProperties.getTemplate(templateKey);
            if (template == null) {
                // 模板还没审核通过 / 没配 id：正常状态，不打堆日志
                log.debug("订阅模板 {} 未配置，跳过微信投递", templateKey);
                return false;
            }
            Map<String, String> data = buildData(template, notice);
            if (CollectionUtils.isEmpty(data)) {
                log.warn("订阅消息数据为空，跳过, templateKey={}, noticeId={}", templateKey, notice.getNoticeId());
                return false;
            }
            String page = buildPage(template, notice);
            ResponseDTO<String> result = wxSubscribeService.send(notice.getMemberId(), template.getId().trim(), page, data);
            if (result != null && Boolean.TRUE.equals(result.getOk())) {
                return true;
            }
            log.debug("订阅消息未送达, templateKey={}, noticeId={}, msg={}",
                    templateKey, notice.getNoticeId(), result == null ? "null" : result.getMsg());
            return false;
        } catch (Exception e) {
            log.warn("订阅消息投递异常, noticeId={}", notice == null ? null : notice.getNoticeId(), e);
            return false;
        }
    }

    /**
     * 按模板关键词顺序装箱：第 k 个关键词 ← 第 k 行通知字段
     * <p>
     * 顺序必须和微信后台模板一致，所以 keywords 写在配置里，模板换了只改配置。
     */
    private Map<String, String> buildData(WxProperties.SubscribeTemplate template, NoticeEntity notice) {
        List<String> keywords = template.getKeywords();
        if (CollectionUtils.isEmpty(keywords)) {
            return null;
        }
        List<NoticeVO.Field> fields = parseFields(notice.getFieldsJson());
        if (CollectionUtils.isEmpty(fields)) {
            return null;
        }
        Map<String, String> data = new HashMap<>(keywords.size() * 2);
        for (int i = 0; i < keywords.size() && i < fields.size(); i++) {
            String keyword = keywords.get(i);
            if (!StringUtils.hasText(keyword)) {
                continue;
            }
            NoticeVO.Field field = fields.get(i);
            data.put(keyword.trim(), clip(field == null ? null : field.getValue(), keyword.trim()));
        }
        return data;
    }

    private List<NoticeVO.Field> parseFields(String fieldsJson) {
        if (!StringUtils.hasText(fieldsJson)) {
            return null;
        }
        try {
            return JSON.parseArray(fieldsJson, NoticeVO.Field.class);
        } catch (Exception e) {
            log.warn("通知字段 JSON 解析失败: {}", fieldsJson);
            return null;
        }
    }

    /**
     * 按关键词类型裁剪值：thing ≤20 字符、phrase ≤5 汉字、number 只留数字
     */
    private String clip(String value, String keyword) {
        String text = value == null ? "" : value.trim();
        if (!StringUtils.hasText(text)) {
            text = EMPTY_VALUE;
        }
        String type = keyword.replaceAll("[0-9]", "");
        if ("thing".equals(type)) {
            return cut(text, THING_MAX);
        }
        if ("phrase".equals(type)) {
            return cut(text, PHRASE_MAX);
        }
        if ("number".equals(type)) {
            String digits = text.replaceAll("[^0-9.]", "");
            return StringUtils.hasText(digits) ? digits : "0";
        }
        return cut(text, TEXT_MAX);
    }

    /**
     * 按「字符」截断（不是 char），避免把 emoji 的代理对切坏
     */
    private String cut(String text, int max) {
        if (text.codePointCount(0, text.length()) <= max) {
            return text;
        }
        int end = text.offsetByCodePoints(0, max);
        return text.substring(0, end);
    }

    /**
     * 拼接跳转页面：详情页需要带上任务 id，否则点开是空白
     */
    private String buildPage(WxProperties.SubscribeTemplate template, NoticeEntity notice) {
        String page = StringUtils.hasText(template.getPage()) ? template.getPage().trim() : "pages/tasks/detail/index";
        if (page.startsWith("/")) {
            page = page.substring(1);
        }
        if (notice.getTaskId() == null) {
            return page;
        }
        return page + (page.contains("?") ? "&" : "?") + "id=" + notice.getTaskId();
    }
}
