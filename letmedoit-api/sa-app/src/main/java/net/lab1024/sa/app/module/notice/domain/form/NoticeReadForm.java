package net.lab1024.sa.app.module.notice.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * 通知标记已读
 *
 * @author letmedoit
 */
@Data
@Schema(description = "通知标记已读")
public class NoticeReadForm {

    @Schema(description = "通知ID集合，与 allFlag 二选一")
    private List<Long> noticeIds;

    @Schema(description = "是否全部已读，true 时忽略 noticeIds")
    private Boolean allFlag;
}
