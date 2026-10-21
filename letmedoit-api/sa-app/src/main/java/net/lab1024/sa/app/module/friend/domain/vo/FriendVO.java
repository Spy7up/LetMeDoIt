package net.lab1024.sa.app.module.friend.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 好友
 *
 * @author letmedoit
 */
@Data
@Schema(description = "好友")
public class FriendVO {

    @Schema(description = "好友关系ID")
    private Long friendId;

    @Schema(description = "好友会员ID")
    private Long memberId;

    @Schema(description = "好友昵称")
    private String nickname;

    @Schema(description = "好友头像")
    private String avatar;

    @Schema(description = "我给他的备注")
    private String remark;

    @Schema(description = "展示名：有备注用备注，否则用昵称")
    private String displayName;

    @Schema(description = "进行中的任务数")
    private Integer activeTaskCount;

    @Schema(description = "最近一次任务变动时间，用于列表排序（无任务时取关系建立时间）")
    private LocalDateTime lastActiveTime;
}
