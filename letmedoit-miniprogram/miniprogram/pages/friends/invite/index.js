/**
 * 加好友页（从分享卡片进来）
 *
 * 和「好友列表」是两个页面：
 * 收到卡片的人只关心「谁邀请我、要不要加」，给他看好友列表和邀请码输入框是噪音。
 * 自己点自己的卡片，直接跳回好友列表 —— 那才是他想要的。
 */
const friendApi = require('../../../services/friend')
const entry = require('../../../utils/entry')
const { presentUser } = require('../../../utils/present')

Page({
  data: {
    preview: null,
    loading: true,
    error: '',
    acting: false,
    joined: false,
  },

  onLoad(options) {
    this.code = String((options && options.code) || '').trim().toUpperCase()
    // 登录/引导完成后要回到这里，所以路径必须带参数一起记下来
    this.route = entry.routeOf('pages/friends/invite/index', options)
    if (!this.code) {
      this.setData({ loading: false, error: '链接里没有邀请码' })
      return
    }
    this.bootstrap()
  },

  /**
   * 分享卡片可能冷启动直接进来，不经过首页，所以这里自己兜住登录与首登引导。
   * 已经跳走了就直接 return，别再发请求。
   */
  async bootstrap() {
    if (await entry.ensureEntry(this.route)) return
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const p = await friendApi.invitePreview(this.code)
      // 自己点开自己的卡片：不该看到「加我」，直接回好友列表。
      // 先把 loading 收掉 —— 好友列表是 tabBar 页，万一跳转失败也不会停在「加载中…」
      if (p.selfFlag) {
        this.setData({ loading: false })
        this.goFriends()
        return
      }
      this.setData({
        preview: Object.assign(
          presentUser({ id: p.memberId, nickname: p.nickname, avatarUrl: p.avatar }),
          { inviteCode: p.inviteCode, friendFlag: !!p.friendFlag }
        ),
        loading: false,
        error: '',
      })
      this.setTitle(p.nickname + ' 想加你')
    } catch (e) {
      this.setData({ loading: false, error: e.message || '邀请码无效' })
    }
  },

  /** 改标题失败不能连累正文，单独兜一层 */
  setTitle(title) {
    try {
      if (title && wx.setNavigationBarTitle) {
        wx.setNavigationBarTitle({ title })
      }
    } catch (e) {
      // 忽略
    }
  },

  async onAdd() {
    if (this.data.acting || this.data.joined) return
    this.setData({ acting: true })
    try {
      await friendApi.acceptInviteCode(this.code)
      getApp().globalData.needRefresh = true
      // 加上之后立刻把按钮切成「去看看好友」：
      // 只把 joined 置 true、button 还绑在 onAdd 上的话，再点会因为 joined 直接 return，看起来就是"点了没反应"
      this.setData({
        preview: Object.assign({}, this.data.preview, { friendFlag: true }),
        joined: true,
        acting: false,
      })
      wx.vibrateShort({ type: 'light' })
      wx.showToast({ title: '加上了', icon: 'none' })
      // 停一拍让用户看到结果，再进好友列表
      setTimeout(() => this.goFriends(), 900)
    } catch (e) {
      wx.showToast({ title: e.message || '加好友失败', icon: 'none' })
      this.setData({ acting: false })
    }
  },

  /**
   * 去好友列表
   *
   * 好友列表在 tabBar 里，只能用 switchTab。用 redirectTo / navigateTo 会
   * 静默失败（控制台只有一行 fail，页面没有任何变化），以前就是踩了这个坑。
   */
  goFriends() {
    wx.switchTab({ url: '/pages/friends/index/index' })
  },
})
