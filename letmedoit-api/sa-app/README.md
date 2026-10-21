# sa-app · 微信小程序端服务

独立部署的小程序后端模块，只包含 C 端会员相关代码，与 sa-admin 在**代码、token、缓存、权限**上完全隔离。

## 已实现

| 能力 | 状态 |
|---|---|
| 微信一键登录（code → openid → token） | ✅ 已联调 |
| token 校验（`/api/**` 全拦截） | ✅ 已联调 |
| 请求上下文保存微信用户信息（openId / unionId / phone） | ✅ |
| 订阅消息授权记录 + 下发 | ✅ 已联调（mock） |
| 手机号绑定 | ✅ 代码就绪（需真实 appid） |
| 微信支付 | ⬜ 未实现（见方案 P3） |

## 目录结构

```
net.lab1024.sa.app
├── AppApplication                 启动类（扫描 net.lab1024.sa，仅加载 sa-base + sa-app）
├── config
│   ├── AppTokenConfig             StpLogic("app") + App-Token 请求头 + 独立超时策略
│   ├── AppMvcConfig               拦截器只挂 /api/**
│   ├── AppDataScopePlugin         sa-base 数据权限插件的空实现（C 端无部门数据权限）
│   └── WxProperties               wx.miniapp 配置 + 启动校验
├── interceptor/AppInterceptor     token → loginId → 会员 → ThreadLocal
├── util/AppRequestUtil            业务侧取当前会员（含 openId）
├── constant                       缓存/Redis key
└── module
    ├── member                     会员实体/DAO/登录服务/资料接口
    ├── wx                         WxApiService：code2session / access_token / 手机号 / 订阅消息
    └── subscribe                  订阅消息授权与下发
```

## 启动

```bash
# 1. sa-base 有改动时先安装到本地仓库
mvn -pl sa-base install -DskipTests

# 2. 打包
mvn -pl sa-app package -DskipTests

# 3. 运行（默认 1025）
java -jar sa-app/target/sa-app-dev-3.0.0.jar --server.port=1025
```

> 若宿主环境存在 `SERVER__PORT` 环境变量，会覆盖 yaml 里的 `server.port`，用 `--server.port=1025` 显式指定即可。

本地无小程序凭证时，`dev/application.yaml` 已设 `wx.miniapp.mock: true`，用假 openid 跑通全链路；生产环境该配置为 `false`，appid/secret 缺失会**启动失败**（fail-fast）。

```bash
# 生产/测试环境注入
export WX_MINIAPP_APPID=wx...
export WX_MINIAPP_SECRET=...
```

## 接口

所有业务接口前缀 `/api`，除标注「免登录」外都必须携带 `App-Token: Bearer <token>`。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/login` | 免登录 | `{code}` → `{token, tokenName, member, newUser, needBindPhone}` |
| POST | `/api/auth/phone` | 需登录 | `{code}` 绑定手机号（服务端换取，不采信前端手机号） |
| POST | `/api/auth/logout` | 需登录 | 登出并清缓存 |
| GET | `/api/member/info` | 需登录 | 当前会员 |
| POST | `/api/member/profile` | 需登录 | `{nickname, avatar}` 同步资料 |
| POST | `/api/subscribe/record` | 需登录 | 记录 `wx.requestSubscribeMessage` 授权结果 |
| POST | `/api/subscribe/send` | 需登录 | 给自己发订阅消息（联调用） |

### 调用示例

```bash
# 登录
curl -X POST http://127.0.0.1:1025/api/auth/login \
  -H "Content-Type: application/json" -d '{"code":"wx_code"}'

# 带 token 访问
curl http://127.0.0.1:1025/api/member/info -H "App-Token: Bearer <token>"

# 未带 token / token 失效
# {"code":30007,"msg":"您还未登录或登录失效，请重新登录！"}
```

## 小程序端接入

```javascript
// 1. 静默登录
wx.login({
  success: async ({ code }) => {
    const res = await request('/api/auth/login', { code })
    wx.setStorageSync('token', res.data.token)
  }
})

// 2. 统一请求头（注意是 App-Token，不是 Authorization）
const request = (url, data) => new Promise((resolve, reject) => {
  wx.request({
    url: BASE_URL + url,
    method: 'POST',
    data,
    header: {
      'Content-Type': 'application/json',
      'App-Token': 'Bearer ' + (wx.getStorageSync('token') || '')
    },
    success: res => {
      if (res.data.code === 30007) {
        wx.removeStorageSync('token')
        // 重新 wx.login 静默续期
      }
      resolve(res.data)
    },
    fail: reject
  })
})

// 3. 一键手机号
// <button open-type="getPhoneNumber" bindgetphonenumber="onPhone">
onPhone(e) {
  if (e.detail.code) request('/api/auth/phone', { code: e.detail.code })
}

// 4. 订阅消息：必须先由用户点击触发授权，再用返回值换发送次数
// <button bindtap="subscribe">开启通知</button>
subscribe() {
  wx.requestSubscribeMessage({
    tmplIds: ['模板ID'],
    success: (res) => {
      if (res['模板ID'] === 'accept') {
        request('/api/subscribe/record', { templateId: '模板ID', scene: 'order_paid', count: 1 })
      }
    }
  })
}
```

## 业务代码取当前用户

```java
// 任意 /api/** 接口内
RequestMember member = AppRequestUtil.getMember();   // 含 memberId/openId/unionId/phone/nickname
String openId  = AppRequestUtil.getOpenId();         // 支付下单直接用
Long memberId  = AppRequestUtil.getMemberId();
```

拦截器已将 `RequestMember` 放入 `SmartRequestUtil` 的 ThreadLocal，**不会重复查库**（Redis 缓存 30 分钟）；请求结束自动清理。

## 与后台的隔离设计

| 维度 | sa-admin | sa-app |
|---|---|---|
| Sa-Token loginType | `login`（StpUtil） | `app`（StpLogic） |
| 请求头 | `Authorization` | `App-Token` |
| Redis token key 前缀 | `satoken:login:*` | `satoken:app:*` |
| 活跃超时 | 由三级等保配置决定 | `activeTimeout = -1`（不冻结） |
| 拦截器 | `/**` | `/api/**` |
| 用户表 | `t_employee` | `t_wx_member` |

因此会员 token 放到 `Authorization` 头里也**无法**访问后台接口：两个体系在 Redis 里就是不同的 key。

## 已验证（dev + mock）

| 场景 | 结果 |
|---|---|
| 首次 `POST /api/auth/login` | 返回 token，`t_wx_member` 新增 1 条 |
| 再次登录 | 复用 `member_id=1`，`newUser=false` |
| 带 token 访问 `/api/member/info` | 200，返回本人信息 |
| 不带 / 伪造 token | `30007` |
| 同账号二次登录后旧 token | `30007`（单端登录生效） |
| 订阅授权上报 + 发送 | 成功，`remain_count` 2 → 1 |
| 登录日志 | `t_login_log` 写入 `user_type=2, device=微信小程序` |

## 待办

1. 填入真实 `WX_MINIAPP_APPID` / `WX_MINIAPP_SECRET`，关闭 mock，验证 code2session 与手机号
2. 配置订阅消息模板 ID 白名单（`wx.miniapp.subscribe-template-ids`）
3. 微信支付（JSAPI 下单 + 回调验签 + 幂等），见 `docs/微信小程序一键登录改造方案.md` §6
4. 生产前把 `/api/subscribe/send` 改成仅内部调用或加权限
