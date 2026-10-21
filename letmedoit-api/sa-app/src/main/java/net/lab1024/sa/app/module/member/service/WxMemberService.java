package net.lab1024.sa.app.module.member.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.module.member.dao.WxMemberDao;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 小程序会员
 *
 * @author smart-admin
 */
@Slf4j
@Service
public class WxMemberService {

    /**
     * 邀请码字符集：去掉 0/O/1/I 等易混字符，共 32 个
     */
    private static final char[] INVITE_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();

    /**
     * 邀请码长度
     */
    private static final int INVITE_CODE_LENGTH = 6;

    /**
     * 随机邀请码冲突重试次数
     */
    private static final int INVITE_CODE_RETRY = 3;

    /**
     * 兜底邀请码的混淆乘数，与 32^6 互质，保证 memberId 到邀请码是单射
     */
    private static final long INVITE_CODE_OBFUSCATE = 7919L;

    /**
     * 32 的 6 次方，邀请码空间
     */
    private static final long INVITE_CODE_SPACE = 1073741824L;

    /**
     * 微信在用户未授权时返回的占位昵称，不能直接展示
     */
    private static final String WECHAT_PLACEHOLDER_NICKNAME = "微信用户";

    /**
     * 兜底昵称：用户 + 4 位大写字母数字
     */
    private static final String NICKNAME_PREFIX = "用户";

    private static final char[] NICKNAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toCharArray();

    private static final int NICKNAME_RANDOM_LENGTH = 4;

    private static final int NICKNAME_MAX_LENGTH = 20;

    @Resource
    private WxMemberDao wxMemberDao;

    public WxMemberEntity getById(Long memberId) {
        return memberId == null ? null : wxMemberDao.selectById(memberId);
    }

    public WxMemberEntity getByOpenId(String openId) {
        LambdaQueryWrapper<WxMemberEntity> query = new LambdaQueryWrapper<>();
        query.eq(WxMemberEntity::getOpenId, openId);
        return wxMemberDao.selectOne(query);
    }

    /**
     * 按邀请码查询会员（加好友用）
     */
    public WxMemberEntity getByInviteCode(String inviteCode) {
        if (StrUtil.isBlank(inviteCode)) {
            return null;
        }
        return wxMemberDao.queryByInviteCode(inviteCode.trim().toUpperCase());
    }

    /**
     * 批量查询会员：任务参与者、好友列表统一走这里，避免循环查库
     */
    public List<WxMemberEntity> queryByIds(Collection<Long> memberIds) {
        if (memberIds == null || memberIds.isEmpty()) {
            return Collections.emptyList();
        }
        return wxMemberDao.queryByIds(memberIds);
    }

    /**
     * 按 openid 查询，不存在则创建游客会员。
     * 依赖 uk_open_id 唯一索引兜住并发注册
     *
     * @param nickname 微信昵称，可为空（用户拒绝授权 / 微信返回占位值时）
     * @param avatar   微信头像，可为空
     */
    public WxMemberEntity getOrCreate(String openId, String unionId, String nickname, String avatar) {
        WxMemberEntity exist = getByOpenId(openId);
        if (exist != null) {
            ensureInviteCode(exist);
            // 老会员没昵称（早于本功能注册）也要有名字，否则好友列表里一片空白
            ensureProfile(exist, null, null);
            return exist;
        }

        LocalDateTime now = LocalDateTime.now();
        WxMemberEntity entity = new WxMemberEntity();
        entity.setOpenId(openId);
        entity.setUnionId(unionId);
        entity.setGender(0);
        entity.setDisabledFlag(Boolean.FALSE);
        entity.setDeletedFlag(Boolean.FALSE);
        entity.setCreateTime(now);
        entity.setUpdateTime(now);
        // 首登就把微信资料写进去；占位资料（未授权）整体走兜底，头像也不留灰图
        boolean placeholder = isWechatPlaceholder(nickname);
        entity.setNickname(placeholder ? randomNickname() : StrUtil.sub(StrUtil.trimToEmpty(nickname), 0, NICKNAME_MAX_LENGTH));
        entity.setAvatar(placeholder ? StrUtil.EMPTY : StrUtil.trimToEmpty(avatar));

        try {
            wxMemberDao.insert(entity);
        } catch (DuplicateKeyException e) {
            // 并发首登：另一个请求已经插入，直接回查
            log.info("会员并发注册冲突，回查 openId={}", openId);
            WxMemberEntity concurrent = getByOpenId(openId);
            ensureInviteCode(concurrent);
            ensureProfile(concurrent, null, null);
            return concurrent;
        }
        ensureInviteCode(entity);
        return entity;
    }

    /**
     * 昵称归一：空值、微信占位昵称（「微信用户」）都换成「用户XXXX」。
     * 微信 2022-10 之后 getUserProfile 只返回占位资料，不识别会满屏「微信用户」。
     */
    private String normalizeNickname(String nickname) {
        if (isWechatPlaceholder(nickname)) {
            return randomNickname();
        }
        return StrUtil.sub(StrUtil.trimToEmpty(nickname), 0, NICKNAME_MAX_LENGTH);
    }

    /** 是否没拿到真实微信资料（空值或「微信用户」占位） */
    private boolean isWechatPlaceholder(String nickname) {
        String name = StrUtil.trimToEmpty(nickname);
        return StrUtil.isBlank(name) || WECHAT_PLACEHOLDER_NICKNAME.equals(name);
    }

