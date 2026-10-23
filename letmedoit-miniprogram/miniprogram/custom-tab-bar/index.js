/**
 * 自定义 tabBar：悬浮液态玻璃胶囊
 *
 * 原生 tabBar 由微信渲染，改不了样式，所以用 custom: true + 本组件替代。
 * 每个 tab 页在 onShow 里同步 selected（组件实例是按页面独立的）。
 */
Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/tasks/index/index',
        text: '任务',
        icon: '/images/icons/tab-task.png',
        iconOn: '/images/icons/tab-task-on.png',
      },
      {
        pagePath: '/pages/friends/index/index',
        text: '好友',
        icon: '/images/icons/tab-users.png',
        iconOn: '/images/icons/tab-users-on.png',
      },
      {
        pagePath: '/pages/mine/index/index',
        text: '我的',
        icon: '/images/icons/tab-me.png',
        iconOn: '/images/icons/tab-me-on.png',
      },
    ],
  },

  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.selected) return
      const target = this.data.list[index]
      if (!target) return

      // 先切图标，避免网络/渲染延迟带来"点了没反应"
      this.setData({ selected: index })
      wx.switchTab({
        url: target.pagePath,
        fail: () => this.setData({ selected: this.data.selected }),
      })
    },
  },
})
