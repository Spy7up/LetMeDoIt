package net.lab1024.sa.app.module.member.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 会员信息（返回给小程序）
 *
 * @author smart-admin
 */
@Data
public class WxMemberVO {

    @Schema(description = "会员ID")
    private Long memberId;

    @Schema(description = "昵称")
    private String nickname;

    @Schema(description = "头像")
    private String avatar;

    @Schema(description = "手机号")
    private String phone;

    @Schema(description = "邀请码（6位，加好友用）")
    private String inviteCode;

    @Schema(description = "性别 0未知 1男 2女")
    private Integer gender;
}
