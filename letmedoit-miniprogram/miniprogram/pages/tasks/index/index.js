const taskApi = require('../../../services/task')
const noticeApi = require('../../../services/notice')
const { STATUS_FILTERS } = require('../../../constants/task')
const { presentTask, presentUser } = require('../../../utils/present')

const EMPTY_TEXT = {
  assignee: {
    all: { title: '暂时没人麻烦你', sub: '清静是好事。也可以反过来，\n拉上几个人一起干。', action: '布置一条任务' },
    other: { title: '这个状态下还没有任务', sub: '换个筛选看看', action: '看全部' },
  },
  creator: {
    all: { title: '还没派过活儿', sub: '让 TA 帮你记着，\n比在微信里说一遍靠谱。', action: '布置一条任务' },
    other: { title: '这个状态下还没有任务', sub: '换个筛选看看', action: '看全部' },
  },
}

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 44,
    role: 'assignee',
    status: 'all',
    filters: STATUS_FILTERS,
    summary: { assignee: 0, creator: 0, overdue: 0 },
    bannerUsers: [],
    bannerSub: '',
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    cursor: '',
    unread: 0,
    empty: EMPTY_TEXT.assignee.all,
    error: '',
    acting: '',
  },

  onLoad() {
    const app = getApp()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navHeight: app.globalData.navHeight,
    })
    this.bootstrap()
  },

  onShow() {
    // 自定义 tabBar 的选中态是每个页面独立的，进入时同步一次
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    if (this.ready) this.refresh()
  },

  async bootstrap() {
    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    this.ready = true
    await this.reload()
    this.loadSummary()
    this.loadUnread()
  },

  /* ---------------- 数据 ---------------- */

  async reload() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await taskApi.list({ role: this.data.role, status: this.data.status })
      this.setData({
        list: res.list.map(presentTask),
        cursor: res.nextCursor || '',
        hasMore: !!res.hasMore,
        loading: false,
        empty: this.emptyOf(),
      })
    } catch (e) {
      this.setData({ loading: false, error: e.message || '没加载出来' })
    }
  },

  async refresh() {
    try {
      const res = await taskApi.list({ role: this.data.role, status: this.data.status })
      this.setData({
        list: res.list.map(presentTask),
        cursor: res.nextCursor || '',
        hasMore: !!res.hasMore,
        loading: false,
        error: '',
      })
    } catch (e) {
      // 静默失败：保留旧内容
      this.setData({ loading: false })
    }
    this.loadSummary()
    this.loadUnread()
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    try {
      const res = await taskApi.list({
        role: this.data.role,
        status: this.data.status,
        cursor: this.data.cursor,
      })
      this.setData({
        list: this.data.list.concat(res.list.map(presentTask)),
        cursor: res.nextCursor || '',
        hasMore: !!res.hasMore,
        loadingMore: false,
      })
    } catch (e) {
      this.setData({ loadingMore: false })
    }
  },

  async loadSummary() {
    try {
      const s = await taskApi.summary()
      const users = (s.waitingUsers || []).map(presentUser)
      const names = users.map((u) => u.nickname)
      let sub = ''
      if (s.overdue > 0) {
        sub = s.overdue + ' 件已经晚了'
      } else if (s.assignee === 0) {
        sub = '今天没有待办，去派个活儿'
      } else if (names.length) {
        sub = names.slice(0, 2).join('、') + ' 在等你'
      } else {
        sub = '都在你手上'
      }
      this.setData({
        summary: { assignee: s.assignee || 0, creator: s.creator || 0, overdue: s.overdue || 0 },
        bannerUsers: users,
        bannerSub: sub,
      })
    } catch (e) {
      // 摘要失败不影响列表
    }
  },

  async loadUnread() {
    try {
      const n = await noticeApi.unreadCount()
      getApp().globalData.unread = n
      this.setData({ unread: n })
    } catch (e) {
      // 忽略
    }
  },

  emptyOf() {
    const group = EMPTY_TEXT[this.data.role] || EMPTY_TEXT.assignee
    return this.data.status === 'all' ? group.all : group.other
  },

  /* ---------------- 交互 ---------------- */

  switchRole(e) {
    const role = e.currentTarget.dataset.role
    if (role === this.data.role) return
    this.setData({ role, list: [], loading: true })
    this.reload()
  },

  switchStatus(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.status) return
    this.setData({ status: key, list: [], loading: true, empty: this.emptyOf() })
    this.reload()
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/tasks/detail/index?id=' + e.currentTarget.dataset.id })
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/tasks/create/index' })
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/messages/index/index' })
  },

  emptyAction() {
    if (this.data.status !== 'all') {
      this.setData({ status: 'all', list: [], loading: true })
      this.reload()
      return
    }
    this.goCreate()
  },

  async onAccept(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.acting) return
    this.setData({ acting: id })
    try {
      await taskApi.accept(id)
      wx.showToast({ title: '已接下，开始吧', icon: 'none' })
      this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      this.refresh()
    } finally {
      this.setData({ acting: '' })
    }
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '说说为什么',
      editable: true,
      placeholderText: '比如：今晚不在家',
      confirmText: '拒绝',
      success: (res) => {
        if (!res.confirm) return
        const reason = (res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '还是说一句吧', icon: 'none' })
          return
        }
        taskApi
          .reject(id, reason)
          .then(() => {
            wx.showToast({ title: '已回复对方', icon: 'none' })
            this.refresh()
          })
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      },
    })
  },

  goComplete(e) {
    wx.navigateTo({ url: '/pages/tasks/complete/index?id=' + e.currentTarget.dataset.id })
  },

  async onRemind(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.acting) return
    this.setData({ acting: id })
    try {
      await taskApi.remind(id)
      wx.showToast({ title: '已提醒', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: err.message || '刚催过啦', icon: 'none' })
    } finally {
      this.setData({ acting: '' })
    }
  },

  /* ---------------- 下拉与触底 ---------------- */

  async onPullDownRefresh() {
    await this.refresh()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    this.loadMore()
  },

  onShareAppMessage() {
    return {
      title: '让我做 · 别人让你做的小事，说一遍就够',
      path: '/pages/tasks/index/index',
    }
  },
})
