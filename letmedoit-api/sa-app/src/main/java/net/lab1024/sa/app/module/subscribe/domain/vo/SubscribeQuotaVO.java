package net.lab1024.sa.app.module.subscribe.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 订阅消息额度（每个「用户 × 模板」一条）
 * <p>
 * 一次性订阅：授权一次只能发一条，前端设置页用它来显示「还能收到几条」。
 *
 * @author letmedoit
 */
@Data
@Schema(description = "订阅消息额度")
public class SubscribeQuotaVO {

    @Schema(description = "模板标识，如 TASK_REMIND")
    private String templateKey;

    @Schema(description = "模板标题")
    private String title;

    @Schema(description = "微信模板ID，未配置时为空")
    private String templateId;

    @Schema(description = "模板是否已配置（未配置说明审核中，前端置灰）")
    private Boolean configured;

    @Schema(description = "剩余可发送条数")
    private Integer remainCount;

    @Schema(description = "状态 1有效 0失效（用户拒绝或额度用尽）")
    private Integer status;

    @Schema(description = "最近一次授权时间")
    private LocalDateTime subscribeTime;
}
