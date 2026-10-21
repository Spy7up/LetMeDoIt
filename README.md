# 让我做（letmedoit）

> 好友间的日常任务委托与提醒。别人让你做的小事，说一遍就够。

仓库采用**前端 / 后端分离**的单仓结构，两端各自独立、互不干扰，便于分别开发与部署。

```
letmedoit/
├── letmedoit-miniprogram/   # 微信小程序（原生 WXML/WXSS）
└── letmedoit-api/           # 后端服务（SpringBoot，待建）
```

## 一、letmedoit-miniprogram

微信小程序前端，当前**可独立运行、不依赖后端**：所有接口走内置 Mock，逻辑与真实接口一致，改一行配置即可切到真实服务。

- 用微信开发者工具「导入项目」时，目录选 `letmedoit-miniprogram`
- 详细说明（目录结构、功能清单、Mock 与真实后端切换、自检脚本）见
  [`letmedoit-miniprogram/README.md`](./letmedoit-miniprogram/README.md)
- 快速自检（在该目录下执行）：

  ```bash
  cd letmedoit-miniprogram
  node tools/check.js    # 静态检查
  node tools/sim.js      # 运行时自检
  ```

## 二、letmedoit-api

后端服务代码目录，目前仅占位。接口契约见
[`letmedoit-miniprogram/docs/让我做-v1.1-产品与技术方案.md`](./letmedoit-miniprogram/docs/让我做-v1.1-产品与技术方案.md) 第 6 章。

小程序侧切换后端只需改 `letmedoit-miniprogram/miniprogram/config/index.js` 里的 `ENV`，`services/*` 与页面无需改动。

## 三、Git 约定

- 一次提交尽量只落在同一边：前端改动提交到 `letmedoit-miniprogram/`，后端改动提交到 `letmedoit-api/`，提交信息用 `feat(miniprogram):` / `feat(api):` 前缀区分。
- 两端各有一套忽略规则：根 `.gitignore` 覆盖通用项（系统文件、`node_modules`、`target`、IDE 文件、`.env`），子目录可按栈补充自己的 `.gitignore`。
- `.workbuddy/` 为本地工作目录，不纳入版本管理。
