package net.lab1024.sa.app.module.wx;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.config.WxProperties;
import net.lab1024.sa.app.constant.AppRedisKeyConst;
import net.lab1024.sa.app.module.wx.domain.WxSessionVO;
import net.lab1024.sa.base.common.exception.BusinessException;
import net.lab1024.sa.base.module.support.redis.RedisService;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 微信小程序接口封装
 * <p>
 * 只负责与微信通信，不含业务逻辑；session_key 仅在方法内部使用，不对外暴露
 *
 * @author smart-admin
 */
@Slf4j
@Service
public class WxApiService {

    private static final String URL_CODE2SESSION = "https://api.weixin.qq.com/sns/jscode2session";

    private static final String URL_ACCESS_TOKEN = "https://api.weixin.qq.com/cgi-bin/token";

    private static final String URL_PHONE = "https://api.weixin.qq.com/wxa/business/getuserphonenumber";

    private static final String URL_SUBSCRIBE_SEND = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send";

    /**
     * access_token 提前过期时间，避免边界失效
     */
    private static final int TOKEN_EXPIRE_AHEAD_SECONDS = 300;

    /**
     * 微信 access_token 失效错误码
     */
    private static final int ERR_TOKEN_INVALID = 42001;

    @Resource
    private WxProperties wxProperties;

    @Resource
    private RedisService redisService;

    @Resource
    private RedissonClient redissonClient;

    /**
     * code 换 openid
     */
    public WxSessionVO jscode2session(String code) {
        if (wxProperties.isMock()) {
            WxSessionVO mock = new WxSessionVO();
            mock.setOpenId("mock_" + SecureUtil.md5(code));
            mock.setUnionId("mock_union_" + SecureUtil.md5(code));
            log.warn("【mock】jscode2session code={} openId={}", code, mock.getOpenId());
            return mock;
        }

        Map<String, Object> params = new HashMap<>(8);
        params.put("appid", wxProperties.getAppid());
        params.put("secret", wxProperties.getSecret());
        params.put("js_code", code);
        params.put("grant_type", "authorization_code");

        String body = HttpUtil.get(URL_CODE2SESSION, params, wxProperties.getTimeout());
        JSONObject json = parse(body, "code2session");

        int errcode = json.getInt("errcode", 0);
        if (errcode != 0) {
            log.warn("微信 code2session 失败, errcode={}, errmsg={}", errcode, json.getStr("errmsg"));
            throw new BusinessException("微信登录失败，请重试");
        }

        String openId = json.getStr("openid");
        if (StrUtil.isBlank(openId)) {
            throw new BusinessException("微信登录失败，请重试");
        }

        WxSessionVO session = new WxSessionVO();
        session.setOpenId(openId);
        session.setUnionId(json.getStr("unionid"));
        session.setSessionKey(json.getStr("session_key"));
        return session;
    }

    /**
     * 获取接口调用凭证（Redis 缓存 + 分布式锁单飞，防止并发刷新互相顶掉）
     */
    public String getAccessToken() {
        if (wxProperties.isMock()) {
            return "mock_access_token";
        }

        String cached = redisService.get(AppRedisKeyConst.WX_ACCESS_TOKEN);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }

