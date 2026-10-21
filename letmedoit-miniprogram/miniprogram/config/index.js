/**
 * 全局环境与开关
 * 对接后端时：把 ENV 改为 'dev' / 'prod' 即可，业务代码零改动。
 */
const ENV = 'mock' // 'mock' | 'dev' | 'prod'

const BASE_URLS = {
  dev: 'https://dev-api.letmedo.cn/miniapp/v1',
  prod: 'https://api.letmedo.cn/miniapp/v1',
}

module.exports = {
  ENV,
  USE_MOCK: ENV === 'mock',
  BASE_URL: BASE_URLS[ENV] || '',
  TIMEOUT: 10000,

  // Mock 层行为：用于验证 loading / 网络异常态
  MOCK: {
    LATENCY_MIN: 280,
    LATENCY_MAX: 620,
    FAULT_RATE: 0, // 0~1，设为 1 则所有请求返回网络错误
  },

  // 订阅消息模板（在公众平台申请后替换）
  NOTIFY: require('./notify'),
}
