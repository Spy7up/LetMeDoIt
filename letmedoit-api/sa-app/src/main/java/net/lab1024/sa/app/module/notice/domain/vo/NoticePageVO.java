package net.lab1024.sa.app.module.notice.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 通知分页结果（带未读数，前端一次拿到列表和红点）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "通知分页结果")
public class NoticePageVO {

    @Schema(description = "当前页")
    private Long pageNum;

    @Schema(description = "每页数量")
    private Long pageSize;

    @Schema(description = "总条数")
    private Long total;

    @Schema(description = "总页数")
    private Long pages;

    @Schema(description = "通知列表")
    private List<NoticeVO> list;

    @Schema(description = "未读数")
    private Integer unreadCount;
}
