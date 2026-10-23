package net.lab1024.sa.app.module.friend.manager;

import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.friend.constant.FriendRequestStatusEnum;
import net.lab1024.sa.app.module.friend.dao.FriendDao;
import net.lab1024.sa.app.module.friend.dao.FriendRequestDao;
import net.lab1024.sa.app.module.friend.domain.entity.FriendRequestEntity;
import net.lab1024.sa.base.common.exception.BusinessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 好友关系事务层
 *
 * @author letmedoit
 */
@Component
public class FriendManager {

    @Resource
    private FriendDao friendDao;

    @Resource
    private FriendRequestDao friendRequestDao;

    /**
     * 双向建立好友关系
     */
    @Transactional(rollbackFor = Exception.class)
    public void addFriend(Long memberId, Long friendMemberId) {
        LocalDateTime now = LocalDateTime.now();
        friendDao.upsert(memberId, friendMemberId, now);
        friendDao.upsert(friendMemberId, memberId, now);
    }

    /**
     * 同意申请：改状态 + 双向建关系，必须同一个事务
     */
    @Transactional(rollbackFor = Exception.class)
    public void acceptRequest(FriendRequestEntity request) {
        LocalDateTime now = LocalDateTime.now();
        int rows = friendRequestDao.updateStatus(request.getRequestId(),
                FriendRequestStatusEnum.PENDING.getValue(),
                FriendRequestStatusEnum.ACCEPTED.getValue(), now);
        if (rows == 0) {
            throw new BusinessException("该申请已处理");
        }
        friendDao.upsert(request.getFromMemberId(), request.getToMemberId(), now);
        friendDao.upsert(request.getToMemberId(), request.getFromMemberId(), now);
    }

    /**
     * 拒绝申请
     */
    @Transactional(rollbackFor = Exception.class)
    public void rejectRequest(FriendRequestEntity request) {
        int rows = friendRequestDao.updateStatus(request.getRequestId(),
                FriendRequestStatusEnum.PENDING.getValue(),
                FriendRequestStatusEnum.REJECTED.getValue(), LocalDateTime.now());
        if (rows == 0) {
            throw new BusinessException("该申请已处理");
        }
    }

    /**
     * 解除好友（双向逻辑删除）
     */
    @Transactional(rollbackFor = Exception.class)
    public void removeFriend(Long memberId, Long friendMemberId) {
        friendDao.removeBoth(memberId, friendMemberId, LocalDateTime.now());
    }
}
