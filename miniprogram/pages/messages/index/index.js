const noticeApi = require('../../../services/notice')
const { presentNotice } = require('../../../utils/present')

Page({
  data: {
    list: [],
    unread: 0,
    loading: true,
    hasMore: false,
    cursor: '',
  },

  onLoad() {
    this.bootstrap()
  },

  async bootstrap() {
    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const res = await noticeApi.list({})
      this.setData({
        list: (res.list || []).map(presentNotice),
        unread: res.unreadCount || 0,
        cursor: res.nextCursor || '',
        hasMore: !!res.hasMore,
        loading: false,
      })
      getApp().globalData.unread = res.unreadCount || 0
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async markAll() {
    try {
      await noticeApi.markRead(null)
      const list = this.data.list.map((m) => Object.assign({}, m, { read: true }))
      this.setData({ list, unread: 0 })
      getApp().globalData.unread = 0
      wx.showToast({ title: '都读过了', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async openTask(e) {
    const { id, taskid } = e.currentTarget.dataset
    if (!taskid) return
    // 点开即已读
    const item = this.data.list.find((m) => m.id === id)
    if (item && !item.read) {
      noticeApi.markRead([id]).catch(() => {})
      const list = this.data.list.map((m) => (m.id === id ? Object.assign({}, m, { read: true }) : m))
      this.setData({ list, unread: Math.max(this.data.unread - 1, 0) })
    }
    wx.navigateTo({
      url: '/pages/tasks/detail/index?id=' + taskid,
      fail: () => wx.switchTab({ url: '/pages/tasks/index/index' }),
    })
  },

  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (!this.data.hasMore) return
    noticeApi
      .list({ cursor: this.data.cursor })
      .then((res) => {
        this.setData({
          list: this.data.list.concat((res.list || []).map(presentNotice)),
          cursor: res.nextCursor || '',
          hasMore: !!res.hasMore,
        })
      })
      .catch(() => {})
  },
})
