-- ============================================================
-- 微信小程序会员体系 DDL
-- 项目：smart-admin（MySQL 8.x）
-- 说明：全部为新增表，不改动 t_employee 等现有表
-- ============================================================

-- ------------------------------------------------------------
-- 1. 小程序会员
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_wx_member` (
  `member_id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会员ID',
  `open_id`         VARCHAR(64)     NOT NULL                COMMENT '小程序 openid（当前appid下唯一）',
  `union_id`        VARCHAR(64)     DEFAULT NULL            COMMENT '开放平台 unionid（多端打通用）',
  `nickname`        VARCHAR(64)     DEFAULT NULL            COMMENT '昵称',
  `avatar`          VARCHAR(500)    DEFAULT NULL            COMMENT '头像URL',
  `phone`           VARCHAR(20)     DEFAULT NULL            COMMENT '手机号（微信授权获取，可信）',
  `gender`          TINYINT         NOT NULL DEFAULT 0      COMMENT '性别 0未知 1男 2女',
  `disabled_flag`   TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否禁用 0否 1是',
  `deleted_flag`    TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `last_login_time` DATETIME        DEFAULT NULL            COMMENT '最后登录时间',
  `create_time`     DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`     DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`member_id`),
  UNIQUE KEY `uk_open_id` (`open_id`),
  KEY `idx_union_id` (`union_id`),
  KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信小程序会员';

-- ------------------------------------------------------------
-- 2. 订单
-- 金额统一用「分」存储，避免浮点误差
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_wx_order` (
  `order_id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no`       VARCHAR(32)     NOT NULL                COMMENT '业务订单号（唯一）',
  `member_id`      BIGINT UNSIGNED NOT NULL                COMMENT '会员ID',
  `open_id`        VARCHAR(64)     NOT NULL                COMMENT '下单时的 openid',
  `title`          VARCHAR(128)    NOT NULL                COMMENT '商品标题',
  `description`    VARCHAR(255)    DEFAULT NULL            COMMENT '商品描述',
  `total_fee`      BIGINT          NOT NULL                COMMENT '订单金额（分）',
  `status`         TINYINT         NOT NULL DEFAULT 0      COMMENT '状态 0待支付 1已支付 2已关闭 3退款中 4已退款',
  `prepay_id`      VARCHAR(128)    DEFAULT NULL            COMMENT '微信预支付ID',
  `transaction_id` VARCHAR(64)     DEFAULT NULL            COMMENT '微信支付交易号',
  `pay_time`       DATETIME        DEFAULT NULL            COMMENT '支付时间',
  `expire_time`    DATETIME        DEFAULT NULL            COMMENT '订单过期时间（默认2小时）',
  `create_time`    DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`    DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  UNIQUE KEY `uk_transaction_id` (`transaction_id`),
  KEY `idx_member_id` (`member_id`),
  KEY `idx_status_create` (`status`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序订单';

-- ------------------------------------------------------------
-- 3. 支付回调留痕（排障 + 防重放）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_wx_pay_notify_log` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `notify_id`      VARCHAR(64)     NOT NULL                COMMENT '微信回调通知ID（唯一，防重放）',
  `event_type`     VARCHAR(64)     DEFAULT NULL            COMMENT '事件类型 TRANSACTION.SUCCESS / REFUND.SUCCESS',
  `out_trade_no`   VARCHAR(32)     DEFAULT NULL            COMMENT '商户订单号',
  `transaction_id` VARCHAR(64)     DEFAULT NULL            COMMENT '微信交易号',
  `verify_result`  TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '验签结果 0失败 1成功',
  `handle_result`  TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '处理结果 0失败 1成功',
  `raw_body`       TEXT                                    COMMENT '原始报文（脱敏后）',
  `error_msg`      VARCHAR(500)    DEFAULT NULL            COMMENT '异常信息',
  `create_time`    DATETIME        NOT NULL                COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notify_id` (`notify_id`),
  KEY `idx_out_trade_no` (`out_trade_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信支付回调日志';

-- ------------------------------------------------------------
-- 4. 订阅消息授权记录
-- 一次性订阅：授权一次只能发一条，用 remain_count 控制
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_wx_subscribe` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`      BIGINT UNSIGNED NOT NULL                COMMENT '会员ID',
  `template_id`    VARCHAR(64)     NOT NULL                COMMENT '订阅消息模板ID',
  `scene`          VARCHAR(64)     DEFAULT NULL            COMMENT '业务场景标识',
  `remain_count`   INT             NOT NULL DEFAULT 0      COMMENT '剩余可发送次数',
  `status`         TINYINT         NOT NULL DEFAULT 1      COMMENT '状态 1有效 0失效（用户拒绝/次数用尽）',
  `subscribe_time` DATETIME        DEFAULT NULL            COMMENT '最近一次授权时间',
  `create_time`    DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`    DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_template` (`member_id`, `template_id`),
  KEY `idx_member_id` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅消息授权记录';

-- ============================================================
-- 若后续选择「复用员工表」的轻量方案，改为执行以下语句（二选一，勿同时执行）
-- ============================================================
-- ALTER TABLE `t_employee`
--   ADD COLUMN `open_id`         VARCHAR(64)  DEFAULT NULL COMMENT '微信小程序 openid' AFTER `email`,
--   ADD COLUMN `union_id`        VARCHAR(64)  DEFAULT NULL COMMENT '微信开放平台 unionid' AFTER `open_id`,
--   ADD COLUMN `last_login_time` DATETIME     DEFAULT NULL COMMENT '最后登录时间' AFTER `union_id`,
--   ADD UNIQUE KEY `uk_open_id` (`open_id`);
