package net.lab1024.sa.app.module.notice.service;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import jakarta.annotation.Resource;
import net.lab1024.sa.app.module.notice.dao.NoticeDao;
import net.lab1024.sa.app.module.notice.domain.entity.NoticeEntity;
import net.lab1024.sa.app.module.notice.domain.form.NoticeQueryForm;
import net.lab1024.sa.app.module.notice.domain.form.NoticeReadForm;
import net.lab1024.sa.app.module.notice.domain.vo.NoticePageVO;
import net.lab1024.sa.app.module.notice.domain.vo.NoticeVO;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import net.lab1024.sa.base.common.util.SmartPageUtil;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 服务通知（小程序内消息中心）
 * <p>
 * 内容由业务侧写入（见 TaskNoticeService），这里只负责读与已读。
 * 后续接微信订阅消息时，投递逻辑也从这里取未读通知，和查询共用同一份数据。
 *
 * @author letmedoit
 */
@Service
public class NoticeService {

    @Resource
    private NoticeDao noticeDao;

    /**
     * 我的通知（分页 + 未读数）
     */
    public ResponseDTO<NoticePageVO> query(NoticeQueryForm queryForm, Long memberId) {
        Page<?> page = SmartPageUtil.convert2PageQuery(queryForm);
        List<NoticeEntity> rows = noticeDao.queryPage(queryForm, memberId, page);

        NoticePageVO result = new NoticePageVO();
        result.setPageNum(page.getCurrent());
        result.setPageSize(page.getSize());
        result.setTotal(page.getTotal());
        result.setPages(page.getPages());
        result.setList(rows.stream().map(this::toVO).collect(Collectors.toList()));
        result.setUnreadCount(noticeDao.countUnread(memberId));
        return ResponseDTO.ok(result);
    }

    /**
     * 未读数（首页红点）
     */
    public ResponseDTO<Integer> unreadCount(Long memberId) {
        return ResponseDTO.ok(noticeDao.countUnread(memberId));
    }

    /**
     * 标记已读：allFlag=true 清空全部，否则按 ID 标记
     */
    public ResponseDTO<Integer> read(NoticeReadForm form, Long memberId) {
        boolean all = Boolean.TRUE.equals(form.getAllFlag());
        List<Long> ids = all ? null : form.getNoticeIds();
        if (!all && CollectionUtils.isEmpty(ids)) {
            return ResponseDTO.userErrorParam("请选择要标记的通知");
        }
        noticeDao.updateRead(memberId, ids, LocalDateTime.now());
        return ResponseDTO.ok(noticeDao.countUnread(memberId));
    }

    private NoticeVO toVO(NoticeEntity entity) {
        NoticeVO vo = new NoticeVO();
        vo.setNoticeId(entity.getNoticeId());
        vo.setTaskId(entity.getTaskId());
        vo.setTemplateKey(entity.getTemplateKey());
        vo.setTitle(entity.getTitle());
        vo.setReadFlag(entity.getReadFlag());
        vo.setCreateTime(entity.getCreateTime());
        vo.setFields(parseFields(entity.getFieldsJson()));
        return vo;
    }

    /**
     * fields_json 存的是 [{label,value}]，解析失败时降级成空行，不让整个列表报错
     */
    private List<NoticeVO.Field> parseFields(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return JSON.parseArray(json, NoticeVO.Field.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
