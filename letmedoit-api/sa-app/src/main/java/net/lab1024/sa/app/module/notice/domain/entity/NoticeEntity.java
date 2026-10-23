package net.lab1024.sa.app.module.notice.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 服务通知
 *
 * @author letmedoit
 */
@Data
@TableName("t_task_notice")
public class NoticeEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(type = IdType.AUTO)
    private Long noticeId;

    /**
     * 收件人会员ID
     */
    private Long memberId;

    /**
     * 关联任务ID
     */
    private Long taskId;

    /**
     * 模板标识
     */
    private String templateKey;

    /**
     * 通知标题
     */
    private String title;

    /**
     * 卡片键值对，JSON 数组字符串 [{label,value}]
     */
    private String fieldsJson;

    /**
     * 是否已读
     */
    private Boolean readFlag;

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
