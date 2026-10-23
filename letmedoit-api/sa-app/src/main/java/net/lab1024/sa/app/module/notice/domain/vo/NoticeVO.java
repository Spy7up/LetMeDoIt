package net.lab1024.sa.app.module.notice.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 服务通知（与微信服务通知同构：标题 + 键值行）
 *
 * @author letmedoit
 */
@Data
@Schema(description = "服务通知")
public class NoticeVO {

    @Schema(description = "通知ID")
    private Long noticeId;

    @Schema(description = "关联任务ID")
    private Long taskId;

    @Schema(description = "模板标识")
    private String templateKey;

    @Schema(description = "通知标题")
    private String title;

    @Schema(description = "卡片键值行，顺序即展示顺序")
    private List<Field> fields;

    @Schema(description = "是否已读")
    private Boolean readFlag;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    /**
     * 卡片的一行：左侧标签 + 右侧值
     */
    @Data
    @Schema(description = "通知字段")
    public static class Field {

        @Schema(description = "标签，如「任务名称」")
        private String label;

        @Schema(description = "值，如「晾衣服」")
        private String value;

        public Field() {
        }

        public Field(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
}
