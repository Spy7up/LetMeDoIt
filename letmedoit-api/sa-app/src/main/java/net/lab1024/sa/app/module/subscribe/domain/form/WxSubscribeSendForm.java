package net.lab1024.sa.app.module.subscribe.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

/**
 * 发送订阅消息（联调/业务触发用）
 *
 * @author smart-admin
 */
@Data
public class WxSubscribeSendForm {

    @Schema(description = "订阅消息模板ID")
    @NotBlank(message = "模板ID不能为空")
    private String templateId;

    @Schema(description = "点击跳转页面，如 pages/order/detail?id=1")
    private String page;

    @Schema(description = "模板数据，key 为模板字段名，value 为值")
    private Map<String, String> data;
}
