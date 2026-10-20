/**
 * 统一请求层
 * 职责：拆信封、注入 token、401 静默重登一次、错误归一化、Mock 分流。
 * 页面与 services 都不允许直接使用 wx.request。
 */
const config = require('../config/index')

const TOKEN_KEY = 'lmd_access_token'
const REFRESH_KEY = 'lmd_refresh_token'

let reloginPromise = null

/* ---------------- session ---------------- */

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setSession(session) {
  wx.setStorageSync(TOKEN_KEY, session.accessToken || '')
  wx.setStorageSync(REFRESH_KEY, session.refreshToken || '')
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(REFRESH_KEY)
}

/* ---------------- 错误归一化 ---------------- */

function makeError(payload, fallbackMessage) {
  const err = new Error(payload.message || fallbackMessage || '请求失败')
  err.code = payload.code == null ? -1 : payload.code
  err.field = payload.field || ''
  err.traceId = payload.traceId || ''
  err.raw = payload
  return err
}

/* ---------------- 底层发送 ---------------- */

function send(options) {
  const { url, method = 'GET', data, header = {}, timeout } = options

  if (config.USE_MOCK) {
    // 延迟 require，避免 mock 与 request 循环依赖
    const mock = require('../mock/server')
    return mock.handle({ url, method, data })
  }

  return new Promise((resolve, reject) => {
    const token = getToken()
    wx.request({
      url: config.BASE_URL + url,
      method,
      data,
      timeout: timeout || config.TIMEOUT,
      header: Object.assign(
        {
          'Content-Type': 'application/json',
          Authorization: token ? 'Bearer ' + token : '',
        },
        header
      ),
      success(res) {
        if (res.statusCode === 401) {
          return resolve({ code: 40100, message: '登录已失效' })
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve(res.data)
        }
        resolve(
          Object.assign(
            { code: res.statusCode * 100 || 50000, message: '服务开小差了' },
            typeof res.data === 'object' ? res.data : {}
          )
        )
      },
      fail(err) {
        reject(
          makeError(
            { code: -1, message: '网络不可用，请检查网络后重试' },
            (err && err.errMsg) || ''
          )
        )
      },
    })
  })
}

/* ---------------- 静默重登 ---------------- */

function relogin() {
  if (reloginPromise) return reloginPromise

  reloginPromise = new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) return reject(makeError({ code: 40100, message: '登录失败' }))
        send({ url: '/auth/login', method: 'POST', data: { code: res.code } })
          .then((envelope) => {
            if (envelope.code !== 0) {
              return reject(makeError(envelope))
            }
            setSession(envelope.data)
            resolve(envelope.data)
          })
          .catch(reject)
      },
      fail() {
        reject(makeError({ code: 40100, message: '登录失败' }))
      },
    }).catch((err) => {
      reloginPromise = null
      throw err
    })
  })

  reloginPromise.catch(() => {})
  return reloginPromise
}

/* ---------------- 对外入口 ---------------- */

/**
 * @param {{url:string, method?:string, data?:object, loading?:string, auth?:boolean}} options
 * @returns {Promise<any>} 直接返回 data 字段
 */
async function request(options, retried) {
  if (options.loading) {
    wx.showLoading({ title: options.loading, mask: true })
  }

  let envelope
  try {
    envelope = await send(options)
  } finally {
    if (options.loading) wx.hideLoading()
  }

  if (envelope.code === 0) return envelope.data

  // token 失效：静默重登并重放一次
  if (envelope.code === 40100 && !retried) {
    try {
      await relogin()
    } catch (e) {
      clearSession()
      gotoLogin()
      throw makeError({ code: 40100, message: '请先登录' })
    }
    return request(options, true)
  }

  if (envelope.code === 40100) {
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

const http = {
  get: (url, params, extra) =>
    request(Object.assign({ url: withQuery(url, params), method: 'GET' }, extra)),
  post: (url, data, extra) => request(Object.assign({ url, method: 'POST', data }, extra)),
  patch: (url, data, extra) => request(Object.assign({ url, method: 'PATCH', data }, extra)),
  del: (url, data, extra) => request(Object.assign({ url, method: 'DELETE', data }, extra)),
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

module.exports = {
  request,
  http,
  getToken,
  setSession,
  clearSession,
  withQuery,
}
