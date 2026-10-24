const taskApi = require('../../../services/task')
const notifyApi = require('../../../services/notify')
const noticeApi = require('../../../services/notice')
const entry = require('../../../utils/entry')
const { STATUS_FILTERS, TIME_RANGES } = require('../../../constants/task')
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
    navRightPad: '32rpx',
    role: 'assignee',
    status: 'all',
    // 创建时间筛选：默认不限，排序始终是倒序（后端 update_time DESC）
    timeRange: 'all',
    timeLabel: '时间',
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
      // 取不到胶囊宽度时回退到原来的 32rpx，不能把右边距清成 0
      navRightPad: app.globalData.capsuleSpace ? app.globalData.capsuleSpace + 'px' : '32rpx',
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
    // 第一次用（本地没 token）先去登录 + 补头像昵称，回来再加载。
    // 以前这里是静默登录，结果新用户直接被注册成「用户XXXX」，引导页永远走不到。
    if (await entry.ensureEntry('pages/tasks/index/index')) return
    this.ready = true
    await this.reload()
    this.loadSummary()
    this.loadUnread()
  },

  /* ---------------- 数据 ---------------- */

  async reload() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await taskApi.list({
        role: this.data.role,
        status: this.data.status,
        timeRange: this.data.timeRange,
      })
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
      const res = await taskApi.list({
        role: this.data.role,
        status: this.data.status,
        timeRange: this.data.timeRange,
      })
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
        timeRange: this.data.timeRange,
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
    // 时间筛选优先：这段时间没东西，不一定是真的没活儿
    if (this.data.timeRange !== 'all') {
      const label = (TIME_RANGES.find((t) => t.key === this.data.timeRange) || {}).label || ''
      return { title: label + '还没有任务', sub: '换个时间范围，或看看全部', action: '看全部' }
    }
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

  /** 创建时间筛选：不限 / 今天 / 近 7 天 / 近 30 天 */
  pickTimeRange() {
    wx.showActionSheet({
      itemList: TIME_RANGES.map((t) => t.label),
      success: (res) => {
        const picked = TIME_RANGES[res.tapIndex]
        if (!picked || picked.key === this.data.timeRange) return
        this.setData({
          timeRange: picked.key,
          // 默认不限时按钮上只写「时间」，不占视觉
          timeLabel: picked.key === 'all' ? '时间' : picked.label,
          list: [],
          loading: true,
        })
        this.reload()
      },
    })
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
    // 时间/状态筛出来的空列表，先回到「全部 + 不限时间」
    if (this.data.timeRange !== 'all' || this.data.status !== 'all') {
      this.setData({
        timeRange: 'all',
        timeLabel: '时间',
        status: 'all',
        list: [],
        loading: true,
      })
      this.reload()
      return
    }
    this.goCreate()
  },

  async onAccept(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.acting) return
    this.setData({ acting: id })
    // 同上：保持在 tap 回调的第一个 await，模板未配置时自动跳过
    await notifyApi.requestSubscribe(['TASK_REMIND', 'TASK_ASSIGNED'])
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
