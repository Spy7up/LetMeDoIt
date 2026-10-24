package net.lab1024.sa.app.module.friend.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 邀请码预览：点开分享卡片的人看到的信息
 * <p>
 * 只暴露「谁邀请你」和「能不能加」，不带任何其他资料 —— 邀请码是公开传播的，
 * 别把对方的好友数、任务数之类的东西泄出去。
 *
 * @author letmedoit
 */
@Data
@Schema(description = "邀请码预览")
public class FriendInvitePreviewVO {

    @Schema(description = "邀请码")
    private String inviteCode;

    @Schema(description = "邀请人会员ID")
    private Long memberId;

    @Schema(description = "邀请人昵称")
    private String nickname;

    @Schema(description = "邀请人头像")
    private String avatar;

    @Schema(description = "是不是自己（自己点自己的卡片时前端直接跳好友列表）")
    private Boolean selfFlag;

    @Schema(description = "是否已经是好友")
    private Boolean friendFlag;
}
