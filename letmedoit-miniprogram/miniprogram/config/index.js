/**
 * 环境与接口配置
 *
 * 切环境只改 ENV，业务代码零改动。
 * 说明：
 *  - dev 指向 192.168.31.79:8081（局域网上的 sa-app），开发者工具需勾选「不校验合法域名」
 *  - 真机调试/上线必须 HTTPS，并在小程序后台配置 request 合法域名
 *  - 鉴权头是 App-Token（与后台管理端的 Authorization 物理隔离），值必须带 Bearer 前缀
 */
const ENV = 'dev' // 'dev' | 'prod'

const ENV_CONFIG = {
  dev: { baseUrl: 'http://192.168.31.79:8081' },
  prod: { baseUrl: 'https://api.letmedo.cn' },
}

const current = ENV_CONFIG[ENV]

module.exports = {
  ENV,
  BASE_URL: current.baseUrl,
  TIMEOUT: 10000,

  /** 鉴权头，与 sa-app 的 AppTokenConfig 保持一致 */
  TOKEN_HEADER: 'App-Token',
  TOKEN_PREFIX: 'Bearer',

  /** 后端约定的时间格式（LocalDateTime + @JsonFormat） */
  TIME_PATTERN: 'YYYY-MM-DD HH:mm:ss',

  /** 订阅消息模板（在公众平台申请后替换） */
  NOTIFY: require('./notify'),
}
