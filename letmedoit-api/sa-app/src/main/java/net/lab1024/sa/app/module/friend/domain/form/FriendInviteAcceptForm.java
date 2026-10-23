package net.lab1024.sa.app.module.friend.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.hibernate.validator.constraints.Length;

/**
 * 输入邀请码加好友
 *
 * @author letmedoit
 */
@Data
@Schema(description = "输入邀请码加好友")
public class FriendInviteAcceptForm {

    @Schema(description = "邀请码", requiredMode = Schema.RequiredMode.REQUIRED, example = "K7M2QX")
    @NotBlank(message = "请输入邀请码")
    @Length(max = 8, message = "邀请码长度不正确")
    private String inviteCode;
}
