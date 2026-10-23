# 让我做（letmedoit）

> 好友间的日常任务委托与提醒。别人让你做的小事，说一遍就够。

仓库采用**前端 / 后端分离**的单仓结构，两端各自独立、互不干扰，便于分别开发与部署。

```
letmedoit/
├── letmedoit-miniprogram/   # 微信小程序（原生 WXML/WXSS）
└── letmedoit-api/           # 后端服务（SpringBoot，待建）
```

## 一、letmedoit-miniprogram

微信小程序前端（已接真实后端，`ENV = 'dev'` 指向本机 sa-app）。

- 用微信开发者工具「导入项目」时，目录选 `letmedoit-miniprogram`
- 详细说明（目录结构、接口与环境切换、自检与联调脚本）见
  [`letmedoit-miniprogram/README.md`](./letmedoit-miniprogram/README.md)
- 快速自检（在该目录下执行）：

  ```bash
  cd letmedoit-miniprogram
  node tools/check.js    # 静态检查
  node tools/sim.js      # 离线自检（契约替身 + 桩跑页面）
  node tools/e2e.js      # 真后端联调（需 sa-app 已启动）
  ```

## 二、letmedoit-api

后端服务（SpringBoot，基于 SmartAdmin 3.x：`sa-base` / `sa-app` / `sa-admin`）。
小程序端接口在 `sa-app`，前缀 `/api`，鉴权头 `App-Token`。

- 接口清单、业务规则、建表与启动、联调步骤见
  [`letmedoit-api/docs/让我做-接口说明与联调.md`](./letmedoit-api/docs/让我做-接口说明与联调.md)
- 启动：`java -jar sa-app/target/sa-app-dev-3.0.0.jar --server.port=8081`（小程序 dev 环境指向 `http://192.168.31.79:8081`）

## 三、Git 约定

- 一次提交尽量只落在同一边：前端改动提交到 `letmedoit-miniprogram/`，后端改动提交到 `letmedoit-api/`，提交信息用 `feat(miniprogram):` / `feat(api):` 前缀区分。
- 两端各有一套忽略规则：根 `.gitignore` 覆盖通用项（系统文件、`node_modules`、`target`、IDE 文件、`.env`），子目录可按栈补充自己的 `.gitignore`。
- `.workbuddy/` 为本地工作目录，不纳入版本管理。
