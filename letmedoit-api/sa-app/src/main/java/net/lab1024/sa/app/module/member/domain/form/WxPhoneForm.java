package net.lab1024.sa.app.module.member.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 绑定手机号表单
 *
 * @author smart-admin
 */
@Data
public class WxPhoneForm {

    @Schema(description = "getPhoneNumber 返回的 code")
    @NotBlank(message = "code 不能为空")
    private String code;
}
