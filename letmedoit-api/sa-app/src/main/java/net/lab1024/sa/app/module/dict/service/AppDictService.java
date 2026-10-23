package net.lab1024.sa.app.module.dict.service;

import jakarta.annotation.Resource;
import net.lab1024.sa.base.common.enumeration.BaseEnum;
import net.lab1024.sa.base.module.support.dict.service.DictService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 字典文案读取
 * <p>
 * 统一走 sa-base 的 DictService（Redis 缓存 + 后台可维护），返回值约定：
 * 1. 字典里配了就返回字典的 dataLabel；
 * 2. 字典还没初始化（例如新环境没跑 SQL）时退回枚举自带的 desc，保证接口不会返回空字符串；
 * 3. 两者都没有才返回空。
 * <p>
 * 注意：字典缓存由 sa-admin 在编辑字典时清理。如果是直接执行 SQL 初始化，
 * 请在启动服务之前执行，否则「空结果」会被缓存住，需要重启或清 dict_data_cache。
 *
 * @author letmedoit
 */
@Service
public class AppDictService {

    @Resource
    private DictService dictService;

    /**
     * 按字典编码 + 字典项值取显示名
     *
     * @param dictCode 字典编码，见 AppDictCode
     * @param value    字典项值，通常是对应表里的数字状态
     * @param fallback 字典缺失时的兜底文案，可为 null
     */
    public String label(String dictCode, Object value, String fallback) {
        String defaultText = fallback == null ? "" : fallback;
        if (value == null) {
            return defaultText;
        }
        try {
            String label = dictService.getDictDataLabel(dictCode, String.valueOf(value));
            return StringUtils.hasText(label) ? label : defaultText;
        } catch (Exception e) {
            // 字典读失败（缓存不可用、表未初始化等）绝不能影响主流程：退回枚举文案
            return defaultText;
        }
    }

    /**
     * 按枚举取显示名：字典优先，枚举 desc 兜底
     */
    public String label(String dictCode, BaseEnum enumItem) {
        if (enumItem == null) {
            return "";
        }
        return label(dictCode, enumItem.getValue(), enumItem.getDesc());
    }
}
