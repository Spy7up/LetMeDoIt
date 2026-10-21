package net.lab1024.sa.app.module.member.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 小程序登录结果
 *
 * @author smart-admin
 */
@Data
public class WxLoginResultVO {

    @Schema(description = "token")
    private String token;

    @Schema(description = "token 请求头名称，前端需按此名称携带")
    private String tokenName;

    @Schema(description = "会员信息")
    private WxMemberVO member;

    @Schema(description = "是否新注册会员")
    private Boolean newUser;

    @Schema(description = "是否需要绑定手机号")
    private Boolean needBindPhone;
}