    /** 「用户」+ 4 位大写字母数字，例如 用户K7X2 */
    private String randomNickname() {
        StringBuilder builder = new StringBuilder(NICKNAME_PREFIX);
        for (int i = 0; i < NICKNAME_RANDOM_LENGTH; i++) {
            builder.append(NICKNAME_CHARS[ThreadLocalRandom.current().nextInt(NICKNAME_CHARS.length)]);
        }
        return builder.toString();
    }

    /**
     * 补齐老会员缺失的昵称（有值不动，避免覆盖用户自己设定的）
     */
    private void ensureProfile(WxMemberEntity entity, String nickname, String avatar) {
        if (entity == null || entity.getMemberId() == null) {
            return;
        }
        boolean needName = isWechatPlaceholder(entity.getNickname());
        boolean needAvatar = StrUtil.isBlank(entity.getAvatar()) && StrUtil.isNotBlank(avatar);
        if (!needName && !needAvatar) {
            return;
        }

        WxMemberEntity update = new WxMemberEntity();
        update.setMemberId(entity.getMemberId());
        if (needName) {
            String name = normalizeNickname(nickname);
            update.setNickname(name);
            entity.setNickname(name);
        }
        if (needAvatar) {
            update.setAvatar(StrUtil.trimToEmpty(avatar));
            entity.setAvatar(update.getAvatar());
        }
        update.setUpdateTime(LocalDateTime.now());
        wxMemberDao.updateById(update);
    }

    /**
     * 更新手机号（以微信返回值为准）
     */
    public void updatePhone(Long memberId, String phone) {
        WxMemberEntity entity = new WxMemberEntity();
        entity.setMemberId(memberId);
        entity.setPhone(phone);
        entity.setUpdateTime(LocalDateTime.now());
        wxMemberDao.updateById(entity);
    }

    /**
     * 写入昵称头像（头像只来自微信 chooseAvatar，不接受文件上传）
     */
    public void updateProfile(Long memberId, String nickname, String avatar) {
        WxMemberEntity entity = new WxMemberEntity();
        entity.setMemberId(memberId);
        entity.setNickname(nickname);
        entity.setAvatar(avatar);
        entity.setUpdateTime(LocalDateTime.now());
        wxMemberDao.updateById(entity);
    }

    public void updateLastLoginTime(Long memberId) {
        WxMemberEntity entity = new WxMemberEntity();
        entity.setMemberId(memberId);
        entity.setLastLoginTime(LocalDateTime.now());
        entity.setUpdateTime(LocalDateTime.now());
        wxMemberDao.updateById(entity);
    }

    /**
     * 确保会员有邀请码：老数据懒补，新数据插入后立即生成。
     * 补成功会把邀请码回写到入参 entity 上（调用方可直接读 entity.getInviteCode()）。
     */
    public void ensureInviteCode(WxMemberEntity entity) {
        if (entity == null || entity.getMemberId() == null || StrUtil.isNotBlank(entity.getInviteCode())) {
            return;
        }
        for (int i = 0; i < INVITE_CODE_RETRY; i++) {
            String code = randomInviteCode();
            if (tryUpdateInviteCode(entity.getMemberId(), code)) {
                entity.setInviteCode(code);
                return;
            }
        }
        // 随机码连续冲突时用 memberId 派生，保证一定有可用邀请码
        String fallback = deriveInviteCode(entity.getMemberId());
        if (tryUpdateInviteCode(entity.getMemberId(), fallback)) {
            entity.setInviteCode(fallback);
            return;
        }
        log.error("邀请码初始化失败, memberId={}", entity.getMemberId());
    }

    /**
     * @return true 写入成功；false 邀请码已被占用
     */
    private boolean tryUpdateInviteCode(Long memberId, String inviteCode) {
        WxMemberEntity update = new WxMemberEntity();
        update.setMemberId(memberId);
        update.setInviteCode(inviteCode);
        update.setUpdateTime(LocalDateTime.now());
        try {
            wxMemberDao.updateById(update);
            return true;
        } catch (DuplicateKeyException e) {
            log.warn("邀请码冲突, memberId={}, inviteCode={}", memberId, inviteCode);
            return false;
        }
    }

    private String randomInviteCode() {
        StringBuilder builder = new StringBuilder(INVITE_CODE_LENGTH);
        for (int i = 0; i < INVITE_CODE_LENGTH; i++) {
            builder.append(INVITE_CODE_CHARS[ThreadLocalRandom.current().nextInt(INVITE_CODE_CHARS.length)]);
        }
        return builder.toString();
    }

    /**
     * 由 memberId 派生邀请码：乘互质常数后转 32 进制，单射且稳定
     */
    private String deriveInviteCode(Long memberId) {
        long mixed = Math.abs(memberId * INVITE_CODE_OBFUSCATE) % INVITE_CODE_SPACE;
        char[] buffer = new char[INVITE_CODE_LENGTH];
        for (int i = INVITE_CODE_LENGTH - 1; i >= 0; i--) {
            buffer[i] = INVITE_CODE_CHARS[(int) (mixed % INVITE_CODE_CHARS.length)];
            mixed /= INVITE_CODE_CHARS.length;
        }
        return new String(buffer);
    }
}
