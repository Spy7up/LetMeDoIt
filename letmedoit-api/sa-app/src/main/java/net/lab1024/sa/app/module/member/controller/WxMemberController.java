package net.lab1024.sa.app.module.member.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.member.domain.form.WxProfileForm;
import net.lab1024.sa.app.module.member.domain.vo.WxMemberVO;
import net.lab1024.sa.app.module.member.service.WxAuthService;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小程序会员
 *
 * @author smart-admin
 */
@RestController
@RequestMapping("/api/member")
@Tag(name = "小程序-会员")
public class WxMemberController {

    @Resource
    private WxAuthService wxAuthService;

    @GetMapping("/info")
    @Operation(summary = "当前登录会员信息")
    public ResponseDTO<WxMemberVO> info() {
        return wxAuthService.currentMember();
    }

    @PostMapping("/profile")
    @Operation(summary = "同步昵称头像")
    public ResponseDTO<WxMemberVO> updateProfile(@Valid @RequestBody WxProfileForm form) {
        return wxAuthService.updateProfile(form.getNickname(), form.getAvatar());
    }
}
