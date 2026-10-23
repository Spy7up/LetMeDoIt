package net.lab1024.sa.app.module.subscribe.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 订阅授权上报
 *
 * @author smart-admin
 */
@Data
public class WxSubscribeRecordForm {

    @Schema(description = "订阅消息模板ID")
    @NotBlank(message = "模板ID不能为空")
    private String templateId;

    @Schema(description = "业务场景标识")
    private String scene;

    @Schema(description = "本次授权可发送次数，默认1")
    @Min(value = 1, message = "次数至少为1")
    @Max(value = 10, message = "次数过大")
    private Integer count = 1;
}
