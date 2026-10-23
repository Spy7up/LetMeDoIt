# letmedoit-api

「让我做」后端服务（SpringBoot），基于 SmartAdmin 3.x 多模块骨架。

小程序端接口全部在 **`sa-app`**，前缀 `/api`，鉴权头 `App-Token: Bearer <token>`。
接口清单、业务规则、建表与启动、联调步骤见
[`docs/让我做-接口说明与联调.md`](./docs/让我做-接口说明与联调.md)。

## 模块

```
letmedoit-api/
├── pom.xml
├── sa-base/     # 框架底座：Web / MyBatis / Redis / sa-token / 日志 / 文件 / 定时任务
├── sa-app/      # 小程序 C 端接口（本项目主战场）
│   ├── module/auth      # /api/auth/login、logout、phone
│   ├── module/member    # /api/member/info、profile
│   ├── module/friend    # 好友、申请、邀请码
│   ├── module/task      # 任务全状态机（含 TaskScheduleJob 定时作业）
│   ├── module/notice    # 服务通知中心
│   ├── module/subscribe # 订阅消息额度
│   └── module/wx        # 微信接口封装（mock 可开关）
└── sa-admin/    # 管理后台（本版本未做业务页面，仅保留框架能力）
```

## 快速启动

```bash
# 1. 建表（6 张新表 + t_wx_member.invite_code）
#    mysql -h<host> -u<user> -p <db> < docs/sql/letmedoit_task.sql

# 2. 编译
mvn -o -pl sa-app -am package -DskipTests

# 3. 启动（默认 1025，小程序 dev 环境指向这里）
java -jar sa-app/target/sa-app-dev-3.0.0.jar --server.port=1025
```

- 数据库 / Redis：`sa-base/src/main/resources/dev/sa-base.yaml`
- 微信配置：`sa-app/src/main/resources/dev/application.yaml`，本地无 AppID 时用 `wx.miniapp.mock: true`
- Swagger：`http://localhost:1025/doc.html`

## 注意

- **通知表是 `t_task_notice`**，不是 `t_notice`（后者是框架自带公告表）。
- 任务聚合状态的判定在 `TaskManager` 一处，前端不再重算，只读服务端给的 `status` 与 `canXxx` 权限位。
- 所有状态流转都是 `UPDATE ... WHERE status = 旧值`，受影响行数为 0 时提示「任务状态已变化，请刷新后重试」。
