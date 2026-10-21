package net.lab1024.sa.app.module.member.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 同步昵称头像
 *
 * @author smart-admin
 */
@Data
public class WxProfileForm {

    @Schema(description = "昵称")
    @Size(max = 64, message = "昵称最多64字符")
    private String nickname;

    @Schema(description = "头像URL")
    @Size(max = 500, message = "头像地址过长")
    private String avatar;
}
