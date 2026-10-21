const auth = require('./services/auth')
const { getToken } = require('./utils/request')

/** 本地缓存的用户资料：冷启动先拿它渲染，避免昵称头像闪一下 */
const USER_KEY = 'lmd_user'

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
    this.restoreUser()
  },

  /** 冷启动恢复本地缓存的用户资料 */
  restoreUser() {
    try {
      const cached = wx.getStorageSync(USER_KEY)
      if (cached && cached.id) this.globalData.user = cached
    } catch (e) {
      // 缓存损坏就当没有
    }
  },

  /** 写内存 + 落本地（退出登录时由 clearUser 清掉） */
  setUser(user) {
    this.globalData.user = user || null
    try {
      if (user && user.id) wx.setStorageSync(USER_KEY, user)
      else wx.removeStorageSync(USER_KEY)
    } catch (e) {
      // 存储失败不影响本次会话
    }
    return user
  },

  clearUser() {
    this.globalData.user = null
    try {
      wx.removeStorageSync(USER_KEY)
    } catch (e) {
      // 忽略
    }
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
   * 保证已登录：优先用本地缓存的资料，没有再静默登录 + 拉一次
   * @returns {Promise<object>} user
   */
  async ensureLogin() {
    if (this.globalData.user) return this.globalData.user
    if (!getToken()) {
      await auth.login()
    }
    const user = await auth.getProfile()
    return this.setUser(user)
  },

  refreshUser() {
    return auth.getProfile().then((user) => this.setUser(user))
  },

  /** 登录失败时统一跳到登录页 */
  redirectToLogin() {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    const redirect = current ? current.route : 'pages/tasks/index/index'
    wx.reLaunch({ url: '/pages/launch/index?redirect=' + encodeURIComponent(redirect) })
  },
})
