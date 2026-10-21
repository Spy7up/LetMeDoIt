# 让我做（letmedoit）

> 好友间的日常任务委托与提醒。别人让你做的小事，说一遍就够。

微信小程序，原生 WXML/WXSS。**当前版本可独立运行，不依赖后端**：所有接口走内置 Mock，逻辑与真实接口一致，改一行配置即可切到 SpringBoot。

---

## 一、怎么跑起来

1. 打开**微信开发者工具**（稳定版即可），选择「导入项目」
2. 目录选到 `letmedoit/letmedoit-miniprogram`（不是更里层的 `miniprogram`，工程配置在这个目录）
3. AppID 选「测试号」或填自己的 AppID（`project.config.json` 里现在是 `touristappid`）
4. 编译，进入「任务」页即可

首次进入会自动静默登录（Mock），不需要点任何东西。想走完整登录流程，可在「我的 → 退出登录」后再进。

> 建议在开发者工具里把「基础库」调到 2.32.0 以上；「详情 → 本地设置」勾选「不校验合法域名」可省去后续联调的麻烦。

---

## 二、目录结构

```
letmedoit/
├── letmedoit-miniprogram/       # 前端：微信小程序
│   ├── project.config.json      # 工程配置（miniprogramRoot 指向 miniprogram/）
│   ├── miniprogram/
│   │   ├── app.js / app.json / app.wxss
│   │   ├── custom-tab-bar/      # 悬浮液态玻璃 tabBar（原生 tabBar 不可改样式）
│   │   ├── pages/
│   │   │   ├── launch/          # 登录与授权
│   │   │   ├── tasks/
│   │   │   │   ├── index/       # 任务中心（自定义导航 + 液态玻璃 banner）
│   │   │   │   ├── create/      # 布置任务（多人 + 完成条件）
│   │   │   │   ├── detail/      # 任务详情（每人一格）
│   │   │   │   ├── complete/    # 完成我这份（备注 + 凭证）
│   │   │   │   └── participants/ # 选参与者 / 追加参与者
│   │   │   ├── messages/index/  # 服务通知中心（与微信同构）
│   │   │   ├── friends/         # 好友 / 邀请 / 好友详情
│   │   │   └── mine/            # 我的 / 编辑资料 / 提醒设置
│   │   ├── services/            # 领域方法：auth / friend / task / notice / notify
│   │   ├── utils/               # request 封装、格式化、展示层派生
│   │   ├── constants/           # 状态与文案映射（唯一出口）
│   │   ├── mock/                # Mock 服务端 + 种子数据
│   │   ├── config/              # 环境开关、订阅消息模板
│   │   └── images/icons/        # 图标（脚本生成，见 tools/gen-assets.js）
│   ├── docs/                    # 产品与技术方案
│   ├── prototype/               # 8 屏高保真原型
│   ├── assets/logo/             # Logo 源文件与各尺寸导出
│   └── tools/                   # 图标生成、静态检查、运行时自检
└── letmedoit-api/               # 后端（SpringBoot，待建）
```

---

## 三、切到真实后端

只改一处：

```js
// miniprogram/config/index.js
const ENV = 'mock'   // 改成 'dev' 或 'prod'
```

`services/*` 与页面零改动。接口契约见 `docs/让我做-v1.1-产品与技术方案.md` 第 6 章。

**页面铁律**：页面里不出现 `wx.request`、不出现 URL 字面量、不判断 `res.code`。全部经 `services` → `utils/request.js`。

---

## 四、已经能用的功能

| 模块 | 状态 |
|---|---|
| 微信登录 / 资料初始化 | ✅ Mock 登录，头像昵称可改（chooseAvatar + type=nickname） |
| 好友：邀请码、请求、列表、解除 | ✅ |
| 布置任务：多选参与者、标题、描述、完成条件、截止、提醒、定时生效 | ✅ |
| 任务列表：收到的 / 发出的、5 种筛选、分页、下拉刷新 | ✅ |
| 任务详情：进度、每人状态、备注查看、时间线 | ✅ |
| 每人独立完成：接受 / 拒绝 / 完成（备注 + 图片） | ✅ |
| 两种完成条件：任一人完成（其余自动跳过）/ 全员完成 | ✅ |
| 追加参与者（任务未开始前） | ✅ |
| 服务通知中心：与微信卡片同构、未读数、已读 | ✅ |
| 液态玻璃 banner：当日摘要、逾期提醒、在等你的人 | ✅ |
| 悬浮液态玻璃 tabBar：胶囊悬浮、内容从底下穿过 | ✅ |
| 订阅消息授权（发布 / 接受 / 完成时攒额度） | ⚠️ 逻辑已接，模板 id 待填（见第五节） |

---

## 五、还需要你补的三件事

1. **订阅消息模板 id**
   在公众平台申请 4 个模板（`任务委托通知 / 任务到期提醒 / 任务完成通知 / 全员完成通知`），把 id 填进 `miniprogram/config/notify.js`。
   现在模板 id 是占位符，`requestSubscribe` 会直接跳过，不会弹授权框——这是故意的，避免开发阶段报错。

2. **真实 AppID**
   `project.config.json` 里现在是 `touristappid`，上传前换成你的。

3. **后端**
   按方案第 6 章实现接口即可。`mock/db.js` 里的 `aggregate()` 是聚合状态的唯一判定，后端要写一份等价的。

---

## 六、自检命令

没有开发者工具时也能验（**在 `letmedoit-miniprogram/` 目录下执行**，脚本内部按 `../miniprogram` 定位）：

```bash
node tools/check.js    # 静态检查：页面四件套、JS 语法、require 路径、图片引用、跳转目标、事件绑定
node tools/sim.js      # 运行时自检：用桩跑真实页面逻辑（登录→列表→接受→详情→完成→布置→通知→好友）
node tools/gen-assets.js  # 重新生成图标（改了图标定义后执行）
```

两个脚本目前都是全绿。

---

## 七、Logo 与图标资源

Logo 是**矢量绘制**的（不是 AI 生成的位图），保证从 1024px 到 28px 都清晰：

- `assets/logo/icon.svg` —— 源文件，改颜色/比例直接改这里
- `assets/logo/icon-1024.png` —— 上传小程序后台（也作为对外主图）
- `assets/logo/icon-144.png` —— 小程序头像规格
- `assets/logo/brand-board.png` —— 品牌板（尺寸阶梯、深/浅底、组合用法）
- `miniprogram/images/logo.png` —— App 内使用（启动页、服务通知卡片头像）

图形含义：**气泡 = 一句口头交代，对勾 = 做完了**。所以外轮廓是对话气泡而不是普通勾选框——这个产品的起点是微信里那句「帮我把衣服晾一下」。

重新导出某一尺寸：

```bash
# 改完 icon.svg 后，用浏览器渲染（无第三方依赖）
msedge --headless=old --screenshot=icon-512.png --window-size=512,512 \
  "file:///<项目路径>/assets/logo/render.html?f=icon.svg&s=512"
```

界面里的小图标（tabBar、箭头、铃铛等）是另一套，由 `tools/gen-assets.js` 生成，见第六节。

## 八、已知限制（v1.1 有意为之）
- **数据不持久**：Mock 存在内存里，重启小程序即重置。这是为了演示时有新鲜数据。
- **图片是本地临时路径**：完成任务选的图只存在当前会话，没有上传到 OSS。接后端时换成 `wx.uploadFile`。
- **没有自定义组件**：v1 用 `app.wxss` 全局类 + WXML 复用，先把链路跑通；抽组件放在 M2。
- **深色模式**：未做，但颜色全走 CSS 变量，可整体替换。
