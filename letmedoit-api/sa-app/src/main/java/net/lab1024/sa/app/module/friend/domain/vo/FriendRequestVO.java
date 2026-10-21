package net.lab1024.sa.app.module.friend.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import net.lab1024.sa.app.module.task.domain.vo.TaskUserVO;

import java.time.LocalDateTime;

/**
 * 好友申请
 *
 * @author letmedoit
 */
@Data
@Schema(description = "好友申请")
public class FriendRequestVO {

    @Schema(description = "申请ID")
    private Long requestId;

    @Schema(description = "申请人")
    private TaskUserVO fromMember;

    @Schema(description = "附言")
    private String applyMessage;

    @Schema(description = "申请时间")
    private LocalDateTime createTime;
}
