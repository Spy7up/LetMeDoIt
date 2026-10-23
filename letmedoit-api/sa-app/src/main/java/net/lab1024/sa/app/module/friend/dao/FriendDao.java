package net.lab1024.sa.app.module.friend.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import net.lab1024.sa.app.module.friend.domain.entity.FriendEntity;
import net.lab1024.sa.app.module.friend.domain.vo.FriendVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 好友关系 DAO
 *
 * @author letmedoit
 */
@Mapper
public interface FriendDao extends BaseMapper<FriendEntity> {

    /**
     * 我的好友列表（含进行中任务数、最近互动时间，一次查询取完）
     *
     * @param memberId             当前会员
     * @param keyword              备注或昵称关键词，可为空
     * @param deletedFlag          删除标识
     * @param activeTaskStatusList 未结束的任务状态，由 service 传入
     * @return 好友列表
     */
    List<FriendVO> queryList(@Param("memberId") Long memberId,
                             @Param("keyword") String keyword,
                             @Param("deletedFlag") Boolean deletedFlag,
                             @Param("activeTaskStatusList") List<Integer> activeTaskStatusList);

    /**
     * 按主键查询关系
     *
     * @param friendId    关系ID
     * @param deletedFlag 删除标识
     * @return 关系
     */
    FriendEntity queryById(@Param("friendId") Long friendId, @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 查询两人之间的直接关系
     *
     * @param memberId       会员ID
     * @param friendMemberId 好友会员ID
     * @param deletedFlag    删除标识
     * @return 关系
     */
    FriendEntity queryByMemberAndFriend(@Param("memberId") Long memberId,
                                        @Param("friendMemberId") Long friendMemberId,
                                        @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 好友会员ID集合（建任务时校验参与者是否都是好友）
     *
     * @param memberId    当前会员
     * @param deletedFlag 删除标识
     * @return 好友会员ID
     */
    List<Long> queryFriendMemberIds(@Param("memberId") Long memberId,
                                    @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 好友数量
     *
     * @param memberId    当前会员
     * @param deletedFlag 删除标识
     * @return 数量
     */
    Integer countByMember(@Param("memberId") Long memberId, @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 建立关系：已存在（含被逻辑删除过）则复活，靠唯一索引保证不重复
     *
     * @param memberId       会员ID
     * @param friendMemberId 好友会员ID
     * @param now            当前时间
     * @return 受影响行数
     */
    int upsert(@Param("memberId") Long memberId,
                @Param("friendMemberId") Long friendMemberId,
                @Param("now") LocalDateTime now);

    /**
     * 解除好友：双向逻辑删除
     *
     * @param memberId       会员ID
     * @param friendMemberId 好友会员ID
     * @param updateTime     更新时间
     * @return 受影响行数（正常为 2）
     */
    int removeBoth(@Param("memberId") Long memberId,
                   @Param("friendMemberId") Long friendMemberId,
                   @Param("updateTime") LocalDateTime updateTime);
}
