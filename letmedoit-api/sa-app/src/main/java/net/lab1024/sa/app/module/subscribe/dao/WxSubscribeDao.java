package net.lab1024.sa.app.module.subscribe.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import net.lab1024.sa.app.module.subscribe.domain.entity.WxSubscribeEntity;
import org.apache.ibatis.annotations.Mapper;

/**
 * 订阅消息授权 DAO
 *
 * @author smart-admin
 */
@Mapper
public interface WxSubscribeDao extends BaseMapper<WxSubscribeEntity> {
}
