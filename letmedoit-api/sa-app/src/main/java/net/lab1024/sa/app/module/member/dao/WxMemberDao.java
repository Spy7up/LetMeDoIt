package net.lab1024.sa.app.module.member.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

/**
 * 小程序会员 DAO
 *
 * @author smart-admin
 */
@Mapper
public interface WxMemberDao extends BaseMapper<WxMemberEntity> {

    /**
     * 批量查询会员
     * <p>
     * 任务参与者、好友列表等处统一走 IN 批量取，禁止在循环里单条查
     *
     * @param memberIds 会员ID集合，调用方需保证非空
     * @return 会员列表
     */
    List<WxMemberEntity> queryByIds(@Param("memberIds") Collection<Long> memberIds);

    /**
     * 按邀请码查询会员
     *
     * @param inviteCode 邀请码
     * @return 会员
     */
    WxMemberEntity queryByInviteCode(@Param("inviteCode") String inviteCode);
}
