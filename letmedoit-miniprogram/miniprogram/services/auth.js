/**
 * 登录与资料
 *
 * 登录走微信一键登录：wx.login 拿 code → /api/auth/login 换 token；
 * 之后所有请求由 utils/request 自动带上 App-Token，页面不用关心。
 */
const { http, silentLogin, clearSession } = require('../utils/request')
const adapt = require('./adapt')

/**
 * 微信登录
 * @param {{nickname?:string, avatarUrl?:string}} profile 微信授权拿到的资料；用户拒绝授权时传空
 */
async function login(profile) {
  const result = await silentLogin(profile)
  return adapt.member(result.member)
}

/** 当前登录会员资料 */
function getProfile() {
  return http.get('/api/member/info').then(adapt.member)
}

/**
 * 设定昵称头像（只能成功一次，之后服务端会拒绝）
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
      // token 与本地缓存的用户资料一起清掉
      if (app && app.clearUser) app.clearUser()
      wx.reLaunch({ url: '/pages/launch/index' })
    })
}

module.exports = { login, getProfile, updateProfile, logout }
