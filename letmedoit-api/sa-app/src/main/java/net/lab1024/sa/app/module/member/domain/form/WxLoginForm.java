package net.lab1024.sa.app.module.member.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 小程序登录表单
 *
 * @author smart-admin
 */
@Data
public class WxLoginForm {

    @Schema(description = "wx.login 返回的 code（5 分钟有效，一次性）")
    @NotBlank(message = "code 不能为空")
    private String code;
}
