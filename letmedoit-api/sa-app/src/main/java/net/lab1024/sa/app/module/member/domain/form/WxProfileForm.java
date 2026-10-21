package net.lab1024.sa.app.module.member.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 设定昵称头像（每个会员只能成功一次）
 *
 * @author smart-admin
 */
@Data
public class WxProfileForm {

    @Schema(description = "昵称")
    @Size(max = 20, message = "昵称最多20个字")
    private String nickname;

    @Schema(description = "头像URL")
    @Size(max = 500, message = "头像地址过长")
    private String avatar;
}