        RLock lock = redissonClient.getLock(AppRedisKeyConst.WX_ACCESS_TOKEN_LOCK);
        try {
            if (!lock.tryLock(3, 10, TimeUnit.SECONDS)) {
                throw new BusinessException("微信服务繁忙，请稍后重试");
            }
            // 双重检查
            cached = redisService.get(AppRedisKeyConst.WX_ACCESS_TOKEN);
            if (StrUtil.isNotBlank(cached)) {
                return cached;
            }

            Map<String, Object> params = new HashMap<>(4);
            params.put("grant_type", "client_credential");
            params.put("appid", wxProperties.getAppid());
            params.put("secret", wxProperties.getSecret());

            String body = HttpUtil.get(URL_ACCESS_TOKEN, params, wxProperties.getTimeout());
            JSONObject json = parse(body, "getAccessToken");

            int errcode = json.getInt("errcode", 0);
            if (errcode != 0) {
                log.error("获取微信 access_token 失败, errcode={}, errmsg={}", errcode, json.getStr("errmsg"));
                throw new BusinessException("微信服务异常，请稍后重试");
            }

            String accessToken = json.getStr("access_token");
            long expiresIn = json.getLong("expires_in", 7200L);
            long ttl = Math.max(expiresIn - TOKEN_EXPIRE_AHEAD_SECONDS, 60L);
            redisService.set(AppRedisKeyConst.WX_ACCESS_TOKEN, accessToken, ttl);
            return accessToken;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("微信凭证获取被中断，请重试");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 清除凭证缓存（凭证失效时调用）
     */
    public void clearAccessToken() {
        redisService.delete(AppRedisKeyConst.WX_ACCESS_TOKEN);
    }

    /**
     * 用 getPhoneNumber 的 code 换取手机号（服务端解密，可信）
     *
     * @return 纯手机号（不含区号）
     */
    public String getPhoneNumber(String code) {
        if (wxProperties.isMock()) {
            log.warn("【mock】getPhoneNumber code={} 返回默认手机号", code);
            return "13800000000";
        }

        JSONObject json = postPhone(code, getAccessToken());
        int errcode = json.getInt("errcode", 0);
        if (errcode == ERR_TOKEN_INVALID) {
            // 凭证被其他实例刷新，清缓存重试一次
            clearAccessToken();
            json = postPhone(code, getAccessToken());
            errcode = json.getInt("errcode", 0);
        }
        if (errcode != 0) {
            log.warn("获取手机号失败, errcode={}, errmsg={}", errcode, json.getStr("errmsg"));
            throw new BusinessException("获取手机号失败，请重试");
        }

        JSONObject phoneInfo = json.getJSONObject("phone_info");
        if (phoneInfo == null) {
            throw new BusinessException("获取手机号失败，请重试");
        }
        String phone = phoneInfo.getStr("purePhoneNumber");
        if (StrUtil.isBlank(phone)) {
            throw new BusinessException("获取手机号失败，请重试");
        }
        return phone;
    }

    /**
     * 发送订阅消息
     *
     * @return 微信 errcode，0 表示成功
     */
    public int sendSubscribeMessage(String openId, String templateId, String page, Map<String, Object> data) {
        if (wxProperties.isMock()) {
            log.warn("【mock】sendSubscribeMessage openId={}, templateId={}, data={}", openId, templateId, data);
            return 0;
        }

        int errcode = doSendSubscribe(openId, templateId, page, data, getAccessToken());
        if (errcode == ERR_TOKEN_INVALID) {
            clearAccessToken();
            errcode = doSendSubscribe(openId, templateId, page, data, getAccessToken());
        }
        return errcode;
    }

    private int doSendSubscribe(String openId, String templateId, String page, Map<String, Object> data, String accessToken) {
        JSONObject body = JSONUtil.createObj()
                .set("touser", openId)
                .set("template_id", templateId)
                .set("page", StrUtil.blankToDefault(page, "pages/index/index"))
                .set("data", data)
                .set("miniprogram_state", wxProperties.getMiniprogramState())
                .set("lang", "zh_CN");

        String resp = HttpRequest.post(URL_SUBSCRIBE_SEND + "?access_token=" + accessToken)
                .body(body.toString())
                .timeout(wxProperties.getTimeout())
                .execute()
                .body();

        JSONObject json = parse(resp, "sendSubscribeMessage");
        int errcode = json.getInt("errcode", 0);
        if (errcode != 0) {
            log.warn("发送订阅消息失败, openId={}, templateId={}, errcode={}, errmsg={}",
                    openId, templateId, errcode, json.getStr("errmsg"));
        }
        return errcode;
    }

    private JSONObject postPhone(String code, String accessToken) {
        String body = JSONUtil.createObj().set("code", code).toString();
        String resp = HttpRequest.post(URL_PHONE + "?access_token=" + accessToken)
                .body(body)
                .timeout(wxProperties.getTimeout())
                .execute()
                .body();
        return parse(resp, "getPhoneNumber");
    }

    private JSONObject parse(String body, String api) {
        if (StrUtil.isBlank(body)) {
            throw new BusinessException("微信接口无响应：" + api);
        }
        try {
            return JSONUtil.parseObj(body);
        } catch (Exception e) {
            log.error("微信接口返回解析失败, api={}, body={}", api, body, e);
            throw new BusinessException("微信接口返回异常");
        }
    }
}
