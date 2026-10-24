package net.lab1024.sa.app.module.friend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.friend.domain.form.FriendInviteAcceptForm;
import net.lab1024.sa.app.module.friend.domain.form.FriendRemoveForm;
import net.lab1024.sa.app.module.friend.domain.form.FriendRequestAddForm;
import net.lab1024.sa.app.module.friend.domain.form.FriendRequestHandleForm;
import net.lab1024.sa.app.module.friend.domain.vo.FriendInvitePreviewVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendInviteVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendRequestVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendVO;
import net.lab1024.sa.app.module.friend.service.FriendService;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 小程序 - 好友
 *
 * @author letmedoit
 */
@RestController
@RequestMapping("/api/friend")
@Tag(name = "小程序-好友")
public class FriendController {

    @Resource
    private FriendService friendService;

    @GetMapping("/list")
    @Operation(summary = "好友列表 @author letmedoit")
    public ResponseDTO<List<FriendVO>> list(@RequestParam(required = false) String keyword) {
        return friendService.list(keyword, AppRequestUtil.getMemberId());
    }

    @GetMapping("/request/list")
    @Operation(summary = "待处理的好友申请 @author letmedoit")
    public ResponseDTO<List<FriendRequestVO>> requestList() {
        return friendService.requestList(AppRequestUtil.getMemberId());
    }

    @PostMapping("/request/add")
    @Operation(summary = "发起好友申请 @author letmedoit")
    public ResponseDTO<String> apply(@RequestBody @Valid FriendRequestAddForm form) {
        return friendService.apply(form, AppRequestUtil.getMemberId());
    }

    @PostMapping("/request/accept")
    @Operation(summary = "同意好友申请 @author letmedoit")
    public ResponseDTO<String> acceptRequest(@RequestBody @Valid FriendRequestHandleForm form) {
        return friendService.acceptRequest(form.getRequestId(), AppRequestUtil.getMemberId());
    }

    @PostMapping("/request/reject")
    @Operation(summary = "拒绝好友申请 @author letmedoit")
    public ResponseDTO<String> rejectRequest(@RequestBody @Valid FriendRequestHandleForm form) {
        return friendService.rejectRequest(form.getRequestId(), AppRequestUtil.getMemberId());
    }

    @GetMapping("/invite")
    @Operation(summary = "我的邀请码 @author letmedoit")
    public ResponseDTO<FriendInviteVO> invite() {
        return friendService.invite(AppRequestUtil.getMemberId());
    }

    @GetMapping("/invite/{inviteCode}")
    @Operation(summary = "邀请码预览（点开分享卡片的人看） @author letmedoit")
    public ResponseDTO<FriendInvitePreviewVO> invitePreview(@PathVariable String inviteCode) {
        return friendService.invitePreview(inviteCode, AppRequestUtil.getMemberId());
    }

    @PostMapping("/invite/accept")
    @Operation(summary = "输入邀请码加好友 @author letmedoit")
    public ResponseDTO<String> acceptInvite(@RequestBody @Valid FriendInviteAcceptForm form) {
        return friendService.acceptInvite(form, AppRequestUtil.getMemberId());
    }

    @PostMapping("/remove")
    @Operation(summary = "解除好友 @author letmedoit")
    public ResponseDTO<String> remove(@RequestBody @Valid FriendRemoveForm form) {
        return friendService.remove(form, AppRequestUtil.getMemberId());
    }
}
