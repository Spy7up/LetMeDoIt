package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 我的统计（「我的」页四个数字）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "我的统计")
public class TaskStatsVO {

    @Schema(description = "我布置的任务数")
    private Integer sentCount;

    @Schema(description = "我参与的任务数")
    private Integer receivedCount;

    @Schema(description = "我完成自己那份的次数")
    private Integer completedCount;

    @Schema(description = "其中准时完成的次数，用于计算准时率")
    private Integer onTimeCount;

    @Schema(description = "准时完成率 0~1")
    private BigDecimal onTimeRate;

    @Schema(description = "好友数")
    private Integer friendCount;
}
