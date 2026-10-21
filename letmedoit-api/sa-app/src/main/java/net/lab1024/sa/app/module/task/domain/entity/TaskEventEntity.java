package net.lab1024.sa.app.module.task.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import net.lab1024.sa.app.module.task.constant.TaskEventTypeEnum;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 任务事件（append-only）
 *
 * @author letmedoit
 */
@Data
@TableName("t_task_event")
public class TaskEventEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(type = IdType.AUTO)
    private Long eventId;

    /**
     * 任务ID
     */
    private Long taskId;

    /**
     * 操作人会员ID，系统事件为空
     */
    private Long actorId;

    /**
     * 事件类型
     *
     * @see TaskEventTypeEnum
     */
    private Integer eventType;

    /**
     * 事件描述
     */
    private String content;

    /**
     * 发生时间
     */
    private LocalDateTime createTime;
}
