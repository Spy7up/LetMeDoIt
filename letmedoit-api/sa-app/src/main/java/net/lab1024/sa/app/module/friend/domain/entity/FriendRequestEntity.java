package net.lab1024.sa.app.module.friend.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import net.lab1024.sa.app.module.friend.constant.FriendRequestStatusEnum;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 好友申请
 *
 * @author letmedoit
 */
@Data
@TableName("t_friend_request")
public class FriendRequestEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(type = IdType.AUTO)
    private Long requestId;

    /**
     * 发起人会员ID
     */
    private Long fromMemberId;

    /**
     * 接收人会员ID
     */
    private Long toMemberId;

    /**
     * 附言
     */
    private String applyMessage;

    /**
     * 状态
     *
     * @see FriendRequestStatusEnum
     */
    private Integer status;

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
