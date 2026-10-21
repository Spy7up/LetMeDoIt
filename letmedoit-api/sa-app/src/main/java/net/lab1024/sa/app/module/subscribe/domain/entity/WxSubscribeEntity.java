package net.lab1024.sa.app.module.subscribe.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 订阅消息授权记录
 *
 * @author smart-admin
 */
@Data
@TableName("t_wx_subscribe")
public class WxSubscribeEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long memberId;

    private String templateId;

    private String scene;

    /**
     * 剩余可发送次数（一次性订阅授权一次只能发一条）
     */
    private Integer remainCount;

    /**
     * 1 有效 0 失效
     */
    private Integer status;

    private LocalDateTime subscribeTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
