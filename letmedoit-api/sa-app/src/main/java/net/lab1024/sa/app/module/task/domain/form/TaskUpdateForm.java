package net.lab1024.sa.app.module.task.domain.form;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.base.common.swagger.SchemaEnum;
import net.lab1024.sa.base.common.validator.enumeration.CheckEnum;
import org.hibernate.validator.constraints.Length;

import java.time.LocalDateTime;

/**
 * 编辑任务（仅任务开始前允许）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "编辑任务")
public class TaskUpdateForm {

    @Schema(description = "任务ID", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "任务ID不能为空")
    private Long taskId;

    @Schema(description = "任务标题")
    @Length(max = 60, message = "标题最多 60 个字")
    private String title;

    @Schema(description = "交代内容")
    @Length(max = 500, message = "交代内容最多 500 个字")
    private String description;

    @Schema(description = "完成条件 1任一人 2全员")
    @SchemaEnum(desc = "完成条件", value = CompletionModeEnum.class, required = false)
    @CheckEnum(value = CompletionModeEnum.class, message = "完成条件错误")
    private Integer completionMode;

    @Schema(description = "截止时间 yyyy-MM-dd HH:mm:ss")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime deadline;

    @Schema(description = "提前提醒分钟数")
    private Integer remindMinutes;

    @Schema(description = "开始时间点（仅预约中的任务可改，yyyy-MM-dd HH:mm:ss）")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @Schema(description = "开始时间点到点是否通知参与者")
    private Boolean startNotifyFlag;

    @Schema(description = "是否清空开始时间点（委托人关掉开关时传 true，任务会退回待接受）")
    private Boolean removeStartTime;
}
