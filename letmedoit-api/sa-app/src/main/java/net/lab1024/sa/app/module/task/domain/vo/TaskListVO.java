package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务列表项
 *
 * @author letmedoit
 */
@Data
@Schema(description = "任务列表项")
public class TaskListVO {

    @Schema(description = "任务ID")
    private Long taskId;

    @Schema(description = "任务标题")
    private String title;

    @Schema(description = "委托人会员ID，服务端组装用", hidden = true)
    private Long creatorId;

    @Schema(description = "聚合状态 0预约中 1待接受 2进行中 3已完成 4已拒绝 5已撤回")
    private Integer status;

    @Schema(description = "状态描述")
    private String statusDesc;

    @Schema(description = "是否逾期（派生，不落库）")
    private Boolean overdueFlag;

    @Schema(description = "截止时间")
    private LocalDateTime deadline;

    @Schema(description = "我的视角 1我收到的 2我发出的")
    private Integer role;

    @Schema(description = "完成条件 1任一人 2全员")
    private Integer completionMode;

    @Schema(description = "完成条件描述")
    private String completionModeDesc;

    @Schema(description = "参与者总数")
    private Integer participantCount;

    @Schema(description = "已完成人数")
    private Integer doneCount;

    @Schema(description = "参与者头像（最多 4 个，用于堆叠）")
    private List<TaskUserVO> participants;

    @Schema(description = "委托人")
    private TaskUserVO creator;

    @Schema(description = "我在任务里的参与状态，非参与者为空")
    private Integer myStatus;

    @Schema(description = "更新时间，列表按此倒序")
    private LocalDateTime updateTime;
}
