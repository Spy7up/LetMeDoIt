package net.lab1024.sa.app.module.task.domain.dto;

import lombok.Data;
import net.lab1024.sa.app.module.task.domain.form.TaskQueryForm;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务列表查询参数（DAO 入参）
 * <p>
 * 把所有状态常量由 service 传入，XML 里不出现写死的数字，
 * 改枚举值不需要动 SQL。后续后台报表可复用同一个参数对象。
 *
 * @author letmedoit
 */
@Data
public class TaskQueryParam {

    /**
     * 前端查询条件
     */
    private TaskQueryForm query;

    /**
     * 当前会员
     */
    private Long memberId;

    /**
     * 当前时间，判定逾期用
     */
    private LocalDateTime now;

    /**
     * 创建时间下界：按「今天 / 近 7 天 / 近 30 天」算好的起点，null 表示不限
     */
    private LocalDateTime createStartTime;

    /**
     * 删除标识，固定传 false
     */
    private Boolean deletedFlag;

    /**
     * 任务处于「未结束」的状态集合：预约中 / 待接受 / 进行中
     */
    private List<Integer> activeTaskStatusList;

    /**
     * 参与者已完成的状态值
     */
    private Integer doneParticipantStatus;
}
