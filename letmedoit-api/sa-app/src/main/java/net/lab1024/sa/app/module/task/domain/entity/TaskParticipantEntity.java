package net.lab1024.sa.app.module.task.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import net.lab1024.sa.app.module.task.constant.ParticipantStatusEnum;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 任务参与者（任务里的一格）
 *
 * @author letmedoit
 */
@Data
@TableName("t_task_participant")
public class TaskParticipantEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(type = IdType.AUTO)
    private Long participantId;

    /**
     * 任务ID
     */
    private Long taskId;

    /**
     * 参与者会员ID
     */
    private Long memberId;

    /**
     * 参与状态
     *
     * @see ParticipantStatusEnum
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
     * 凭证图片，JSON 数组字符串
     */
    private String completeImages;

    /**
     * 拒绝理由
     */
    private String rejectReason;

    /**
     * 是否删除
     */
    private Boolean deletedFlag;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
