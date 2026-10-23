package net.lab1024.sa.app.module.task.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.hibernate.validator.constraints.Length;

import java.util.List;

/**
 * 完成我这份
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "完成我这份")
public class TaskCompleteForm extends TaskActionForm {

    @Schema(description = "完成备注", example = "已晾好，白的单独晾的")
    @Length(max = 500, message = "备注最多 500 个字")
    private String remark;

    @Schema(description = "凭证图片 URL，最多 3 张")
    @Size(max = 3, message = "最多 3 张凭证")
    private List<String> images;
}
