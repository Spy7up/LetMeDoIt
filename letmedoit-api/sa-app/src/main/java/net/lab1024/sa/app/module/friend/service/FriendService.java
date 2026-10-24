package net.lab1024.sa.app.module.friend.service;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.friend.constant.FriendRequestStatusEnum;
import net.lab1024.sa.app.module.friend.dao.FriendDao;
import net.lab1024.sa.app.module.friend.dao.FriendRequestDao;
import net.lab1024.sa.app.module.friend.domain.entity.FriendEntity;
import net.lab1024.sa.app.module.friend.domain.entity.FriendRequestEntity;
import net.lab1024.sa.app.module.friend.domain.form.FriendInviteAcceptForm;
import net.lab1024.sa.app.module.friend.domain.form.FriendRemoveForm;
import net.lab1024.sa.app.module.friend.domain.form.FriendRequestAddForm;
import net.lab1024.sa.app.module.friend.domain.vo.FriendInvitePreviewVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendInviteVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendRequestVO;
import net.lab1024.sa.app.module.friend.domain.vo.FriendVO;
import net.lab1024.sa.app.module.friend.manager.FriendManager;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.task.manager.TaskManager;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 好友业务
 *
 * @author letmedoit
 */
@Slf4j
@Service
public class FriendService {

    /**
     * 分享路径，小程序端拼分享卡片用
     */
    private static final String INVITE_SHARE_PATH = "/pages/launch/index?invite=";

    @Resource
    private FriendDao friendDao;

    @Resource
    private FriendRequestDao friendRequestDao;

    @Resource
    private FriendManager friendManager;

    @Resource
    private WxMemberService wxMemberService;

    /**
     * 我的好友列表
     */
    public ResponseDTO<List<FriendVO>> list(String keyword, Long memberId) {
        List<FriendVO> list = friendDao.queryList(memberId,
                StringUtils.hasText(keyword) ? keyword.trim() : null,
                Boolean.FALSE, TaskManager.ACTIVE_TASK_STATUS);
        list.forEach(item -> item.setDisplayName(
                StringUtils.hasText(item.getRemark()) ? item.getRemark() : item.getNickname()));
        return ResponseDTO.ok(list);
    }

    /**
     * 我收到的待处理申请
     */
    public ResponseDTO<List<FriendRequestVO>> requestList(Long memberId) {
        List<FriendRequestVO> list = friendRequestDao.queryByToMember(memberId,
                FriendRequestStatusEnum.PENDING.getValue(), Boolean.FALSE);
        return ResponseDTO.ok(list);
    }

