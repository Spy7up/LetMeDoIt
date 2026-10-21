package net.lab1024.sa.app.module.task.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.hibernate.validator.constraints.Length;

/**
 * 拒绝任务（只拒绝我自己那一格）
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "拒绝任务")
public class TaskRejectForm extends TaskActionForm {

    @Schema(description = "拒绝理由", requiredMode = Schema.RequiredMode.REQUIRED, example = "今晚不在家")
    @NotBlank(message = "说一句为什么吧")
    @Length(max = 200, message = "理由最多 200 个字")
    private String reason;
}
