package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 任务参与者
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "任务参与者")
public class TaskParticipantVO extends TaskUserVO {

    @Schema(description = "参与状态 0待接受 1已接受 2已完成 3已拒绝 4已跳过")
    private Integer status;

    @Schema(description = "参与状态描述")
    private String statusDesc;

    @Schema(description = "完成时间")
    private LocalDateTime completeTime;

    @Schema(description = "完成备注")
    private String completeRemark;

    @Schema(description = "凭证图片")
    private List<String> completeImages;

    @Schema(description = "拒绝理由")
    private String rejectReason;
}
