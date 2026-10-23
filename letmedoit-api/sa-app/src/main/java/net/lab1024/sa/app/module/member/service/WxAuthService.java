package net.lab1024.sa.app.module.member.service;

import cn.dev33.satoken.stp.StpLogic;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.servlet.JakartaServletUtil;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.config.AppTokenConfig;
import net.lab1024.sa.app.constant.AppRedisKeyConst;
import net.lab1024.sa.app.module.member.domain.RequestMember;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.domain.form.WxLoginForm;
import net.lab1024.sa.app.module.member.domain.vo.WxLoginResultVO;
import net.lab1024.sa.app.module.member.domain.vo.WxMemberVO;
import net.lab1024.sa.app.module.member.manager.WxMemberLoginManager;
import net.lab1024.sa.app.module.wx.WxApiService;
import net.lab1024.sa.app.module.wx.domain.WxSessionVO;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.constant.RequestHeaderConst;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import net.lab1024.sa.base.common.enumeration.UserTypeEnum;
import net.lab1024.sa.base.common.exception.BusinessException;
import net.lab1024.sa.base.common.util.SmartBeanUtil;
import net.lab1024.sa.base.common.util.SmartIpUtil;
import net.lab1024.sa.base.constant.LoginDeviceEnum;
import net.lab1024.sa.base.module.support.loginlog.LoginLogResultEnum;
import net.lab1024.sa.base.module.support.loginlog.LoginLogService;
import net.lab1024.sa.base.module.support.loginlog.domain.LoginLogEntity;
import net.lab1024.sa.base.module.support.redis.RedisService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 小程序登录
 *
 * @author smart-admin
 */
@Slf4j
@Service
public class WxAuthService {

    /**
     * 同一 IP 每分钟最多登录次数
     */
    private static final int LOGIN_LIMIT_PER_MINUTE = 30;

    /**
     * 昵称最大长度（与小程序端 maxlength 一致）
     */
    private static final int NICKNAME_MAX_LENGTH = 20;

    /**
     * 头像地址最大长度，与 t_wx_member.avatar 的 VARCHAR(500) 对齐
     */
    private static final int AVATAR_MAX_LENGTH = 500;

    @Resource(name = AppTokenConfig.BEAN_NAME)
    private StpLogic stpAppLogic;

    @Resource
    private WxApiService wxApiService;

    @Resource
    private WxMemberService wxMemberService;

    @Resource
    private WxMemberLoginManager wxMemberLoginManager;

    @Resource
    private LoginLogService loginLogService;

    @Resource
    private RedisService redisService;

    /**
     * 一键登录：code 换 openid -> 查/建会员 -> 签发 token
     */
    public ResponseDTO<WxLoginResultVO> login(WxLoginForm loginForm, String ip, String userAgent) {
        checkLoginLimit(ip);

        WxSessionVO session = wxApiService.jscode2session(loginForm.getCode());

        // 前端把微信授权拿到的昵称头像一起带上来，拿不到就由服务端生成兜底昵称
        WxMemberEntity member = wxMemberService.getOrCreate(
                session.getOpenId(), session.getUnionId(), loginForm.getNickname(), loginForm.getAvatar());
        if (member == null) {
            return ResponseDTO.userErrorParam("登录失败，请重试");
        }

        boolean newUser = member.getLastLoginTime() == null;

        if (Boolean.TRUE.equals(member.getDeletedFlag())) {
            saveLoginLog(member, ip, userAgent, "账号已删除", LoginLogResultEnum.LOGIN_FAIL);
            return ResponseDTO.userErrorParam("账号状态异常，请联系客服");
        }
        if (Boolean.TRUE.equals(member.getDisabledFlag())) {
            saveLoginLog(member, ip, userAgent, "账号已禁用", LoginLogResultEnum.LOGIN_FAIL);
            return ResponseDTO.userErrorParam("账号已被禁用，请联系客服");
        }

        // 签发 token：loginId 用 memberId 字符串，避免反序列化后类型不一致
        stpAppLogic.login(String.valueOf(member.getMemberId()), LoginDeviceEnum.WEIXIN_MP.getDesc());
        String token = stpAppLogic.getTokenValue();

        // 写入缓存（含 openId / unionId / phone），拦截器后续直接命中
        wxMemberLoginManager.loadLoginInfo(member);

        wxMemberService.updateLastLoginTime(member.getMemberId());
        saveLoginLog(member, ip, userAgent, StrUtil.EMPTY, LoginLogResultEnum.LOGIN_SUCCESS);

        WxLoginResultVO result = new WxLoginResultVO();
        result.setToken(token);
        result.setTokenName(AppTokenConfig.TOKEN_NAME);
        result.setMember(SmartBeanUtil.copy(member, WxMemberVO.class));
        result.setNewUser(newUser);
        result.setNeedBindPhone(StrUtil.isBlank(member.getPhone()));
        return ResponseDTO.ok(result);
    }

    /**
     * 拦截器调用：token -> loginId -> 上下文会员
     */
    public RequestMember getLoginMember(Object loginId, HttpServletRequest request) {
        if (loginId == null) {
            return null;
        }

        long memberId;
        try {
            memberId = Long.parseLong(String.valueOf(loginId));
        } catch (NumberFormatException e) {
            log.warn("非法的 loginId: {}", loginId);
            return null;
        }

        RequestMember member = wxMemberLoginManager.getRequestMember(memberId);
        if (member == null || Boolean.TRUE.equals(member.getDisabledFlag())) {
            return null;
        }

        member.setIp(JakartaServletUtil.getClientIP(request));
        member.setUserAgent(JakartaServletUtil.getHeaderIgnoreCase(request, RequestHeaderConst.USER_AGENT));
        return member;
    }

