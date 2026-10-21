/**
 * 登录与资料
 *
 * 登录走微信一键登录：wx.login 拿 code → /api/auth/login 换 token；
 * 之后所有请求由 utils/request 自动带上 App-Token，页面不用关心。
 */
const { http, silentLogin, clearSession } = require('../utils/request')
const adapt = require('./adapt')

/** 微信静默登录，成功后 token 已写入本地 */
async function login() {
  const result = await silentLogin()
  return adapt.member(result.member)
}

/** 当前登录会员资料 */
function getProfile() {
  return http.get('/api/member/info').then(adapt.member)
}

/**
 * 同步昵称头像
 * @param {{nickname:string, avatarUrl?:string}} dto
 */
function updateProfile(dto) {
  return http
    .post('/api/member/profile', {
      nickname: dto.nickname,
      avatar: dto.avatarUrl || '',
    })
    .then(adapt.member)
}

function logout() {
  // 通知服务端注销 token，失败也要清本地
  http
    .post('/api/auth/logout')
    .catch(() => {})
    .then(() => {
      clearSession()
      const app = getApp()
      if (app && app.globalData) app.globalData.user = null
      wx.reLaunch({ url: '/pages/launch/index' })
    })
}

module.exports = { login, getProfile, updateProfile, logout }
