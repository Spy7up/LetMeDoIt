/**
 * 统一请求层
 *
 * 职责（其余地方一律不许出现 wx.request）：
 *  1. 拼 BASE_URL、注入 App-Token
 *  2. 拆 sa-app 的响应信封 { code, level, msg, ok, data }
 *  3. 登录态失效（30007）时用 wx.login 静默换一次 token 并重放
 *  4. 把后端错误统一成带 code 的 Error，页面只读 err.message
 *
 * 注意：sa-app 的错误文案字段是 msg，不是 message。
 */
const config = require('../config/index')

const TOKEN_KEY = 'lmd_app_token'

/** 后端登录态失效错误码，见 UserErrorCode.LOGIN_STATE_INVALID */
const CODE_LOGIN_INVALID = 30007
/** 本地兜底：网络层失败 */
const CODE_NETWORK = -1

let reloginPromise = null

/* ---------------- session ---------------- */

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token || '')
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
}

function authHeader() {
  const token = getToken()
  if (!token) return {}
  const value = config.TOKEN_PREFIX ? config.TOKEN_PREFIX + ' ' + token : token
  return { [config.TOKEN_HEADER]: value }
}

/* ---------------- 错误归一化 ---------------- */

function makeError(payload, fallback) {
  const err = new Error((payload && payload.msg) || fallback || '请求失败')
  err.code = payload && payload.code != null ? payload.code : CODE_NETWORK
  err.raw = payload || null
  return err
}

/* ---------------- 底层发送 ---------------- */

/**
 * 发一次请求，永远 resolve 出「信封」对象（业务失败也走 resolve）
 * 只有网络层失败才 reject。
 *
 * @param {{url:string, method?:string, data?:object, auth?:boolean, timeout?:number}} options
 * @returns {Promise<{code:number, msg?:string, data?:any}>}
 */
function send(options) {
  const { url, method = 'GET', data, auth = true, timeout } = options
  const header = { 'Content-Type': 'application/json' }
  if (auth) Object.assign(header, authHeader())

  return new Promise((resolve, reject) => {
    wx.request({
      url: config.BASE_URL + url,
      method,
      data,
      timeout: timeout || config.TIMEOUT,
      header,
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body.code === 'number') {
          return resolve(body)
        }
        // 非 2xx 或不是标准信封（网关 502、域名未配置等），统一按网络错误处理
        resolve({
          code: res.statusCode === 401 ? CODE_LOGIN_INVALID : CODE_NETWORK,
          msg: (body && body.msg) || '服务开小差了，请稍后重试',
          data: null,
        })
      },
      fail(err) {
        reject(makeError(null, (err && err.errMsg) || '网络不可用，请检查网络后重试'))
      },
    })
  })
}

/* ---------------- 静默登录 ---------------- */

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(makeError(null, '微信登录失败'))),
      fail: () => reject(makeError(null, '微信登录失败')),
    })
  })
}

/**
 * 用 wx.login 的 code 换 token
 * 登录接口本身免鉴权，所以 auth: false，避免递归
 *
 * @param {{nickname?:string, avatarUrl?:string}} profile 微信授权拿到的资料，拒绝授权时不传
 * @returns {Promise<{token:string, tokenName:string, member:object, newUser:boolean}>}
 */
async function silentLogin(profile) {
  const code = await wxLoginCode()
  const data = { code }
  // 只有真的拿到微信资料才带上去；后端会用「用户XXXX」兜底
  if (profile && profile.nickname) {
    data.nickname = profile.nickname
    data.avatar = profile.avatarUrl || ''
  }
  const envelope = await send({ url: '/api/auth/login', method: 'POST', data, auth: false })
  if (envelope.code !== 0 || !envelope.data) throw makeError(envelope, '登录失败')
  setToken(envelope.data.token)
  return envelope.data
}

function relogin() {
  if (!reloginPromise) {
    // 结束后立刻释放，否则下次 token 再过期会复用一个已完成的 promise，等于没重登
    reloginPromise = silentLogin().then(
      (res) => {
        reloginPromise = null
        return res
      },
      (err) => {
        reloginPromise = null
        throw err
      }
    )
  }
  return reloginPromise
}

/* ---------------- 对外入口 ---------------- */

/**
 * @param {{url:string, method?:string, data?:object, auth?:boolean, loading?:string}} options
 * @returns {Promise<any>} 直接给出信封里的 data
 */
async function request(options, retried) {
  if (options.loading) wx.showLoading({ title: options.loading, mask: true })

  let envelope
  try {
    envelope = await send(options)
  } finally {
    if (options.loading) wx.hideLoading()
  }

  if (envelope.code === 0) return envelope.data

  // 登录态失效：静默换 token 后重放一次，用户无感
  if (envelope.code === CODE_LOGIN_INVALID && !retried) {
    try {
      await relogin()
    } catch (e) {
      clearSession()
      gotoLogin()
      throw makeError({ code: CODE_LOGIN_INVALID, msg: '登录已失效，请重新进入' })
    }
    return request(options, true)
  }

  if (envelope.code === CODE_LOGIN_INVALID) {
    clearSession()
    gotoLogin()
  }

  throw makeError(envelope)
}

function gotoLogin() {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  const redirect = current ? current.route : 'pages/tasks/index/index'
  wx.reLaunch({ url: '/pages/launch/index?redirect=' + encodeURIComponent(redirect) })
}

function withQuery(url, params) {
  if (!params) return url
  const query = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&')
  if (!query) return url
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + query
}

const http = {
  get: (url, params, extra) =>
    request(Object.assign({ url: withQuery(url, params), method: 'GET' }, extra)),
  post: (url, data, extra) => request(Object.assign({ url, method: 'POST', data }, extra)),
}

module.exports = {
  request,
  http,
  getToken,
  setToken,
  clearSession,
  silentLogin,
  relogin,
  withQuery,
  CODE_LOGIN_INVALID,
}
