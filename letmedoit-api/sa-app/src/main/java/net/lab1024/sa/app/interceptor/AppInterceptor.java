package net.lab1024.sa.app.interceptor;

import cn.dev33.satoken.exception.SaTokenException;
import cn.dev33.satoken.stp.StpLogic;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.config.AppTokenConfig;
import net.lab1024.sa.app.module.member.domain.RequestMember;
import net.lab1024.sa.app.module.member.service.WxAuthService;
import net.lab1024.sa.base.common.annoation.NoNeedLogin;
import net.lab1024.sa.base.common.code.SystemErrorCode;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import net.lab1024.sa.base.common.util.SmartRequestUtil;
import net.lab1024.sa.base.common.util.SmartResponseUtil;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 小程序端登录校验
 * <p>
 * 只挂在 /api/**，与后台 AdminInterceptor 完全隔离。
 * 校验通过后把 RequestMember（含 openId / unionId / phone）放入 ThreadLocal。
 *
 * @author smart-admin
 */
@Slf4j
@Component
public class AppInterceptor implements HandlerInterceptor {

    @Resource(name = AppTokenConfig.BEAN_NAME)
    private StpLogic stpAppLogic;

    @Resource
    private WxAuthService wxAuthService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {

        if (HttpMethod.OPTIONS.toString().equals(request.getMethod())) {
            response.setStatus(HttpStatus.NO_CONTENT.value());
            return false;
        }

        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        try {
            // 1. 取 token 对应的会员
            String tokenValue = stpAppLogic.getTokenValue();
            Object loginId = stpAppLogic.getLoginIdByToken(tokenValue);
            RequestMember member = wxAuthService.getLoginMember(loginId, request);

            // 2. @NoNeedLogin 放行（登录接口本身），但仍尽量注入上下文
            NoNeedLogin noNeedLogin = ((HandlerMethod) handler).getMethodAnnotation(NoNeedLogin.class);
            if (noNeedLogin != null) {
                SmartRequestUtil.setRequestUser(member);
                return true;
            }

            // 3. 未登录 / 已禁用
            if (member == null) {
                SmartResponseUtil.write(response, ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID));
                return false;
            }

            // 4. 续期活跃时间并注入上下文
            stpAppLogic.updateLastActiveToNow();
            SmartRequestUtil.setRequestUser(member);
            return true;

        } catch (SaTokenException e) {
            log.warn("小程序 token 校验失败: {}", e.getMessage());
            SmartResponseUtil.write(response, ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID));
            return false;
        } catch (Throwable e) {
            log.error("小程序拦截器异常", e);
            SmartResponseUtil.write(response, ResponseDTO.error(SystemErrorCode.SYSTEM_ERROR));
            return false;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        SmartRequestUtil.remove();
    }
}
