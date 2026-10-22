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
    // 已经登录过：静默续登，不走任何授权/引导
    if (getToken()) this.login(true)
  },

  /** 按钮点击：登录 */
  onTapLogin() {
    this.login(false)
  },

  /**
   * 登录
   *
   * 这里**不再**调 wx.getUserProfile：微信 2022-10 起该接口只返回
   * 「微信用户」+ 灰色占位头像，拿不到真实资料，调了只是浪费一次交互。
   * 头像昵称改为登录后一屏引导（pages/mine/profile/index?from=launch），
   * 使用官方唯一可用的 chooseAvatar + input type=nickname，且可跳过。
   *
   * @param {boolean} silent true 表示已登录用户续登，不引导补资料
   */
  async login(silent) {
    if (this.data.loading) return
    this.setData({ loading: true, tip: '' })

    try {
      const me = await auth.login()
      if (this.invite) {
        try {
          await friendApi.acceptInviteCode(this.invite)
        } catch (e) {
          // 邀请码无效不阻断登录
        }
      }
      const user = await getApp().refreshUser()
      if (!user) throw new Error('登录失败，再试一次')

      // 只有首次注册才引导，老用户不打扰；从邀请链接进来的先看任务，别打断
      if (!silent && me && me.newUser && !this.invite) {
        wx.redirectTo({ url: '/pages/mine/profile/index?from=launch' })
        return
      }
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
