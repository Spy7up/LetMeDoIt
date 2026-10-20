/**
 * 登录与资料
 */
const { http, setSession, clearSession } = require('../utils/request')

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('微信登录失败'))),
      fail: () => reject(new Error('微信登录失败')),
    })
  })
}

async function login() {
  const code = await wxLogin()
  const session = await http.post('/auth/login', { code })
  setSession(session)
  return session.user
}

function getProfile() {
  return http.get('/users/me')
}

function updateProfile(dto) {
  return http.patch('/users/me', dto)
}

function logout() {
  clearSession()
  wx.reLaunch({ url: '/pages/launch/index' })
}

module.exports = { login, getProfile, updateProfile, logout }