    /**
     * 发起好友申请
     */
    public ResponseDTO<String> apply(FriendRequestAddForm form, Long memberId) {
        if (Objects.equals(form.getToMemberId(), memberId)) {
            return ResponseDTO.userErrorParam("不能加自己为好友");
        }
        WxMemberEntity target = wxMemberService.getById(form.getToMemberId());
        if (target == null || Boolean.TRUE.equals(target.getDeletedFlag())) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "对方不存在");
        }
        FriendEntity relation = friendDao.queryByMemberAndFriend(memberId, form.getToMemberId(), Boolean.FALSE);
        if (relation != null) {
            return ResponseDTO.userErrorParam("你们已经是好友了");
        }
        FriendRequestEntity pending = friendRequestDao.queryPending(memberId, form.getToMemberId(),
                FriendRequestStatusEnum.PENDING.getValue(), Boolean.FALSE);
        if (pending != null) {
            return ResponseDTO.userErrorParam("请求已发出，等 TA 确认");
        }

        LocalDateTime now = LocalDateTime.now();
        FriendRequestEntity entity = new FriendRequestEntity();
        entity.setFromMemberId(memberId);
        entity.setToMemberId(form.getToMemberId());
        entity.setApplyMessage(StringUtils.hasText(form.getApplyMessage()) ? form.getApplyMessage().trim() : null);
        entity.setStatus(FriendRequestStatusEnum.PENDING.getValue());
        entity.setDeletedFlag(Boolean.FALSE);
        entity.setCreateTime(now);
        entity.setUpdateTime(now);
        friendRequestDao.insert(entity);
        return ResponseDTO.ok("已发送，等 TA 同意");
    }

    /**
     * 同意申请
     */
    public ResponseDTO<String> acceptRequest(Long requestId, Long memberId) {
        FriendRequestEntity request = friendRequestDao.queryById(requestId, Boolean.FALSE);
        ResponseDTO<String> check = checkRequestOwner(request, memberId);
        if (check != null) {
            return check;
        }
        friendManager.acceptRequest(request);
        log.info("好友申请通过, requestId={}, memberId={}", requestId, memberId);
        return ResponseDTO.ok("已加为好友");
    }

    /**
     * 拒绝申请
     */
    public ResponseDTO<String> rejectRequest(Long requestId, Long memberId) {
        FriendRequestEntity request = friendRequestDao.queryById(requestId, Boolean.FALSE);
        ResponseDTO<String> check = checkRequestOwner(request, memberId);
        if (check != null) {
            return check;
        }
        friendManager.rejectRequest(request);
        return ResponseDTO.ok("已忽略");
    }

    /**
     * 我的邀请码
     */
    public ResponseDTO<FriendInviteVO> invite(Long memberId) {
        WxMemberEntity member = wxMemberService.getById(memberId);
        if (member == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "会员不存在");
        }
        if (!StringUtils.hasText(member.getInviteCode())) {
            // 理论上登录时已经初始化；这里兜底再查一次
            return ResponseDTO.userErrorParam("邀请码生成中，请稍后重试");
        }
        FriendInviteVO vo = new FriendInviteVO();
        vo.setInviteCode(member.getInviteCode());
        vo.setSharePath(INVITE_SHARE_PATH + member.getInviteCode());
        return ResponseDTO.ok(vo);
    }

    /**
     * 邀请码预览：分享卡片点进来的人，先看清「谁邀请我」再决定加不加
     * <p>
     * 只返回昵称、头像和两个判定位，不暴露对方的好友数/任务数。
     */
    public ResponseDTO<FriendInvitePreviewVO> invitePreview(String inviteCode, Long memberId) {
        WxMemberEntity target = wxMemberService.getByInviteCode(inviteCode);
        if (target == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "邀请码不存在或已失效");
        }
        FriendInvitePreviewVO vo = new FriendInvitePreviewVO();
        vo.setInviteCode(inviteCode);
        vo.setMemberId(target.getMemberId());
        vo.setNickname(target.getNickname());
        vo.setAvatar(target.getAvatar());
        boolean self = Objects.equals(target.getMemberId(), memberId);
        vo.setSelfFlag(self);
        vo.setFriendFlag(!self
                && friendDao.queryByMemberAndFriend(memberId, target.getMemberId(), Boolean.FALSE) != null);
        return ResponseDTO.ok(vo);
    }

    /**
     * 输入邀请码直接加好友（不需要对方确认，适合家里长辈面对面）
     */
    public ResponseDTO<String> acceptInvite(FriendInviteAcceptForm form, Long memberId) {
        WxMemberEntity target = wxMemberService.getByInviteCode(form.getInviteCode());
        if (target == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "邀请码不存在");
        }
        if (Objects.equals(target.getMemberId(), memberId)) {
            return ResponseDTO.userErrorParam("不能加自己为好友");
        }
        FriendEntity relation = friendDao.queryByMemberAndFriend(memberId, target.getMemberId(), Boolean.FALSE);
        if (relation != null) {
            return ResponseDTO.userErrorParam("你们已经是好友了");
        }
        friendManager.addFriend(memberId, target.getMemberId());
        log.info("邀请码添加好友, memberId={}, targetId={}", memberId, target.getMemberId());
        return ResponseDTO.ok("已加上 " + (StringUtils.hasText(target.getNickname()) ? target.getNickname() : "好友"));
    }

    /**
     * 解除好友
     */
    public ResponseDTO<String> remove(FriendRemoveForm form, Long memberId) {
        FriendEntity relation = friendDao.queryById(form.getFriendId(), Boolean.FALSE);
        if (relation == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "好友关系不存在");
        }
        if (!Objects.equals(relation.getMemberId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "只能解除自己的好友");
        }
        friendManager.removeFriend(memberId, relation.getFriendMemberId());
        return ResponseDTO.ok("已解除");
    }

    private ResponseDTO<String> checkRequestOwner(FriendRequestEntity request, Long memberId) {
        if (request == null) {
            return ResponseDTO.error(UserErrorCode.DATA_NOT_EXIST, "申请不存在");
        }
        if (!Objects.equals(request.getToMemberId(), memberId)) {
            return ResponseDTO.error(UserErrorCode.NO_PERMISSION, "这不是发给你的申请");
        }
        if (!FriendRequestStatusEnum.PENDING.getValue().equals(request.getStatus())) {
            return ResponseDTO.userErrorParam("该申请已处理");
        }
        return null;
    }
}
