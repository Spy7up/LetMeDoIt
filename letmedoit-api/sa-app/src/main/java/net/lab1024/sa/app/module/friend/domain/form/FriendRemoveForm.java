package net.lab1024.sa.app.module.friend.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 解除好友
 *
 * @author letmedoit
 */
@Data
@Schema(description = "解除好友")
public class FriendRemoveForm {

    @Schema(description = "好友关系ID", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "好友关系ID不能为空")
    private Long friendId;
}
