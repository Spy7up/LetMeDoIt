package net.lab1024.sa.app.module.task.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * 追加参与者
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "追加参与者")
public class TaskParticipantAddForm extends TaskActionForm {

    @Schema(description = "要追加的会员ID", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "请选择要加的人")
    @Size(min = 1, max = 10, message = "一条任务最多 10 个人")
    private List<Long> memberIds;
}
