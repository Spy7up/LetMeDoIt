package net.lab1024.sa.app.module.member.controller;

import cn.hutool.extra.servlet.JakartaServletUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.member.domain.form.WxLoginForm;
import net.lab1024.sa.app.module.member.domain.form.WxPhoneForm;
import net.lab1024.sa.app.module.member.domain.vo.WxLoginResultVO;
import net.lab1024.sa.app.module.member.domain.vo.WxMemberVO;
import net.lab1024.sa.app.module.member.service.WxAuthService;
import net.lab1024.sa.base.common.annoation.NoNeedLogin;
import net.lab1024.sa.base.common.constant.RequestHeaderConst;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小程序登录
 *
 * @author smart-admin
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "小程序-登录")
public class WxAuthController {

    @Resource
    private WxAuthService wxAuthService;

    @NoNeedLogin
    @PostMapping("/login")
    @Operation(summary = "微信一键登录")
    public ResponseDTO<WxLoginResultVO> login(@Valid @RequestBody WxLoginForm loginForm, HttpServletRequest request) {
        String ip = JakartaServletUtil.getClientIP(request);
        String userAgent = JakartaServletUtil.getHeaderIgnoreCase(request, RequestHeaderConst.USER_AGENT);
        return wxAuthService.login(loginForm, ip, userAgent);
    }

    @PostMapping("/phone")
    @Operation(summary = "绑定手机号")
    public ResponseDTO<WxMemberVO> bindPhone(@Valid @RequestBody WxPhoneForm form) {
        return wxAuthService.bindPhone(form.getCode());
    }

    @PostMapping("/logout")
    @Operation(summary = "退出登录")
    public ResponseDTO<String> logout() {
        return wxAuthService.logout();
    }
}
