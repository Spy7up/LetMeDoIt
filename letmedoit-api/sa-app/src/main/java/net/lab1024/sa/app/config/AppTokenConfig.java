package net.lab1024.sa.app.config;

import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.stp.StpLogic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 小程序端 Sa-Token 账号体系
 * <p>
 * 与后台（StpUtil / Authorization）完全隔离：
 * 1. loginType 不同，token 在 Redis 中的 key 前缀不同，互不识别
 * 2. token-name 不同，请求头不冲突
 * 3. SaTokenConfig 独立，会员不受后台三级等保 activeTimeout 影响
 *
 * @author smart-admin
 */
@Configuration
public class AppTokenConfig {

    /**
     * 账号体系标识
     */
    public static final String LOGIN_TYPE = "app";

    /**
     * 小程序端 token 请求头名称（与后台 Authorization 隔离）
     */
    public static final String TOKEN_NAME = "App-Token";

    public static final String BEAN_NAME = "stpAppLogic";

    @Bean(BEAN_NAME)
    public StpLogic stpAppLogic() {
        StpLogic logic = new StpLogic(LOGIN_TYPE);

        SaTokenConfig config = new SaTokenConfig();
        config.setTokenName(TOKEN_NAME);
        config.setTokenPrefix("Bearer");
        // 30 天
        config.setTimeout(2592000);
        // 关键：会员不因“长时间未操作”被冻结，与后台等保策略解耦
        config.setActiveTimeout(-1);
        // 同一会员只保留一个有效 token（换设备踢掉旧登录）
        config.setIsConcurrent(false);
        config.setIsShare(false);
        // 只从 header 读取，不读 cookie
        config.setIsReadCookie(false);
        config.setTokenStyle("simple-uuid");
        config.setAutoRenew(true);

        logic.setConfig(config);
        return logic;
    }
}
