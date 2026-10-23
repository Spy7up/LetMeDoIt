package net.lab1024.sa.app.module.friend.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 我的邀请信息
 *
 * @author letmedoit
 */
@Data
@Schema(description = "我的邀请信息")
public class FriendInviteVO {

    @Schema(description = "邀请码")
    private String inviteCode;

    @Schema(description = "分享路径，小程序端拼分享卡片用")
    private String sharePath;
}
