package net.lab1024.sa.app.module.task.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 任务动作入参（接受 / 撤回 / 催办等只需任务ID的操作）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "任务动作")
public class TaskActionForm {

    @Schema(description = "任务ID", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "任务ID不能为空")
    private Long taskId;
}
