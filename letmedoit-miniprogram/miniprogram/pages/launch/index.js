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
    // 已经登录过：静默续登，不再弹授权
    if (getToken()) this.login(true)
  },

  /** 按钮点击：先要微信资料，再登录 */
  onTapLogin() {
    this.login(false)
  },

  /**
   * 登录
   * @param {boolean} silent true 表示已登录用户续登，不弹授权框
   */
  async login(silent) {
    if (this.data.loading) return
    this.setData({ loading: true, tip: '' })

    let profile = null
    if (!silent) {
      profile = await this.askWechatProfile()
      if (!profile) {
        // 用户拒绝授权：照常登录，服务端会给「用户XXXX」兜底昵称
        this.setData({ tip: '可以先用默认名字，之后在「我的」里换微信头像' })
      }
    }

    try {
      await auth.login(profile)
      if (this.invite) {
        try {
          await friendApi.acceptInviteCode(this.invite)
        } catch (e) {
          // 邀请码无效不阻断登录
        }
      }
      const user = await getApp().refreshUser()
      if (!user) throw new Error('登录失败，再试一次')
      this.go()
    } catch (e) {
      this.setData({ loading: false, tip: e.message || '登录失败，再试一次' })
    }
  },

  /**
   * 拉一次微信昵称头像
   * 微信 2022-10 之后不再返回真实资料（只有「微信用户」+ 灰头像），
   * 真机上等价于拿不到；拿到占位值也当没授权，交给服务端兜底。
   * @returns {Promise<{nickname:string, avatarUrl:string}|null>}
   */
  askWechatProfile() {
    return new Promise((resolve) => {
      if (!wx.getUserProfile) {
        resolve(null)
        return
      }
      wx.getUserProfile({
        desc: '用于在好友之间显示你的头像和昵称',
        success: (res) => {
          const info = res.userInfo || {}
          const nickname = (info.nickName || '').trim()
          if (!nickname || nickname === '微信用户') {
            resolve(null)
            return
          }
          resolve({ nickname, avatarUrl: info.avatarUrl || '' })
        },
        fail: () => resolve(null),
      })
    })
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
