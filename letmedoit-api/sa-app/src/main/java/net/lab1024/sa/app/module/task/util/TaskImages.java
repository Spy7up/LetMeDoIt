package net.lab1024.sa.app.module.task.util;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 任务附图的存取
 * <p>
 * 库里只存一段 JSON 数组字符串（和 t_task_participant.complete_images 同款），
 * 读写的两侧都在这里收口，免得每个调用点各写一遍 split / join。
 * <p>
 * 三条硬规则，服务端必须自己判，不能指望客户端：
 * <ul>
 *     <li>只收公网 http(s) 地址 —— 微信临时路径（wxfile:// / http://tmp/）存进库，
 *         换台设备就是一张裂图，历史脏数据已经踩过一次</li>
 *     <li>最多 {@link #MAX_COUNT} 张，超出的直接丢，不报错（用户不会数着上传）</li>
 *     <li>单条 URL 不超过 {@link #MAX_URL_LENGTH}，防止有人往库里塞长字符串</li>
 * </ul>
 *
 * @author letmedoit
 */
public final class TaskImages {

    /**
     * 一条任务最多几张图
     */
    public static final int MAX_COUNT = 6;

    /**
     * 单条 URL 长度上限（对象存储的 key + 域名远小于这个数）
     */
    private static final int MAX_URL_LENGTH = 500;

    private TaskImages() {
    }

    /**
     * 清洗 + 去重 + 截断，返回可以直接用的地址列表
     */
    public static List<String> normalize(List<String> images) {
        List<String> result = new ArrayList<>();
        if (CollectionUtils.isEmpty(images)) {
            return result;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : images) {
            if (!StringUtils.hasText(raw)) {
                continue;
            }
            String url = raw.trim();
            if (url.length() > MAX_URL_LENGTH) {
                continue;
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                continue;
            }
            // 微信临时路径也是 http(s) 形态（http://tmp/xxx.jpeg），必须单独排掉。
            // 判定口径和 WxMemberService.isRemoteAvatar 保持一致。
            if (url.startsWith("wxfile://") || url.startsWith("http://tmp") || url.contains("/tmp/")) {
                continue;
            }
            seen.add(url);
            if (seen.size() >= MAX_COUNT) {
                break;
            }
        }
        result.addAll(seen);
        return result;
    }

    /**
     * 存库：永远返回合法 JSON 字符串，空列表就是 "[]"
     * <p>
     * 不返回 null 是有意的：updateById 会忽略 null 字段，
     * 那样「把图全删掉再保存」就永远写不进去，用户会以为没生效。
     */
    public static String toJson(List<String> images) {
        return JSON.toJSONString(normalize(images));
    }

    /**
     * 读库：解析失败一律当空列表，不让一条脏数据把详情页打挂
     */
    public static List<String> parse(String json) {
        List<String> result = new ArrayList<>();
        if (!StringUtils.hasText(json)) {
            return result;
        }
        try {
            JSONArray array = JSON.parseArray(json);
            if (array == null || array.isEmpty()) {
                return result;
            }
            for (int i = 0; i < array.size(); i++) {
                String url = array.getString(i);
                if (StringUtils.hasText(url)) {
                    result.add(url);
                }
            }
        } catch (Exception e) {
            return new ArrayList<>();
        }
        return result;
    }
}
