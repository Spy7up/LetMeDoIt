package net.lab1024.sa.app.module.member.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 小程序会员
 *
 * @author smart-admin
 */
@Data
@TableName("t_wx_member")
public class WxMemberEntity {

    @TableId(type = IdType.AUTO)
    private Long memberId;

    /**
     * 小程序 openid
     */
    private String openId;

    /**
     * 开放平台 unionid
     */
    private String unionId;

    private String nickname;

    private String avatar;

    /**
     * 手机号（微信授权获取，可信）
     */
    private String phone;

    /**
     * 邀请码（6 位，加好友用）
     */
    private String inviteCode;

    /**
     * 0 未知 1 男 2 女
     */
    private Integer gender;

    private Boolean disabledFlag;

    private Boolean deletedFlag;

    private LocalDateTime lastLoginTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
