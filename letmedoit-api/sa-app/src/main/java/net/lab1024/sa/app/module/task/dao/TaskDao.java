package net.lab1024.sa.app.module.task.dao;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import net.lab1024.sa.app.module.task.domain.dto.TaskQueryParam;
import net.lab1024.sa.app.module.task.domain.entity.TaskEntity;
import net.lab1024.sa.app.module.task.domain.vo.TaskListVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskStatsVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskSummaryVO;
import net.lab1024.sa.app.module.task.domain.vo.TaskUserVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务 DAO
 * <p>
 * 所有 SQL 都在 XML 里，禁止使用 Wrapper；
 * 状态常量一律由 service 传入，XML 不写死数字。
 *
 * @author letmedoit
 */
@Mapper
public interface TaskDao extends BaseMapper<TaskEntity> {

    /**
     * 分页查询任务列表
     *
     * @param param 查询参数（含状态常量）
     * @param page  分页参数
     * @return 列表
     */
    List<TaskListVO> queryPage(@Param("param") TaskQueryParam param, Page<?> page);

    /**
     * 按主键查询未删除的任务
     *
     * @param taskId      任务ID
     * @param deletedFlag 删除标识
     * @return 任务
     */
    TaskEntity queryById(@Param("taskId") Long taskId, @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 条件更新聚合状态：只有当前状态在 expectStatusList 里才更新，防并发破坏状态机
     *
     * @param taskId           任务ID
     * @param expectStatusList 期望的当前状态集合
     * @param status           目标状态
     * @param updateTime       更新时间
     * @return 受影响行数，0 表示状态已变
     */
    int updateStatus(@Param("taskId") Long taskId,
                     @Param("expectStatusList") List<Integer> expectStatusList,
                     @Param("status") Integer status,
                     @Param("updateTime") LocalDateTime updateTime);

    /**
     * 清空开始时间点（委托人在编辑时关掉「开始时间点」）。
     * 用独立 SQL 是因为 updateById 会忽略 null 字段，清不掉。
     *
     * @param taskId     任务ID
     * @param updateTime 更新时间
     * @return 受影响行数
     */
    int clearStartTime(@Param("taskId") Long taskId, @Param("updateTime") LocalDateTime updateTime);

    /**
     * 更新提醒信息（创建、编辑、催办后调用）
     *
     * @param taskId         任务ID
     * @param remindTime     下次提醒时间，null 表示清除
     * @param lastRemindTime 最后一次催办时间，null 表示不改
     * @param updateTime     更新时间
     * @return 受影响行数
     */
    int updateRemind(@Param("taskId") Long taskId,
                     @Param("remindTime") LocalDateTime remindTime,
                     @Param("lastRemindTime") LocalDateTime lastRemindTime,
                     @Param("updateTime") LocalDateTime updateTime);

    /**
     * 首页摘要的数量部分（一次查询取三个计数，避免三次往返）
     *
     * @param memberId                     当前会员
     * @param now                          当前时间
     * @param activeTaskStatusList         未结束的任务状态
     * @param actionableParticipantStatus  需要我动的参与状态（待接受 / 已接受）
     * @param deletedFlag                  删除标识
     * @return 只填 assigneeCount / creatorCount / overdueCount
     */
    TaskSummaryVO querySummaryCount(@Param("memberId") Long memberId,
                                    @Param("now") LocalDateTime now,
                                    @Param("activeTaskStatusList") List<Integer> activeTaskStatusList,
                                    @Param("actionableParticipantStatus") List<Integer> actionableParticipantStatus,
                                    @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 在等我的人（去重）
     *
     * @param memberId                     当前会员
     * @param activeTaskStatusList         未结束的任务状态
     * @param actionableParticipantStatus  需要我动的参与状态
     * @param deletedFlag                  删除标识
     * @param limit                        取几个
     * @return 委托人列表
     */
    List<TaskUserVO> queryWaitingUsers(@Param("memberId") Long memberId,
                                       @Param("activeTaskStatusList") List<Integer> activeTaskStatusList,
                                       @Param("actionableParticipantStatus") List<Integer> actionableParticipantStatus,
                                       @Param("deletedFlag") Boolean deletedFlag,
                                       @Param("limit") Integer limit);

    /**
     * 我的统计
     *
     * @param memberId    当前会员
     * @param doneStatus  参与者已完成状态
     * @param deletedFlag 删除标识
     * @return 统计
     */
    TaskStatsVO queryStats(@Param("memberId") Long memberId,
                           @Param("doneStatus") Integer doneStatus,
                           @Param("deletedFlag") Boolean deletedFlag);

    /**
     * 查询已到生效时间的预约任务（定时作业扫描）
     *
     * @param now             当前时间
     * @param scheduledStatus 预约中状态
     * @param limit           批量上限
     * @return 任务列表
     */
    List<TaskEntity> queryScheduledToActivate(@Param("now") LocalDateTime now,
                                              @Param("scheduledStatus") Integer scheduledStatus,
                                              @Param("limit") Integer limit);

    /**
     * 查询需要下发提醒的任务（定时任务扫描）
     *
     * @param now         当前时间
     * @param deletedFlag 删除标识
     * @param limit       批量上限
     * @return 任务列表
     */
    List<TaskEntity> queryRemindList(@Param("now") LocalDateTime now,
                                     @Param("deletedFlag") Boolean deletedFlag,
                                     @Param("limit") Integer limit);

    /**
     * 查询已过截止时间但还没结束的任务（逾期通知扫描）
     * <p>
     * 只扫最近一段时间内逾期的，避免上线时把半年前的老任务一次性补发一遍。
     * 是否已经通知过由调用方按 t_task_notice 判重。
     *
     * @param since       只处理这个时间之后截止的（now - 窗口）
     * @param now         当前时间
     * @param status      任务状态（进行中）
     * @param deletedFlag 删除标识
     * @param limit       批量上限
     * @return 任务列表
     */
    List<TaskEntity> queryOverdueList(@Param("since") LocalDateTime since,
                                      @Param("now") LocalDateTime now,
                                      @Param("status") Integer status,
                                      @Param("deletedFlag") Boolean deletedFlag,
                                      @Param("limit") Integer limit);
}