    /**
     * 绑定手机号（服务端用 code 换取，前端上报的手机号一律不采信）
     */
    public ResponseDTO<WxMemberVO> bindPhone(String code) {
        RequestMember current = AppRequestUtil.getMember();
        if (current == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }

        String phone = wxApiService.getPhoneNumber(code);
        wxMemberService.updatePhone(current.getMemberId(), phone);

        WxMemberEntity entity = wxMemberService.getById(current.getMemberId());
        RequestMember refreshed = wxMemberLoginManager.loadLoginInfo(entity);
        return ResponseDTO.ok(SmartBeanUtil.copy(refreshed, WxMemberVO.class));
    }

    /**
     * 更新昵称头像
     * <p>
     * 昵称走小程序端 input type=nickname；头像走 chooseAvatar。
     * 注意 chooseAvatar 给的是**本机临时路径**（wxfile:// / http://tmp/），
     * 不是可访问 URL，所以服务端只保留公网 http(s) 地址，其余一律存空，
     * 由小程序端「昵称末字 + 色块」默认头像兜底，避免换设备后裂图。
     */
    public ResponseDTO<WxMemberVO> updateProfile(String nickname, String avatar) {
        RequestMember current = AppRequestUtil.getMember();
        if (current == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }

        String name = StrUtil.trimToEmpty(nickname);
        if (StrUtil.isBlank(name)) {
            return ResponseDTO.userErrorParam("昵称不能为空");
        }
        if (name.length() > NICKNAME_MAX_LENGTH) {
            return ResponseDTO.userErrorParam("昵称最多 " + NICKNAME_MAX_LENGTH + " 个字");
        }
        String avatarUrl = StrUtil.trimToEmpty(avatar);
        if (avatarUrl.length() > AVATAR_MAX_LENGTH) {
            return ResponseDTO.userErrorParam("头像地址过长，请重新选择");
        }
        if (!WxMemberService.isRemoteAvatar(avatarUrl)) {
            // 临时路径 / 空值 / 非法地址：不落库，前端用默认头像
            avatarUrl = StrUtil.EMPTY;
        }

        wxMemberService.updateProfile(current.getMemberId(), name, avatarUrl);
        RequestMember refreshed = wxMemberLoginManager.loadLoginInfo(wxMemberService.getById(current.getMemberId()));
        return ResponseDTO.ok(SmartBeanUtil.copy(refreshed, WxMemberVO.class));
    }

    /**
     * 退出登录
     */
    public ResponseDTO<String> logout() {
        RequestMember current = AppRequestUtil.getMember();
        stpAppLogic.logout();
        if (current != null) {
            wxMemberLoginManager.clear(current.getMemberId());
            saveLoginLog(current, current.getIp(), current.getUserAgent(), "退出登录", LoginLogResultEnum.LOGIN_OUT);
        }
        return ResponseDTO.ok();
    }

    /**
     * 当前登录会员
     * <p>
     * 正常走上下文（不查库）；只有在邀请码缺失时才回源一次并刷新登录态缓存，
     * 兜住两种情况：老会员从未生成过邀请码、缓存是加字段之前写入的。
     */
    public ResponseDTO<WxMemberVO> currentMember() {
        RequestMember current = AppRequestUtil.getMember();
        if (current == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }
        if (StrUtil.isBlank(current.getInviteCode())) {
            WxMemberEntity entity = wxMemberService.getById(current.getMemberId());
            if (entity != null) {
                wxMemberService.ensureInviteCode(entity);
                current = wxMemberLoginManager.loadLoginInfo(entity);
            }
        }
        return ResponseDTO.ok(SmartBeanUtil.copy(current, WxMemberVO.class));
    }

    /**
     * 简单 IP 限流，防止批量刷登录
     */
    private void checkLoginLimit(String ip) {
        String key = AppRedisKeyConst.LOGIN_LIMIT_PREFIX + ip;
        String value = redisService.get(key);
        int count = StrUtil.isBlank(value) ? 0 : Integer.parseInt(value);
        if (count >= LOGIN_LIMIT_PER_MINUTE) {
            throw new BusinessException("操作过于频繁，请稍后再试");
        }
        redisService.set(key, String.valueOf(count + 1), 60);
    }

    private void saveLoginLog(WxMemberEntity member, String ip, String userAgent, String remark, LoginLogResultEnum result) {
        LoginLogEntity entity = LoginLogEntity.builder()
                .userId(member.getMemberId())
                .userType(UserTypeEnum.WX_MEMBER.getValue())
                .userName(StrUtil.blankToDefault(member.getNickname(), "微信用户"))
                .loginIp(ip)
                .loginIpRegion(SmartIpUtil.getRegion(ip))
                .userAgent(userAgent)
                .loginDevice(LoginDeviceEnum.WEIXIN_MP.getDesc())
                .remark(remark)
                .loginResult(result.getValue())
                .createTime(LocalDateTime.now())
                .build();
        loginLogService.log(entity);
    }

    private void saveLoginLog(RequestMember member, String ip, String userAgent, String remark, LoginLogResultEnum result) {
        LoginLogEntity entity = LoginLogEntity.builder()
                .userId(member.getMemberId())
                .userType(UserTypeEnum.WX_MEMBER.getValue())
                .userName(StrUtil.blankToDefault(member.getNickname(), "微信用户"))
                .loginIp(ip)
                .loginIpRegion(SmartIpUtil.getRegion(ip))
                .userAgent(userAgent)
                .loginDevice(LoginDeviceEnum.WEIXIN_MP.getDesc())
                .remark(remark)
                .loginResult(result.getValue())
                .createTime(LocalDateTime.now())
                .build();
        loginLogService.log(entity);
    }
}
