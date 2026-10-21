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
     * 定时生效时间，为空表示立即生效
     */
    private LocalDateTime startTime;

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
