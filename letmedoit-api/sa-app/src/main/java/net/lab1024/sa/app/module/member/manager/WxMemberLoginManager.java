package net.lab1024.sa.app.module.member.manager;

import jakarta.annotation.Resource;
import net.lab1024.sa.app.constant.AppCacheConst;
import net.lab1024.sa.app.module.member.dao.WxMemberDao;
import net.lab1024.sa.app.module.member.domain.RequestMember;
import net.lab1024.sa.app.module.member.domain.entity.WxMemberEntity;
import net.lab1024.sa.base.common.enumeration.UserTypeEnum;
import net.lab1024.sa.base.common.util.SmartBeanUtil;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * 会员登录态缓存
 * <p>
 * 走 spring-cache（Redis），TTL 30 分钟；登录与资料变更时刷新，登出时清除。
 * 缓存里存完整的 RequestMember，包含 openId / unionId / phone，拦截器命中后不再查库。
 *
 * @author smart-admin
 */
@Service
public class WxMemberLoginManager {

    @Resource
    private WxMemberDao wxMemberDao;

    /**
     * 获取登录态，缓存未命中时回源数据库
     */
    @Cacheable(value = AppCacheConst.MEMBER_LOGIN, key = "#memberId", unless = "#result == null")
    public RequestMember getRequestMember(Long memberId) {
        if (memberId == null) {
            return null;
        }
        WxMemberEntity entity = wxMemberDao.selectById(memberId);
        if (entity == null || Boolean.TRUE.equals(entity.getDeletedFlag())) {
            return null;
        }
        return build(entity);
    }

    /**
     * 写入登录态缓存
     */
    @CachePut(value = AppCacheConst.MEMBER_LOGIN, key = "#entity.memberId")
    public RequestMember loadLoginInfo(WxMemberEntity entity) {
        return build(entity);
    }

    /**
     * 清除登录态（登出、禁用、资料变更时调用）
     */
    @CacheEvict(value = AppCacheConst.MEMBER_LOGIN, key = "#memberId")
    public void clear(Long memberId) {
    }

    private RequestMember build(WxMemberEntity entity) {
        RequestMember member = SmartBeanUtil.copy(entity, RequestMember.class);
        member.setMemberId(entity.getMemberId());
        member.setUserType(UserTypeEnum.WX_MEMBER);
        return member;
    }
}
