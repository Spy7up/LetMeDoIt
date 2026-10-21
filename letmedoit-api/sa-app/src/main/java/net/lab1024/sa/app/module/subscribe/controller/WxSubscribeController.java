package net.lab1024.sa.app.module.subscribe.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import net.lab1024.sa.app.module.subscribe.domain.form.WxSubscribeRecordForm;
import net.lab1024.sa.app.module.subscribe.domain.form.WxSubscribeSendForm;
import net.lab1024.sa.app.module.subscribe.service.WxSubscribeService;
import net.lab1024.sa.base.common.domain.ResponseDTO;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 订阅消息
 *
 * @author smart-admin
 */
@RestController
@RequestMapping("/api/subscribe")
@Tag(name = "小程序-订阅消息")
public class WxSubscribeController {

    @Resource
    private WxSubscribeService wxSubscribeService;

    @PostMapping("/record")
    @Operation(summary = "记录订阅授权（wx.requestSubscribeMessage 成功后调用）")
    public ResponseDTO<String> record(@Valid @RequestBody WxSubscribeRecordForm form) {
        return wxSubscribeService.recordSubscribe(form);
    }

    @PostMapping("/send")
    @Operation(summary = "给自己发送订阅消息（联调用，生产建议由业务主动触发）")
    public ResponseDTO<String> send(@Valid @RequestBody WxSubscribeSendForm form) {
        return wxSubscribeService.sendToCurrent(form.getTemplateId(), form.getPage(), form.getData());
    }
}
