/**
 * 用户头像
 *
 * 两层结构：
 *   1. 有公网地址（services/file 上传后的 https URL）→ 显示图片；
 *   2. 没有 / 图片加载失败 → 回落到「昵称末字 + 稳定色块」，永不留白。
 *
 * 全站头像都走这个组件，binderror 的兜底只需要写一次。
 * user 需要是 utils/present.js#presentUser 加工过的对象（avatarUrl / initial / avatarStyle）。
 */
Component({
  properties: {
    user: {
      type: Object,
      value: {},
    },
    /** 24 / 28 / 32 / 56 */
    size: {
      type: String,
      value: '32',
    },
    /** 白边（叠头像时用） */
    ring: {
      type: Boolean,
      value: false,
    },
    /** 左侧负边距，和上一个头像叠在一起 */
    overlap: {
      type: Boolean,
      value: false,
    },
    /** 右下角状态点：done / rejected */
    flag: {
      type: String,
      value: '',
    },
  },

  data: {
    failed: false,
  },

  observers: {
    'user.avatarUrl': function (url) {
      // 换图要重置失败标记，否则上一张失败会一直挡住新头像
      if (url && this.data.failed) {
        this.setData({ failed: false })
      }
    },
  },

  methods: {
    onError() {
      this.setData({ failed: true })
    },
  },
})
