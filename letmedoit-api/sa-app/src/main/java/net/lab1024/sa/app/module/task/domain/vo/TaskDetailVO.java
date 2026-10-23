package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务详情
 *
 * @author letmedoit
 */
@Data
@Schema(description = "任务详情")
public class TaskDetailVO {

    @Schema(description = "任务ID")
    private Long taskId;

    @Schema(description = "任务标题")
    private String title;

    @Schema(description = "交代内容")
    private String description;

    @Schema(description = "附图，公网 URL，最多 6 张")
    private List<String> images;

    @Schema(description = "委托人")
    private TaskUserVO creator;

    @Schema(description = "参与者列表")
    private List<TaskParticipantVO> participants;

    @Schema(description = "完成条件 1任一人 2全员")
    private Integer completionMode;

    @Schema(description = "完成条件描述")
    private String completionModeDesc;

    @Schema(description = "聚合状态")
    private Integer status;

    @Schema(description = "状态描述")
    private String statusDesc;

    @Schema(description = "定时生效时间")
    private LocalDateTime startTime;

    @Schema(description = "开始时间点到点是否通知参与者")
    private Boolean startNotifyFlag;

    @Schema(description = "截止时间")
    private LocalDateTime deadline;

    @Schema(description = "提前提醒分钟数")
    private Integer remindMinutes;

    @Schema(description = "是否逾期")
    private Boolean overdueFlag;

    @Schema(description = "参与者总数")
    private Integer totalCount;

    @Schema(description = "已完成人数")
    private Integer doneCount;

    @Schema(description = "已接受人数")
    private Integer acceptedCount;

    @Schema(description = "已拒绝人数")
    private Integer rejectedCount;

    @Schema(description = "已跳过人数")
    private Integer skippedCount;

    @Schema(description = "我在任务里的那一格，非参与者为空")
    private TaskParticipantVO me;

    @Schema(description = "我是否是委托人")
    private Boolean creatorFlag;

    @Schema(description = "是否可接受")
    private Boolean canAccept;

    @Schema(description = "是否可拒绝")
    private Boolean canReject;

    @Schema(description = "是否可完成")
    private Boolean canComplete;

    @Schema(description = "是否可撤回")
    private Boolean canCancel;

    @Schema(description = "是否可催办")
    private Boolean canRemind;

    @Schema(description = "是否可追加参与者")
    private Boolean canAddParticipant;

    @Schema(description = "是否可编辑")
    private Boolean canEdit;

    @Schema(description = "事件时间线")
    private List<TaskEventVO> events;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}
