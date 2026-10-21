const auth = require('../../services/auth')
const friendApi = require('../../services/friend')
const { getToken } = require('../../utils/request')

Page({
  data: {
    statusBarHeight: 20,
    loading: false,
    tip: '',
  },

  onLoad(options) {
    this.redirect = options.redirect ? decodeURIComponent(options.redirect) : ''
    this.invite = options.invite || ''
    this.setData({ statusBarHeight: getApp().globalData.statusBarHeight })
    if (getToken()) this.login()
  },

  async login() {
    if (this.data.loading) return
    this.setData({ loading: true, tip: '' })
    try {
      await auth.login()
      if (this.invite) {
        try {
          await friendApi.acceptInviteCode(this.invite)
        } catch (e) {
          // 邀请码无效不阻断登录
        }
      }
      const user = await auth.getProfile()
      getApp().globalData.user = user
      this.go()
    } catch (e) {
      this.setData({ loading: false, tip: e.message || '登录失败，再试一次' })
    }
  },

  go() {
    const tabs = ['pages/tasks/index/index', 'pages/friends/index/index', 'pages/mine/index/index']
    const target = this.redirect || 'pages/tasks/index/index'
    if (tabs.indexOf(target) >= 0) {
      wx.switchTab({ url: '/' + target })
    } else {
      wx.reLaunch({ url: '/' + target })
    }
  },
})
