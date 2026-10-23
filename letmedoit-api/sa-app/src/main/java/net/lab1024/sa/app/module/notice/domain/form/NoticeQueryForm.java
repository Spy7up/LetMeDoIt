package net.lab1024.sa.app.module.notice.domain.form;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import net.lab1024.sa.base.common.domain.PageParam;

/**
 * 服务通知查询
 *
 * @author letmedoit
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "服务通知查询")
public class NoticeQueryForm extends PageParam {

    @Schema(description = "只看未读，不传表示全部")
    private Boolean unreadFlag;
}
