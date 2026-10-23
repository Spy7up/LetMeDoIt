package net.lab1024.sa.app.module.notice.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.notice.domain.form.NoticeQueryForm;
import net.lab1024.sa.app.module.notice.domain.form.NoticeReadForm;
import net.lab1024.sa.app.module.notice.domain.vo.NoticePageVO;
import net.lab1024.sa.app.module.notice.service.NoticeService;
import net.lab1024.sa.app.util.AppRequestUtil;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小程序 - 服务通知
 *
 * @author letmedoit
 */
@RestController
@RequestMapping("/api/notice")
@Tag(name = "小程序-服务通知")
public class NoticeController {

    @Resource
    private NoticeService noticeService;

    @PostMapping("/query")
    @Operation(summary = "我的通知（含未读数） @author letmedoit")
    public ResponseDTO<NoticePageVO> query(@RequestBody @Valid NoticeQueryForm queryForm) {
        return noticeService.query(queryForm, AppRequestUtil.getMemberId());
    }

    @GetMapping("/unread-count")
    @Operation(summary = "未读数 @author letmedoit")
    public ResponseDTO<Integer> unreadCount() {
        return noticeService.unreadCount(AppRequestUtil.getMemberId());
    }

    @PostMapping("/read")
    @Operation(summary = "标记已读 @author letmedoit")
    public ResponseDTO<Integer> read(@RequestBody @Valid NoticeReadForm form) {
        return noticeService.read(form, AppRequestUtil.getMemberId());
    }
}
