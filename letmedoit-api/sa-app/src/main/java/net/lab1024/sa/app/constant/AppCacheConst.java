package net.lab1024.sa.app.constant;

/**
 * 小程序端缓存 key
 *
 * @author smart-admin
 */
public class AppCacheConst {

    /**
     * 会员登录态（含微信用户信息），30 分钟过期，登录与资料变更时刷新
     */
    public static final String MEMBER_LOGIN = "app_member_login#30m";

    private AppCacheConst() {
    }
}
