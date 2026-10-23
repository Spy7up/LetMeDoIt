package net.lab1024.sa.app.module.task.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 任务里的用户精简信息（委托人 / 参与者 / 事件操作人共用）
 *
 * @author letmedoit
 */
@Data
public class TaskUserVO {

    @Schema(description = "会员ID")
    private Long memberId;

    @Schema(description = "昵称")
    private String nickname;

    @Schema(description = "头像")
    private String avatar;
}
