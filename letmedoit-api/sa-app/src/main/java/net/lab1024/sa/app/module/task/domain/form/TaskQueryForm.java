package net.lab1024.sa.app.module.task.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.EqualsAndHashCode;
import net.lab1024.sa.app.module.task.constant.TaskRoleEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;
import net.lab1024.sa.app.module.task.constant.TaskTimeRangeEnum;
import net.lab1024.sa.base.common.domain.PageParam;
import net.lab1024.sa.base.common.swagger.SchemaEnum;
import net.lab1024.sa.base.common.validator.enumeration.CheckEnum;

/**
 * 任务列表查询
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "任务列表查询")
public class TaskQueryForm extends PageParam {

    @Schema(description = "视角 1我收到的 2我发出的", requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
    @SchemaEnum(desc = "查询视角", value = TaskRoleEnum.class)
    @NotNull(message = "请选择查询视角")
    @CheckEnum(value = TaskRoleEnum.class, message = "查询视角错误")
    private Integer role;

    @Schema(description = "聚合状态，不传表示全部", example = "1")
    @SchemaEnum(desc = "任务状态", value = TaskStatusEnum.class, required = false)
    @CheckEnum(value = TaskStatusEnum.class, message = "任务状态错误")
    private Integer status;

    @Schema(description = "只看逾期任务（派生状态，不是 t_task.status 的值）")
    private Boolean overdueFlag;

    @Schema(description = "创建时间范围 0不限 1今天 2近7天 3近30天，不传视为不限", example = "1")
    @SchemaEnum(desc = "创建时间范围", value = TaskTimeRangeEnum.class, required = false)
    @CheckEnum(value = TaskTimeRangeEnum.class, message = "创建时间范围错误")
    private Integer timeRange;

    @Schema(description = "标题关键词")
    private String keyword;
}
