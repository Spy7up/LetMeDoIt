package net.lab1024.sa.app.module.task.domain.form;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.base.common.swagger.SchemaEnum;
import net.lab1024.sa.base.common.validator.enumeration.CheckEnum;
import org.hibernate.validator.constraints.Length;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 布置任务
 *
 * @author letmedoit
 */
@Data
@Schema(description = "布置任务")
public class TaskAddForm {

    @Schema(description = "任务标题", requiredMode = Schema.RequiredMode.REQUIRED, example = "晾衣服")
    @NotBlank(message = "写一句要做什么吧")
    @Length(max = 60, message = "标题最多 60 个字")
    private String title;

    @Schema(description = "交代内容", example = "阳台的衣服，白的别和深色混")
    @Length(max = 500, message = "交代内容最多 500 个字")
    private String description;

    @Schema(description = "附图，公网 http(s) 地址，最多 6 张，选填")
    @Size(max = 6, message = "最多 6 张图")
    private List<String> images;

    @Schema(description = "参与者会员ID，1~10 个", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "至少选一个人")
    @Size(min = 1, max = 10, message = "一条任务最多 10 个人")
    private List<Long> memberIds;

    @Schema(description = "完成条件 1任一人 2全员", requiredMode = Schema.RequiredMode.REQUIRED, example = "2")
    @SchemaEnum(desc = "完成条件", value = CompletionModeEnum.class)
    @NotNull(message = "请选择完成条件")
    @CheckEnum(value = CompletionModeEnum.class, message = "完成条件错误")
    private Integer completionMode;

    @Schema(description = "截止时间 yyyy-MM-dd HH:mm:ss", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "请选择截止时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime deadline;

    @Schema(description = "定时生效时间，不传表示立即生效")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @Schema(description = "开始时间点到点是否通知参与者，不传默认是")
    private Boolean startNotifyFlag;

    @Schema(description = "提前提醒分钟数，0 不提醒", example = "10")
    private Integer remindMinutes;
}
