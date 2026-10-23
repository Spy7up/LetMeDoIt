package net.lab1024.sa.app.module.task.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import net.lab1024.sa.app.module.task.domain.dto.TaskParticipantRow;
import net.lab1024.sa.app.module.task.domain.entity.TaskParticipantEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 任务参与者 DAO
 * <p>
 * 所有 SQL 都在 XML 里；状态流转一律用「带期望状态的条件更新」，靠受影响行数判断是否被并发改过。
 *
 * @author letmedoit
 */
@Mapper
public interface TaskParticipantDao extends BaseMapper<TaskParticipantEntity> {

    /**
     * 批量插入参与者
     *
     * @param list 参与者实体
     * @return 受影响行数
     */
    int insertBatch(@Param("list") List<TaskParticipantEntity> list);

    /**
     * 查询某条任务的参与者（含会员昵称头像）
     *
     * @param taskId      任务ID
     * @param deletedFlag 删除标识
     * @return 参与者列表
     */
    List<TaskParticipantRow> queryByTaskId(@Param("taskId") Long taskId,
                                          @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 批量查询多条任务的参与者（列表页头像堆叠，避免 N+1）
     *
     * @param taskIds     任务ID集合，调用方保证非空
     * @param deletedFlag 删除标识
     * @return 参与者行
     */
    List<TaskParticipantRow> queryByTaskIds(@Param("taskIds") Collection<Long> taskIds,
                                            @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 查询任务的参与者实体（事务内重算聚合状态用，不带会员信息）
     *
     * @param taskId      任务ID
     * @param deletedFlag 删除标识
     * @return 参与者实体
     */
    List<TaskParticipantEntity> queryEntityByTaskId(@Param("taskId") Long taskId,
                                                    @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 批量查询多条任务的参与者实体（定时作业发提醒用）
     *
     * @param taskIds     任务ID集合
     * @param deletedFlag 删除标识
     * @return 参与者实体
     */
    List<TaskParticipantEntity> queryEntityByTaskIds(@Param("taskIds") Collection<Long> taskIds,
                                                     @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 查询任务里我的那一格
     *
     * @param taskId      任务ID
     * @param memberId    会员ID
     * @param deletedFlag 删除标识
     * @return 参与者
     */
    TaskParticipantEntity queryByTaskAndMember(@Param("taskId") Long taskId,
                                               @Param("memberId") Long memberId,
                                               @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 条件更新参与状态：只有当前状态等于 expectStatus 才更新，天然幂等
     *
     * @param participantId 参与者ID
     * @param expectStatus  期望的当前状态
     * @param status        目标状态
     * @param updateTime    更新时间
     * @return 受影响行数，0 表示状态已被改过
     */
    int updateStatus(@Param("participantId") Long participantId,
                     @Param("expectStatus") Integer expectStatus,
                     @Param("status") Integer status,
                     @Param("updateTime") LocalDateTime updateTime);

    /**
     * 完成自己那份（状态 + 备注 + 凭证 + 完成时间一起写）
     *
     * @param participantId 参与者ID
     * @param expectStatus  期望的当前状态
     * @param status        目标状态
     * @param completeTime  完成时间
     * @param remark        完成备注
     * @param images        凭证图片 JSON 字符串
     * @param updateTime    更新时间
     * @return 受影响行数
     */
    int updateComplete(@Param("participantId") Long participantId,
                       @Param("expectStatus") Integer expectStatus,
                       @Param("status") Integer status,
                       @Param("completeTime") LocalDateTime completeTime,
                       @Param("remark") String remark,
                       @Param("images") String images,
                       @Param("updateTime") LocalDateTime updateTime);

    /**
     * 拒绝任务
     *
     * @param participantId 参与者ID
     * @param expectStatus  期望的当前状态
     * @param status        目标状态
     * @param reason        拒绝理由
     * @param updateTime    更新时间
     * @return 受影响行数
     */
    int updateReject(@Param("participantId") Long participantId,
                     @Param("expectStatus") Integer expectStatus,
                     @Param("status") Integer status,
                     @Param("reason") String reason,
                     @Param("updateTime") LocalDateTime updateTime);

    /**
     * 「任一人完成」模式下，把其他还没完成的人置为已跳过
     *
     * @param taskId          任务ID
     * @param excludeMemberId 完成人的会员ID，不跳过
     * @param statusList      需要跳过的状态
     * @param targetStatus    目标状态
     * @param updateTime      更新时间
     * @return 受影响行数
     */
    int skipOthers(@Param("taskId") Long taskId,
                   @Param("excludeMemberId") Long excludeMemberId,
                   @Param("statusList") List<Integer> statusList,
                   @Param("targetStatus") Integer targetStatus,
                   @Param("updateTime") LocalDateTime updateTime);
}
