package net.lab1024.sa.base.module.support.dict.manager;

import jakarta.annotation.Resource;
import net.lab1024.sa.base.common.util.SmartBeanUtil;
import net.lab1024.sa.base.constant.CacheKeyConst;
import net.lab1024.sa.base.module.support.dict.dao.DictDao;
import net.lab1024.sa.base.module.support.dict.dao.DictDataDao;
import net.lab1024.sa.base.module.support.dict.domain.entity.DictDataEntity;
import net.lab1024.sa.base.module.support.dict.domain.entity.DictEntity;
import net.lab1024.sa.base.module.support.dict.domain.vo.DictDataVO;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;


/**
 * 数据字典 缓存
 *
 * @Author 1024创新实验室-主任-卓大
 * @Date 2025-03-25 22:25:04
 * @Copyright <a href="https://1024lab.net">1024创新实验室</a>
 */

@Service
public class DictManager {

    @Resource
    private DictDao dictDao;

    @Resource
    private DictDataDao dictDataDao;


    /**
     * 获取字典
     * <p>
     * unless：缓存配置是 disableCachingNullValues（禁止缓存 null 防穿透），
     * 字典项不存在时如果不排除 null 会直接抛 IllegalArgumentException。
     * 排除之后，缺失的字典项每次回查 DB，补上数据立刻生效，不用等缓存过期或重启。
     */
    @Cacheable(value = CacheKeyConst.Dict.DICT_DATA, key = "#dictCode + '_' + #dataValue", unless = "#result == null")
    public DictDataVO getDictData(String dictCode, String dataValue) {
        DictEntity dictEntity = dictDao.selectByCode(dictCode);
        if (dictEntity == null) {
            return null;
        }

        DictDataEntity dictDataEntity = dictDataDao.selectByDictIdAndValue(dictEntity.getDictId(), dataValue);
        return SmartBeanUtil.copy(dictDataEntity, DictDataVO.class);
    }

}
