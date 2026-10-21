package net.lab1024.sa.app.module.subscribe.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import net.lab1024.sa.app.config.WxProperties;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.app.module.member.service.WxMemberService;
import net.lab1024.sa.app.module.subscribe.dao.WxSubscribeDao;
import net.lab1024.sa.app.module.subscribe.domain.entity.WxSubscribeEntity;
import net.lab1024.sa.app.module.subscribe.domain.form.WxSubscribeRecordForm;
import net.lab1024.sa.app.module.wx.WxApiService;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.code.UserErrorCode;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 订阅消息
 * <p>
 * 一次性订阅：授权一次只能发一条，用 remain_count 控制
 *
 * @author smart-admin
 */
@Slf4j
@Service
public class WxSubscribeService {

    /**
     * 用户拒绝或订阅次数用尽
     */
    private static final int ERR_USER_REFUSE = 43101;

    @Resource
    private WxSubscribeDao wxSubscribeDao;

    @Resource
    private WxApiService wxApiService;

    @Resource
    private WxProperties wxProperties;

    @Resource
    private WxMemberService wxMemberService;

    /**
     * 记录前端 wx.requestSubscribeMessage 的授权结果
     */
    public ResponseDTO<String> recordSubscribe(WxSubscribeRecordForm form) {
        Long memberId = AppRequestUtil.getMemberId();
        if (memberId == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }
        if (!templateAllowed(form.getTemplateId())) {
            return ResponseDTO.userErrorParam("订阅模板不存在");
        }

        int count = form.getCount() == null ? 1 : form.getCount();
        WxSubscribeEntity exist = get(memberId, form.getTemplateId());
        LocalDateTime now = LocalDateTime.now();

        if (exist == null) {
            WxSubscribeEntity entity = new WxSubscribeEntity();
            entity.setMemberId(memberId);
            entity.setTemplateId(form.getTemplateId());
            entity.setScene(form.getScene());
            entity.setRemainCount(count);
            entity.setStatus(1);
            entity.setSubscribeTime(now);
            entity.setCreateTime(now);
            entity.setUpdateTime(now);
            wxSubscribeDao.insert(entity);
        } else {
            LambdaUpdateWrapper<WxSubscribeEntity> update = new LambdaUpdateWrapper<>();
            update.eq(WxSubscribeEntity::getId, exist.getId())
                    .set(WxSubscribeEntity::getScene, form.getScene())
                    .setSql("remain_count = remain_count + " + count)
                    .set(WxSubscribeEntity::getStatus, 1)
                    .set(WxSubscribeEntity::getSubscribeTime, now)
                    .set(WxSubscribeEntity::getUpdateTime, now);
            wxSubscribeDao.update(null, update);
        }
        return ResponseDTO.ok();
    }

    /**
     * 发送订阅消息
     *
     * @param memberId   接收会员
     * @param templateId 模板ID
     * @param page       点击跳转页面
     * @param data       模板数据（key=字段名, value=值）
     */
    public ResponseDTO<String> send(Long memberId, String templateId, String page, Map<String, String> data) {
        if (!templateAllowed(templateId)) {
            return ResponseDTO.userErrorParam("订阅模板不存在");
        }

        WxSubscribeEntity record = get(memberId, templateId);
        if (record == null || record.getStatus() == null || record.getStatus() != 1
                || record.getRemainCount() == null || record.getRemainCount() <= 0) {
            return ResponseDTO.userErrorParam("用户未订阅该消息，无法发送");
        }

        WxMemberEntity member = wxMemberService.getById(memberId);
        if (member == null || !StringUtils.hasText(member.getOpenId())) {
            return ResponseDTO.userErrorParam("会员信息异常");
        }

        Map<String, Object> wxData = new HashMap<>(8);
        if (data != null) {
            data.forEach((key, value) -> wxData.put(key, Collections.singletonMap("value", value)));
        }

        int errcode = wxApiService.sendSubscribeMessage(member.getOpenId(), templateId, page, wxData);
        if (errcode == 0) {
            decrement(record.getId());
            return ResponseDTO.ok();
        }

        if (errcode == ERR_USER_REFUSE) {
            markInvalid(record.getId());
            return ResponseDTO.userErrorParam("用户已拒绝或订阅次数已用尽");
        }

        log.warn("订阅消息发送失败, memberId={}, templateId={}, errcode={}", memberId, templateId, errcode);
        return ResponseDTO.userErrorParam("订阅消息发送失败（" + errcode + "）");
    }

    /**
     * 当前登录会员给自己发送（联调用，业务触发请直接调用 send 方法）
     */
    public ResponseDTO<String> sendToCurrent(String templateId, String page, Map<String, String> data) {
        Long memberId = AppRequestUtil.getMemberId();
        if (memberId == null) {
            return ResponseDTO.error(UserErrorCode.LOGIN_STATE_INVALID);
        }
        return send(memberId, templateId, page, data);
    }

    private WxSubscribeEntity get(Long memberId, String templateId) {
        LambdaQueryWrapper<WxSubscribeEntity> query = new LambdaQueryWrapper<>();
        query.eq(WxSubscribeEntity::getMemberId, memberId)
                .eq(WxSubscribeEntity::getTemplateId, templateId);
        return wxSubscribeDao.selectOne(query);
    }

    private void decrement(Long id) {
        LambdaUpdateWrapper<WxSubscribeEntity> update = new LambdaUpdateWrapper<>();
        update.eq(WxSubscribeEntity::getId, id)
                .setSql("remain_count = remain_count - 1")
                .set(WxSubscribeEntity::getUpdateTime, LocalDateTime.now());
        wxSubscribeDao.update(null, update);
    }

    private void markInvalid(Long id) {
        LambdaUpdateWrapper<WxSubscribeEntity> update = new LambdaUpdateWrapper<>();
        update.eq(WxSubscribeEntity::getId, id)
                .set(WxSubscribeEntity::getStatus, 0)
                .set(WxSubscribeEntity::getRemainCount, 0)
                .set(WxSubscribeEntity::getUpdateTime, LocalDateTime.now());
        wxSubscribeDao.update(null, update);
    }

    private boolean templateAllowed(String templateId) {
        if (!StringUtils.hasText(templateId)) {
            return false;
        }
        if (CollectionUtils.isEmpty(wxProperties.getSubscribeTemplateIds())) {
            // 未配置白名单时不限制，便于联调；生产建议配置
            return true;
        }
        return wxProperties.getSubscribeTemplateIds().contains(templateId);
    }
}
