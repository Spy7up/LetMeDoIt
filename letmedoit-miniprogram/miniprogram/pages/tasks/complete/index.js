const taskApi = require('../../../services/task')
const { presentDetail } = require('../../../utils/present')

const QUICK = ['我搞定了', '已扫完', '马上到', '弄完了']

Page({
  data: {
    task: null,
    remark: '',
    images: [],
    quick: QUICK,
    loading: true,
    submitting: false,
    maxImages: 3,
    hint: '',
  },

  onLoad(options) {
    this.taskId = options.id || ''
    if (!this.taskId) {
      wx.showToast({ title: '缺少任务 id', icon: 'none' })
      return
    }
    this.load()
  },

  async load() {
    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    try {
      const d = await taskApi.detail(this.taskId)
      const p = presentDetail(d)
      const left = p.totalCount - p.doneCount
      let hint = ''
      if (p.completionMode === 'any' && left > 1) {
        hint = '你做完，这单就算完成，其他人不用做了'
      } else if (p.completionMode === 'all' && left > 1) {
        hint = '完成后进度更新为 ' + (p.doneCount + 1) + '/' + p.totalCount + '，还差 ' + (left - 1) + ' 人'
      } else {
        hint = '完成这条任务就结束了'
      }
      this.setData({ task: p, loading: false, hint })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  useQuick(e) {
    const text = e.currentTarget.dataset.text
    const remark = this.data.remark
    this.setData({ remark: remark ? remark + '，' + text : text })
  },

  chooseImage() {
    const left = this.data.maxImages - this.data.images.length
    if (left <= 0) return
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({ images: this.data.images.concat(paths) })
      },
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(idx, 1)
    this.setData({ images })
  },

  previewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images })
  },

  async submit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await taskApi.complete(this.taskId, {
        remark: this.data.remark,
        images: this.data.images,
      })
      getApp().globalData.needRefresh = true
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '干得漂亮，已告诉对方', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },
})
