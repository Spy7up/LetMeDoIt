package net.lab1024.sa.app.module.friend.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 好友关系（双向双写）
 *
 * @author letmedoit
 */
@Data
@TableName("t_friend")
public class FriendEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(type = IdType.AUTO)
    private Long friendId;

    /**
     * 归属会员ID
     */
    private Long memberId;

    /**
     * 好友会员ID
     */
    private Long friendMemberId;

    /**
     * 备注名
     */
    private String remark;

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
