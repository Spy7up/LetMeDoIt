package net.lab1024.sa.app.module.wx.domain;

import lombok.Data;

/**
 * code2session 结果
 *
 * @author smart-admin
 */
@Data
public class WxSessionVO {

    private String openId;

    private String unionId;

    /**
     * 会话密钥，仅服务端使用，禁止下发、禁止落库、禁止打日志
     */
    private String sessionKey;

    private Integer errcode;

    private String errmsg;
}
