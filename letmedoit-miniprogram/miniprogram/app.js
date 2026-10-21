const auth = require('./services/auth')
const { getToken } = require('./utils/request')

App({
  globalData: {
    user: null,
    statusBarHeight: 20,
    navHeight: 44,
    unread: 0,
    // 从其它页面返回列表时是否强制刷新
    needRefresh: false,
  },

  onLaunch() {
    this.initMetrics()
  },

  /** 自定义导航栏需要的高度：胶囊按钮对齐 */
  initMetrics() {
    let win = {}
    try {
      win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) {
      win = {}
    }
    const statusBarHeight = win.statusBarHeight || 20
    let navHeight = 44
    try {
      const rect = wx.getMenuButtonBoundingClientRect()
      if (rect && rect.height) {
        navHeight = (rect.top - statusBarHeight) * 2 + rect.height
      }
    } catch (e) {
      // 取不到就用默认值
    }
    this.globalData.statusBarHeight = statusBarHeight
    this.globalData.navHeight = navHeight
  },

  /**
   * 保证已登录：无 token 先静默登录，再拉一次资料
   * @returns {Promise<object>} user
   */
  async ensureLogin() {
    if (this.globalData.user) return this.globalData.user
    if (!getToken()) {
      await auth.login()
    }
    const user = await auth.getProfile()
    this.globalData.user = user
    return user
  },

  refreshUser() {
    return auth.getProfile().then((user) => {
      this.globalData.user = user
      return user
    })
  },

  /** 登录失败时统一跳到登录页 */
  redirectToLogin() {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    const redirect = current ? current.route : 'pages/tasks/index/index'
    wx.reLaunch({ url: '/pages/launch/index?redirect=' + encodeURIComponent(redirect) })
  },
})
