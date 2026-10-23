package net.lab1024.sa.app.module.task.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 参与者行（数据库直出，服务层再转 VO）
 * <p>
 * 凭证图片在库里是 JSON 字符串，这里保持 String，由服务层解析成 List，
 * 避免为每个 List 字段引入 TypeHandler。
 *
 * @author letmedoit
 */
@Data
public class TaskParticipantRow {

    /**
     * 任务ID
     */
    private Long taskId;

    /**
     * 参与者主键
     */
    private Long participantId;

    /**
     * 会员ID
     */
    private Long memberId;

    /**
     * 昵称
     */
    private String nickname;

    /**
     * 头像
     */
    private String avatar;

    /**
     * 参与状态
     */
    private Integer status;

    /**
     * 完成时间
     */
    private LocalDateTime completeTime;

    /**
     * 完成备注
     */
    private String completeRemark;

    /**
     * 凭证图片 JSON 数组字符串
     */
    private String completeImages;

    /**
     * 拒绝理由
     */
    private String rejectReason;
}
