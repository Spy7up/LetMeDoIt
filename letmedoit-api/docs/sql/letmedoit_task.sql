-- ============================================================
-- 「让我做」任务委托与提醒 —— 业务表 DDL
-- 项目：smart-admin / sa-app（小程序 C 端）
-- 说明：
--   1. 全部为新增表，不改动 t_employee / t_wx_member 等现有表
--   2. 与《让我做-v1.1-产品与技术方案》§5.4 对应；好友表沿用方案命名 t_friend
--   3. 时间统一 datetime，状态统一 tinyint + 注释里列全取值（便于后台报表按状态聚合）
--   4. 所有表带 create_time / update_time / deleted_flag，后台列表与逻辑删除复用
-- ============================================================

-- ------------------------------------------------------------
-- 1. 好友关系（双向双写：A→B 与 B→A 各一行，查询无需 OR）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_friend` (
  `friend_id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`        BIGINT UNSIGNED NOT NULL                COMMENT '归属会员ID',
  `friend_member_id` BIGINT UNSIGNED NOT NULL                COMMENT '好友会员ID',
  `remark`           VARCHAR(64)     DEFAULT NULL            COMMENT '备注名（覆盖对方昵称展示）',
  `deleted_flag`     TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `create_time`      DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`      DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`friend_id`),
  UNIQUE KEY `uk_member_friend` (`member_id`, `friend_member_id`),
  KEY `idx_friend_member` (`friend_member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='好友关系';

-- ------------------------------------------------------------
-- 2. 好友申请
-- 同一对会员可有多条历史记录（拒绝后可再次申请），不做唯一约束
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_friend_request` (
  `request_id`      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `from_member_id`  BIGINT UNSIGNED NOT NULL                COMMENT '发起人会员ID',
  `to_member_id`    BIGINT UNSIGNED NOT NULL                COMMENT '接收人会员ID',
  `apply_message`   VARCHAR(100)    DEFAULT NULL            COMMENT '附言',
  `status`          TINYINT         NOT NULL DEFAULT 0      COMMENT '状态 0待处理 1已同意 2已拒绝',
  `deleted_flag`    TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `create_time`     DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`     DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`request_id`),
  KEY `idx_to_status` (`to_member_id`, `status`),
  KEY `idx_from_status` (`from_member_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='好友申请';

-- ------------------------------------------------------------
-- 3. 任务主表
-- status 是「聚合状态」：由参与者状态 + 完成条件算出来，写入时落库，
-- 便于列表筛选与后台报表直接聚合，避免每次实时计算
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_task` (
  `task_id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `title`            VARCHAR(60)     NOT NULL                COMMENT '任务标题',
  `description`      VARCHAR(500)    DEFAULT NULL            COMMENT '交代内容',
  `images`           VARCHAR(1000)   DEFAULT NULL            COMMENT '附图，JSON 数组字符串，最多 6 张公网 URL',
  `creator_id`       BIGINT UNSIGNED NOT NULL                COMMENT '委托人会员ID',
  `completion_mode`  TINYINT         NOT NULL DEFAULT 2      COMMENT '完成条件 1任一人完成 2全员完成',
  `status`           TINYINT         NOT NULL DEFAULT 1      COMMENT '聚合状态 0预约中 1待接受 2进行中 3已完成 4已拒绝 5已撤回',
  `start_time`       DATETIME        DEFAULT NULL            COMMENT '定时生效时间（为空立即生效）',
  `deadline`         DATETIME        NOT NULL                COMMENT '截止时间',
  `remind_minutes`   INT             NOT NULL DEFAULT 0      COMMENT '提前提醒分钟数 0不提醒',
  `remind_time`      DATETIME        DEFAULT NULL            COMMENT '下次提醒时间（定时任务扫描用）',
  `last_remind_time` DATETIME        DEFAULT NULL            COMMENT '最后一次催办时间（限频用）',
  `deleted_flag`     TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `create_time`      DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`      DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`task_id`),
  KEY `idx_creator_status` (`creator_id`, `status`),
  KEY `idx_status_deadline` (`status`, `deadline`),
  KEY `idx_remind_time` (`remind_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务';

-- ------------------------------------------------------------
-- 4. 任务参与者（一人一格，独立完成）
-- uk_task_member 保证同一人不会被重复加进同一条任务
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_task_participant` (
  `participant_id`   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`          BIGINT UNSIGNED NOT NULL                COMMENT '任务ID',
  `member_id`        BIGINT UNSIGNED NOT NULL                COMMENT '参与者会员ID',
  `status`           TINYINT         NOT NULL DEFAULT 0      COMMENT '参与状态 0待接受 1已接受 2已完成 3已拒绝 4已跳过',
  `complete_time`    DATETIME        DEFAULT NULL            COMMENT '完成时间',
  `complete_remark`  VARCHAR(500)    DEFAULT NULL            COMMENT '完成备注',
  `complete_images`  VARCHAR(2000)   DEFAULT NULL            COMMENT '凭证图片URL，JSON数组字符串，最多3张',
  `reject_reason`    VARCHAR(200)    DEFAULT NULL            COMMENT '拒绝理由',
  `deleted_flag`     TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `create_time`      DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`      DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`participant_id`),
  UNIQUE KEY `uk_task_member` (`task_id`, `member_id`),
  KEY `idx_member_status` (`member_id`, `status`),
  KEY `idx_task_status` (`task_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务参与者';

-- ------------------------------------------------------------
-- 5. 任务事件（append-only，详情页时间线 + 后台追溯）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_task_event` (
  `event_id`    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`     BIGINT UNSIGNED NOT NULL                COMMENT '任务ID',
  `actor_id`    BIGINT UNSIGNED DEFAULT NULL            COMMENT '操作人会员ID（系统事件为空）',
  `event_type`  TINYINT         NOT NULL                COMMENT '事件类型 1创建 2邀请 3接受 4拒绝 5完成 6撤回 7催办 8定时生效 9跳过',
  `content`     VARCHAR(255)    NOT NULL                COMMENT '事件描述',
  `create_time` DATETIME        NOT NULL                COMMENT '发生时间',
  PRIMARY KEY (`event_id`),
  KEY `idx_task_time` (`task_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务事件';

-- ------------------------------------------------------------
-- 6. 服务通知（小程序内消息中心，与微信服务通知同构）
-- 表名刻意不叫 t_notice：sa-admin 框架自带的 t_notice 是站内公告表，
-- 两者语义完全不同，重名会让小程序的通知 INSERT 打错表。
-- fields_json 存 [{label,value}]，直接驱动卡片渲染；
-- 后续接订阅消息投递时，这张表同时是投递内容的事实来源
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_task_notice` (
  `notice_id`    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `member_id`    BIGINT UNSIGNED NOT NULL                COMMENT '收件人会员ID',
  `task_id`      BIGINT UNSIGNED DEFAULT NULL            COMMENT '关联任务ID',
  `template_key` VARCHAR(32)     NOT NULL                COMMENT '模板标识 TASK_ASSIGNED/TASK_REMIND/TASK_COMPLETED/TASK_ALL_DONE',
  `title`        VARCHAR(64)     NOT NULL                COMMENT '通知标题',
  `fields_json`  VARCHAR(2000)   NOT NULL                COMMENT '卡片键值对，JSON数组 [{label,value}]',
  `read_flag`    TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否已读 0未读 1已读',
  `deleted_flag` TINYINT(1)      NOT NULL DEFAULT 0      COMMENT '是否删除 0否 1是',
  `create_time`  DATETIME        NOT NULL                COMMENT '创建时间',
  `update_time`  DATETIME        NOT NULL                COMMENT '更新时间',
  PRIMARY KEY (`notice_id`),
  KEY `idx_member_read` (`member_id`, `read_flag`, `create_time`),
  KEY `idx_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务通知';

-- ------------------------------------------------------------
-- 7. 会员表扩展：邀请码
-- 原 t_wx_member 只有 openid/手机号，加好友需要一个可读可转发的短码。
-- 唯一索引兜住并发注册；生成逻辑见 WxMemberService#initInviteCode（插入后回填 + 冲突重试）
-- ------------------------------------------------------------
ALTER TABLE `t_wx_member`
  ADD COLUMN `invite_code` VARCHAR(8) DEFAULT NULL COMMENT '邀请码（6位，加好友用）' AFTER `phone`,
  ADD UNIQUE KEY `uk_invite_code` (`invite_code`);
