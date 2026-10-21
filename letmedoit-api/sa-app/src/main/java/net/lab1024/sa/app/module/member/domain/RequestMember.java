package net.lab1024.sa.app.module.member.domain;

import lombok.Data;
import net.lab1024.sa.base.common.domain.RequestUser;
import net.lab1024.sa.base.common.enumeration.UserTypeEnum;

import java.io.Serializable;

/**
 * 当前登录的小程序会员（请求上下文）
 * <p>
 * 拦截器校验 token 后放入 ThreadLocal，业务代码用 AppRequestUtil 直接获取，
 * 无需再查库，包含 openId / unionId / phone 等微信侧信息。
 *
 * @author smart-admin
 */
@Data
public class RequestMember implements RequestUser, Serializable {

    private Long memberId;

    private UserTypeEnum userType = UserTypeEnum.WX_MEMBER;

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

    private String phone;

    private Integer gender;

    private Boolean disabledFlag;

    private String ip;

    private String userAgent;

    @Override
    public Long getUserId() {
        return memberId;
    }

    @Override
    public String getUserName() {
        return nickname;
    }

    @Override
    public UserTypeEnum getUserType() {
        return userType;
    }
}
