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
 * @param {{nickname?:string, avatarUrl?:string}} profile 微信资料；小程序端已不再传（getUserProfile 拿不到真实资料）
 */
async function login(profile) {
  const result = await silentLogin(profile)
  const member = adapt.member(result.member)
  // 仅本次调用有意义：是否首次注册，用来决定登录后要不要引导补头像昵称。
  // 不参与业务，refreshUser 用服务端数据覆盖后就没有了。
  member.newUser = !!result.newUser
  return member
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
