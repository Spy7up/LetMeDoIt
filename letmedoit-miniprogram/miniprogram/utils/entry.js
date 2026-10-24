/**
 * 分享卡片入口的统一守卫
 *
 * 分享卡片是陌生人第一次接触小程序的最短路径：从微信聊天直接点进来，
 * 不经过首页，所以既不会看到登录页，也不会经过首登的头像昵称引导 ——
 * 表现就是"一张白板、名字叫用户XXXX"。这里把这件事补上：
 *
 *   没登录过 → 登录页 → 一屏补头像昵称（可跳过） → 回到本来的页面（含参数）
 *
 * 注意：这里**故意不做静默登录**。静默登录会替用户注册一个账号，
 * 但分享进来的场景用户还什么都没看到，先给一屏"要开始用了"比直接塞个默认名更合理。
 */
const { getToken } = require('./request')

/** 把 onLoad 的 options 还原成查询串 */
function queryOf(options) {
  const parts = []
  Object.keys(options || {}).forEach((key) => {
    const value = options[key]
    if (value === undefined || value === null || value === '') return
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
  })
  return parts.length ? '?' + parts.join('&') : ''
}

/**
 * 当前页面完整路径（含参数）：登录与引导走完后跳回这里
 *
 * @param {string} base 例如 pages/tasks/receive/index
 * @param {object} options onLoad 的原始参数
 */
function routeOf(base, options) {
  return base + queryOf(options)
}

/**
 * 确保「已登录 + 走过首登引导」，没满足就接管跳转
 *
 * @param {string} route 当前页面完整路径，登录完成后回到这里
 * @returns {Promise<boolean>} true 表示已经跳走了，调用方必须立刻 return，别再发请求
 */
async function ensureEntry(route) {
  const app = getApp()

  // 从来没登录过：先去登录页。登录（含首登引导）会带着 redirect 回到 route
  if (!getToken()) {
    app.redirectToLogin(route)
    return true
  }

  // 有 token 但失效（换设备、服务端重启）：续登失败就回登录页，别让页面卡在"加载中"
  try {
    await app.ensureLogin()
  } catch (e) {
    app.redirectToLogin(route)
    return true
  }
  return false
}

module.exports = { ensureEntry, routeOf }
