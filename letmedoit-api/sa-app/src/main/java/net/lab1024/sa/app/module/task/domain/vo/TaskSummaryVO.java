package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 首页摘要（液态玻璃 banner 与分段角标用）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "首页摘要")
public class TaskSummaryVO {

    @Schema(description = "等我回应的任务数（我是参与者且待接受/在做）")
    private Integer assigneeCount;

    @Schema(description = "我派出且未结束的任务数")
    private Integer creatorCount;

    @Schema(description = "我这边已逾期的任务数")
    private Integer overdueCount;

    @Schema(description = "在等我的人（最多 3 个，用于头像堆叠）")
    private List<TaskUserVO> waitingUsers;
}
