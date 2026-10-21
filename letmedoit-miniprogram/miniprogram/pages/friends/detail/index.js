const friendApi = require('../../../services/friend')
const { presentUser } = require('../../../utils/present')

Page({
  data: {
    friend: null,
    count: 0,
  },

  onLoad(options) {
    this.friendId = options.fid || ''
    const name = decodeURIComponent(options.name || '好友')
    const u = presentUser({ id: options.uid || name, nickname: name })
    this.setData({
      friend: Object.assign(u, { uid: options.uid || '' }),
      count: Number(options.count || 0),
    })
  },

  assign() {
    wx.navigateTo({ url: '/pages/tasks/create/index?assigneeIds=' + this.data.friend.uid })
  },

  remove() {
    wx.showModal({
      title: '解除好友关系？',
      content: '解除后不能再给对方派活，正在进行的任务不受影响。',
      confirmText: '解除',
      confirmColor: '#D64545',
      success: (res) => {
        if (!res.confirm) return
        friendApi
          .remove(this.friendId)
          .then(() => {
            wx.showToast({ title: '已解除', icon: 'none' })
            getApp().globalData.needRefresh = true
            setTimeout(() => wx.navigateBack(), 600)
          })
          .catch((e) => wx.showToast({ title: e.message || '操作失败', icon: 'none' }))
      },
    })
  },
})
