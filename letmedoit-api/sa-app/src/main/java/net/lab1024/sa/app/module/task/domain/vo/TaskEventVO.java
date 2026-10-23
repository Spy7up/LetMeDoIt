package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务事件
 *
 * @author letmedoit
 */
@Data
@Schema(description = "任务事件")
public class TaskEventVO {

    @Schema(description = "事件ID")
    private Long eventId;

    @Schema(description = "事件类型")
    private Integer eventType;

    @Schema(description = "事件类型描述")
    private String eventTypeDesc;

    @Schema(description = "事件描述")
    private String content;

    @Schema(description = "操作人，系统事件为空")
    private TaskUserVO actor;

    @Schema(description = "发生时间")
    private LocalDateTime createTime;
}
