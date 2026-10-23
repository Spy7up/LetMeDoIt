package net.lab1024.sa.app.module.task.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import net.lab1024.sa.app.module.task.constant.CompletionModeEnum;
import net.lab1024.sa.app.module.task.constant.TaskStatusEnum;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 任务
 *
 * @author letmedoit
 */
@Data
@TableName("t_task")
public class TaskEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务ID
     */
    @TableId(type = IdType.AUTO)
    private Long taskId;

    /**
     * 任务标题
     */
    private String title;

    /**
     * 交代内容
     */
    private String description;

    /**
     * 附图，JSON 数组字符串，存公网 URL
     * <p>
     * 和 t_task_participant.complete_images 同一种存法：任务说明的图是「布置时给的」，
     * 凭证图是「完成时交的」，两者语义不同所以不共用字段。
     */
    private String images;

    /**
     * 委托人会员ID
     */
    private Long creatorId;

    /**
     * 完成条件
     *
     * @see CompletionModeEnum
     */
    private Integer completionMode;

    /**
     * 聚合状态
     *
     * @see TaskStatusEnum
     */
    private Integer status;

    /**
     * 开始时间点，为空表示立即开始
     */
    private LocalDateTime startTime;

    /**
     * 开始时间点到点是否通知参与者（0 否 1 是）
     */
    private Boolean startNotifyFlag;

    /**
     * 截止时间
     */
    private LocalDateTime deadline;

    /**
     * 提前提醒分钟数，0 表示不提醒
     */
    private Integer remindMinutes;

    /**
     * 下次提醒时间，供定时任务扫描
     */
    private LocalDateTime remindTime;

    /**
     * 最后一次催办时间，用于催办限频
     */
    private LocalDateTime lastRemindTime;

    /**
     * 编辑次数：进行中只允许再改一次（改完 edit_count > 0 即锁定）
     */
    private Integer editCount;

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
