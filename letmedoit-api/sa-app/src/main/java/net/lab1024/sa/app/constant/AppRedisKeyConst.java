package net.lab1024.sa.app.constant;

/**
 * 小程序端 Redis key
 *
 * @author smart-admin
 */
public class AppRedisKeyConst {

    /**
     * 微信接口调用凭证
     */
    public static final String WX_ACCESS_TOKEN = "app:wx:access_token";

    /**
     * 获取 access_token 的分布式锁
     */
    public static final String WX_ACCESS_TOKEN_LOCK = "app:wx:access_token:lock";

    /**
     * 登录频率限制前缀，后接 IP
     */
    public static final String LOGIN_LIMIT_PREFIX = "app:login:limit:";

    private AppRedisKeyConst() {
    }
}
