package net.lab1024.sa.app.util;

import net.lab1024.sa.app.module.member.domain.RequestMember;
import net.lab1024.sa.base.common.domain.RequestUser;
import net.lab1024.sa.base.common.util.SmartRequestUtil;

/**
 * 小程序端请求上下文工具
 * <p>
 * 拦截器校验 token 后会把会员信息放入 ThreadLocal，业务代码可直接取，
 * 包含 openId / unionId / phone，无需再查库。
 *
 * @author smart-admin
 */
public final class AppRequestUtil {

    private AppRequestUtil() {
    }

    public static RequestMember getMember() {
        RequestUser requestUser = SmartRequestUtil.getRequestUser();
        if (requestUser instanceof RequestMember) {
            return (RequestMember) requestUser;
        }
        return null;
    }

    public static Long getMemberId() {
        RequestMember member = getMember();
        return member == null ? null : member.getMemberId();
    }

    /**
     * 微信 openid，下单支付、订阅消息都会用到
     */
    public static String getOpenId() {
        RequestMember member = getMember();
        return member == null ? null : member.getOpenId();
    }

    public static String getUnionId() {
        RequestMember member = getMember();
        return member == null ? null : member.getUnionId();
    }

    public static String getPhone() {
        RequestMember member = getMember();
        return member == null ? null : member.getPhone();
    }
}
