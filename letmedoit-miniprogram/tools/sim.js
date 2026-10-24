/**
 * 联调自检：真 HTTP + 真请求层 + 真页面
 *
 * 做法：
 *  1. 起 tools/contract-server（按 sa-app 接口契约实现的本地服务）
 *  2. 桩出 wx / App / Page，把 wx.request 接到真实 http 请求上
 *  3. 加载 app.js 与全部页面，跑「登录 → 列表 → 详情 → 接受 → 完成 → 布置 → 通知 → 好友 → 我的」
 *
 * 这样 request.js 的鉴权头、信封解析、30007 重登，以及 services/adapt.js 的字段映射
 * 全部走真实代码路径，只有数据源是内存的（本机没有 MySQL / Redis）。
 *
 * 用法：node tools/sim.js
 */
const path = require('path')
const http = require('http')
const { URL } = require('url')

const ROOT = path.resolve(__dirname, '../miniprogram')
const contract = require('./contract-server')

/* ---------------- 环境桩 ---------------- */

const storage = {}
const calls = { toast: [], nav: [], tab: [], modal: [], clipboard: [], upload: [] }
let appInstance = null
let lastPageConfig = null
let lastHeaders = {}
let baseUrl = ''

function httpRequest(opt) {
  const u = new URL(opt.url)
  const payload = opt.data == null ? '' : JSON.stringify(opt.data)
  lastHeaders = Object.assign({}, opt.header || {})

  const req = http.request(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opt.method || 'GET',
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        opt.header || {}
      ),
    },
    (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        let data = raw
        try {
          data = JSON.parse(raw)
        } catch (e) {
          // 保持原样
        }
        if (opt.success) opt.success({ statusCode: res.statusCode, data })
      })
    }
  )
  req.on('error', (e) => {
    if (opt.fail) opt.fail({ errMsg: 'request:fail ' + e.message })
  })
  if (payload) req.write(payload)
  req.end()
}

global.wx = {
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32, width: 87, right: 368 }),
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => {
    storage[k] = v
  },
  removeStorageSync: (k) => {
    delete storage[k]
  },
  login: (opt) => setTimeout(() => opt.success({ code: 'wx_code_' + Date.now() }), 1),
  request: httpRequest,
  // 上传桩：直接返回一个"已上云"的公网地址，用来验证页面把临时路径换成 URL 的逻辑
  uploadFile: (opt) => {
    const name = opt.name || 'file'
    calls.upload.push({ filePath: opt.filePath, bizType: (opt.formData || {}).bizType })
    setTimeout(
      () =>
        opt.success({
          statusCode: 200,
          data: JSON.stringify({
            code: 0,
            ok: true,
            data: {
              fileUrl: 'https://cdn.test/' + (opt.formData || {}).bizType + '/mock.png',
              fileKey: 'public/app/' + (opt.formData || {}).bizType + '/mock.png',
            },
          }),
        }),
      10
    )
  },
  requestSubscribeMessage: (opt) => opt.success({}),
  showToast: (o) => calls.toast.push(o.title),
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => {
    calls.modal.push(o.title)
    if (o.success) o.success({ confirm: true, content: '今晚不在家' })
  },
  showActionSheet: (o) => {
    if (o.success) o.success({ tapIndex: o.itemList.length - 1 })
  },
  navigateTo: (o) => {
    calls.nav.push(o.url)
    if (o.events) o.__events = o.events
  },
  redirectTo: (o) => calls.nav.push(o.url),
  // tabBar 页只能 switchTab：单独记一份，用来断言「没误用 redirectTo」
  switchTab: (o) => {
    calls.nav.push(o.url)
    calls.tab.push(o.url)
  },
  reLaunch: (o) => calls.nav.push(o.url),
  navigateBack: () => calls.nav.push('back'),
  stopPullDownRefresh: () => {},
  vibrateShort: () => {},
  setNavigationBarTitle: () => {},
  chooseMedia: (o) =>
    o.success({ tempFiles: [{ tempFilePath: 'wxfile://tmp_a.jpg' }, { tempFilePath: 'wxfile://tmp_b.jpg' }] }),
  previewImage: () => {},
  setClipboardData: (o) => {
    calls.clipboard.push(o.data)
    if (o.success) o.success()
  },
}

global.App = (cfg) => {
  appInstance = cfg
}
global.getApp = () => appInstance
global.getCurrentPages = () => []
global.Page = (cfg) => {
  lastPageConfig = cfg
}
global.Component = () => {}

/* ---------------- 页面实例工具 ---------------- */

function setDataFactory(inst) {
  return function setData(patch, cb) {
    Object.keys(patch).forEach((key) => {
      if (key.indexOf('.') < 0 && key.indexOf('[') < 0) {
        inst.data[key] = patch[key]
        return
      }
      const segs = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let cur = inst.data
      for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i]
        if (cur[s] === undefined) cur[s] = {}
        cur = cur[s]
      }
      cur[segs[segs.length - 1]] = patch[key]
    })
    if (cb) cb()
  }
}

function loadPage(route) {
  const file = path.join(ROOT, route + '.js')
  delete require.cache[require.resolve(file)]
  lastPageConfig = null
  require(file)
  if (!lastPageConfig) throw new Error('页面没有调用 Page(): ' + route)

  const inst = Object.create(null)
  Object.keys(lastPageConfig).forEach((k) => {
    inst[k] = lastPageConfig[k]
  })
  inst.data = JSON.parse(JSON.stringify(lastPageConfig.data || {}))
  inst.setData = setDataFactory(inst)
  inst.route = route
  inst.__emitted = {}
  inst.getOpenerEventChannel = () => ({
    emit: (name, payload) => {
      inst.__emitted[name] = payload
    },
  })
  return inst
}

function evt(dataset, detail) {
  return { currentTarget: { dataset: dataset || {} }, detail: detail || {}, target: { dataset: dataset || {} } }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms || 120))

let errors = 0
function check(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg)
  else {
    console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
    errors++
  }
}

/* ---------------- 场景 ---------------- */

async function run() {
  const server = await contract.start({ port: 0 })
  baseUrl = 'http://127.0.0.1:' + server.port

  // 指向本次起的契约服务（request.js 每次请求都读 config.BASE_URL）
  require(path.join(ROOT, 'config/index')).BASE_URL = baseUrl
  require(path.join(ROOT, 'app.js'))
  appInstance.onLaunch()
  global.getApp = () => appInstance

  console.log('契约服务：' + baseUrl)

  console.log('\n[1] 登录与鉴权头')
  const launch = loadPage('pages/launch/index')
  launch.onLoad({})
  await launch.login()
  await wait(200)
  check(!!appInstance.globalData.user, 'launch 页完成登录', launch.data.tip)
  check(!!storage['lmd_app_token'], 'token 已落本地')
  check(lastHeaders['App-Token'].indexOf('Bearer ') === 0, '鉴权头 App-Token: Bearer ' + String(lastHeaders['App-Token']).slice(0, 14) + '…')

  const me = appInstance.globalData.user
  check(me && me.nickname === '小林', '拿到当前用户', me && me.nickname)
  check(me && typeof me.id === 'string' && me.id === '1', '会员 id 转成字符串 ' + (me && me.id))

  console.log('\n[2] 任务列表 / 摘要 / 未读')
  const listPage = loadPage('pages/tasks/index/index')
  listPage.onLoad({})
  await wait(700)
  check(!listPage.data.error, '列表无错误', listPage.data.error)
  check(listPage.data.list.length > 0, '收到任务 ' + listPage.data.list.length + ' 条')
  check(listPage.data.summary.assignee > 0, 'banner 摘要 ' + listPage.data.summary.assignee + ' 件')
  check(!!listPage.data.bannerSub, 'banner 副标题：' + listPage.data.bannerSub)
  check(listPage.data.unread > 0, '未读数 ' + listPage.data.unread)

  const first = listPage.data.list[0]
  check(!!first.headName && !!first.statusClass, '卡片字段齐全 ' + first.title + ' / ' + first.statusLabel)
  check(typeof first.deadline === 'string' && first.deadline.indexOf('T') > 0, '时间已转 ISO 给展示层')
  const multi = listPage.data.list.filter((t) => t.isMulti)
  check(multi.length > 0, '多人任务 ' + multi.length + ' 条，例如：' + (multi[0] && multi[0].title))

  console.log('\n[3] 角色切换与筛选')
  listPage.switchRole(evt({ role: 'creator' }))
  await wait(400)
  check(listPage.data.list.length > 0 && listPage.data.list.every((t) => t.role === 'creator'), '发出列表全是 creator 视角')
  console.log('    发出 ' + listPage.data.list.length + ' 条')

  listPage.switchRole(evt({ role: 'assignee' }))
  await wait(300)
  listPage.switchStatus(evt({ key: 'overdue' }))
  await wait(300)
  check(
    listPage.data.list.length > 0 && listPage.data.list.every((t) => t.displayStatus === 'overdue'),
    '逾期筛选 ' + listPage.data.list.length + ' 条'
  )
  listPage.switchStatus(evt({ key: 'completed' }))
  await wait(300)
  check(listPage.data.list.every((t) => t.displayStatus === 'completed'), '已完成筛选 ' + listPage.data.list.length + ' 条')
  listPage.switchStatus(evt({ key: 'all' }))
  await wait(300)

  // 创建时间筛选：默认不限，选「近 30 天」后按钮变文案并重新拉列表
  const taskSvcForTime = require(path.join(ROOT, 'services/task'))
  const allTime = await taskSvcForTime.list({ role: 'assignee', timeRange: 'all' })
  const todayTime = await taskSvcForTime.list({ role: 'assignee', timeRange: 'today' })
  check(
    todayTime.total <= allTime.total,
    '今天筛选 ' + todayTime.total + ' 条 ≤ 不限 ' + allTime.total + ' 条'
  )
  check(listPage.data.timeRange === 'all' && listPage.data.timeLabel === '时间', '默认时间不限')
  listPage.pickTimeRange()
  await wait(400)
  check(
    listPage.data.timeRange === 'last30' && listPage.data.timeLabel === '近 30 天',
    '选中时间后按钮显示「' + listPage.data.timeLabel + '」'
  )
  check(listPage.data.loading === false, '选完时间已重新拉列表')
  listPage.emptyAction()
  await wait(400)
  check(listPage.data.timeRange === 'all' && listPage.data.timeLabel === '时间', '空态「看全部」把时间重置回不限')

  console.log('\n[4] 分页')
  const page1 = await require(path.join(ROOT, 'services/task')).list({ role: 'assignee', status: 'all' })
  check(page1.list.length === 10 || page1.list.length === page1.total, '首页 ' + page1.list.length + ' 条 / 共 ' + page1.total)
  if (page1.hasMore) {
    const page2 = await require(path.join(ROOT, 'services/task')).list({
      role: 'assignee',
      status: 'all',
      cursor: page1.nextCursor,
    })
    check(page2.list.length > 0, '第二页 ' + page2.list.length + ' 条，游标换算正常')
  } else {
    check(true, '数据不足一页，分页逻辑待有多页数据时验证')
  }

  console.log('\n[5] 列表内接受')
  const pendingItem = listPage.data.list.find((t) => t.showAccept)
  check(!!pendingItem, '存在待接受任务：' + (pendingItem && pendingItem.title))
  if (pendingItem) {
    await listPage.onAccept(evt({ id: pendingItem.id }))
    await wait(400)
    const after = listPage.data.list.find((t) => t.id === pendingItem.id)
    check(!after || after.myStatus !== 'pending', '接受后状态更新')
  }

  console.log('\n[6] 详情页')
  const anyTask = listPage.data.list.find((t) => t.isMulti) || listPage.data.list[0]
  const detail = loadPage('pages/tasks/detail/index')
  detail.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!detail.data.task, '详情加载：' + (detail.data.task && detail.data.task.title))
  check(detail.data.task.participants.length > 0, '参与者 ' + detail.data.task.participants.length + ' 人')
  check(!!detail.data.task.bylineText, '引导语：' + detail.data.task.bylineText)
  check(detail.data.task.events.length > 0, '时间线 ' + detail.data.task.events.length + ' 条')
  check(detail.data.task.barMode !== undefined, '操作条模式：' + detail.data.task.barMode)
  check(detail.data.task.statusClass.indexOf('t-') === 0, '状态样式类 ' + detail.data.task.statusClass)

  // 分享卡片落到「接收页」而不是详情页：点开的人只需要接受/拒绝
  const detailShare = detail.onShareAppMessage()
  check(
    detailShare.path.indexOf('/pages/tasks/receive/index') === 0,
    '详情页转发去接收页：' + detailShare.path
  )

  // 接收页：简洁版，只有四件事 + 一组按钮
  const recv = loadPage('pages/tasks/receive/index')
  recv.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!recv.data.task && !!recv.data.task.title, '接收页拿到任务：' + (recv.data.task && recv.data.task.title))
  check(!!recv.data.scene && !!recv.data.hint, '接收页场景 ' + recv.data.scene + ' / ' + recv.data.hint)
  check(!recv.data.error, '接收页没有报错：' + JSON.stringify(recv.data.error))

  console.log('\n[7] 完成页 + 提交完成')
  const completeApi = loadPage('pages/tasks/complete/index')
  completeApi.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!completeApi.data.task, '完成页拿到任务')
  check(!!completeApi.data.hint, '提示：' + completeApi.data.hint)
  completeApi.useQuick(evt({ text: '我搞定了' }))
  check(completeApi.data.remark === '我搞定了', '快捷语写入备注')
  completeApi.chooseImage()
  // 选完先上传再进列表，等上传桩返回
  await wait(200)
  check(
    completeApi.data.images.length === 2 &&
      completeApi.data.images.every((u) => u.indexOf('https://cdn.test/task-image/') === 0),
    '选图 ' + completeApi.data.images.length + ' 张（已换成公网地址）'
  )

  // 找一个已接受的任务真的完成一次，验证状态机
  const accepted = listPage.data.list.find((t) => t.myStatus === 'accepted')
  if (accepted) {
    const svc = require(path.join(ROOT, 'services/task'))
    const before = await svc.detail(accepted.id)
    const after = await svc.complete(accepted.id, { remark: '已完成', images: [] })
    const meSlot = after.participants.find((p) => p.userId === me.id)
    check(meSlot && meSlot.status === 'done', '完成接口把自己的格子置为 done')
    check(after.progress.done === before.progress.done + 1, '完成数 ' + before.progress.done + ' → ' + after.progress.done)
  } else {
    check(true, '无可完成的任务，跳过状态机验证')
  }

  console.log('\n[8] 布置任务 + 选人（批量追加走同一接口）')
  const create = loadPage('pages/tasks/create/index')
  create.onLoad({})
  await wait(200)
  check(!!create.data.deadlineText, '默认截止：' + create.data.deadlineText)
  check(create.data.canSubmit === false, '未填标题时不能提交')

  const picker = loadPage('pages/tasks/participants/index')
  picker.onLoad({ mode: 'create', selected: '' })
  await wait(400)
  check(picker.data.friends.length > 0, '好友可选 ' + picker.data.friends.length + ' 人')
  picker.toggle(evt({ id: picker.data.friends[0].id }))
  picker.toggle(evt({ id: picker.data.friends[1].id }))
  check(picker.data.selected.length === 2, '选了两个')

  // 勾选态必须挂在 item 上（WXML 里不能调用 indexOf，不预计算选框就不亮）
  const checkedIds = picker.data.friends.filter((f) => f.checked).map((f) => f.id)
  check(checkedIds.length === 2, '列表里勾上了 ' + checkedIds.length + ' 个')
  check(
    picker.data.friends.every((f) => f.checked === (picker.data.selected.indexOf(f.id) >= 0)),
    '每行的 checked 与 selected 一致'
  )
  // 再点一次取消 → 该行勾选态跟着消失
  picker.toggle(evt({ id: picker.data.friends[1].id }))
  check(
    picker.data.friends[1].checked === false && picker.data.selected.length === 1,
    '取消选中后勾选态同步'
  )
  picker.toggle(evt({ id: picker.data.friends[1].id }))
  // 搜索过滤后勾选态不丢
  picker.onKeyword(evt({}, { value: picker.data.friends[0].nickname }))
  check(
    picker.data.friends.length > 0 && picker.data.friends[0].checked === true,
    '搜索后仍保留勾选'
  )
  picker.onKeyword(evt({}, { value: '' }))
  check(picker.data.friends.length === picker.data.all.length, '清空搜索恢复全量')

  // 带 selected 进来时要回填勾选（截图里的场景）
  const picker2 = loadPage('pages/tasks/participants/index')
  picker2.onLoad({ mode: 'create', selected: picker2 && '' })
  await wait(300)
  const firstId = picker2.data.friends[0].id
  const picker3 = loadPage('pages/tasks/participants/index')
  picker3.onLoad({ mode: 'create', selected: String(firstId) })
  await wait(400)
  check(picker3.data.selected.length === 1, '进页面回填已选 ' + picker3.data.selected.length + ' 个')
  check(
    picker3.data.friends.filter((f) => f.checked).length === 1 &&
      picker3.data.friends.filter((f) => f.checked)[0].id === firstId,
    '回填的那一行勾上了'
  )

  const pickedUsers = picker.data.all.filter((f) => picker.data.selected.indexOf(f.id) >= 0)
  create.applyParticipants(pickedUsers)
  check(create.data.participants.length === 2, '创建页收到 2 个参与者')

  create.onTitle(evt({}, { value: '换一下客厅的灯泡' }))
  check(create.data.canSubmit === true, '填完可以提交')
  console.log('    提交截止：' + create.data.deadlineDate + ' ' + create.data.deadlineTime)
  await create.submit()
  await wait(700)
  // 发布成功后不再 toast 直接返回，而是弹「告诉 TA」半屏（转发卡片比订阅消息更靠谱）
  check(
    !!create.data.published && !!create.data.published.taskId,
    '发布成功：弹出「告诉 TA」半屏 taskId=' + (create.data.published && create.data.published.taskId)
  )
  // 分享卡片：标题带任务名和截止时间，path 直达这条任务的详情页
  const shareCard = create.onShareAppMessage()
  check(
    /换一下客厅的灯泡/.test(shareCard.title) && /前|做完/.test(shareCard.title),
    '分享卡片标题：' + shareCard.title
  )
  check(
    shareCard.path.indexOf('/pages/tasks/receive/index?id=' + create.data.published.taskId) >= 0,
    '分享直达接收页：' + shareCard.path
  )
  // 没传图时必须给默认封面，否则微信用页面截图，白底一片
  check(shareCard.imageUrl.indexOf('task-cover') > 0, '无附图时用默认分享封面：' + shareCard.imageUrl)

  // 「什么时候要」两种说法（重新开一个创建页实例，避免上次 submitting 还没复位）
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n)
  const ymdOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  const hmsOf = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':00'
  const taskSvc = require(path.join(ROOT, 'services/task'))

  const create2 = loadPage('pages/tasks/create/index')
  create2.onLoad({})
  await wait(200)
  create2.applyParticipants(pickedUsers)
  check(create2.data.dueMode === 'time', '默认是「某个时间点」')

  // 1) 时间点模式：不足 2 小时要被拦住
  const soon = new Date(Date.now() + 60 * 60 * 1000)
  create2.onDate(evt({}, { value: ymdOf(soon) }))
  create2.onTime(evt({}, { value: hmsOf(soon).slice(0, 5) }))
  create2.onTitle(evt({}, { value: '一小时之内的事' }))
  const toastBeforeSoon = calls.toast.length
  await create2.submit()
  await wait(300)
  check(
    calls.toast.slice(toastBeforeSoon).some((t) => t.indexOf('2 小时') >= 0),
    '时间点不足 2 小时被拦：' + calls.toast[calls.toast.length - 1]
  )

  // 2) 某一天模式：当天 23:59:59 截止，且不设提前提醒
  create2.setDueMode(evt({ mode: 'day' }))
  await wait(100)
  check(create2.data.dueMode === 'day' && !!create2.data.dayDate, '切到「某一天」：' + create2.data.dayText)
  create2.onTitle(evt({}, { value: '周末收拾阳台' }))
  await create2.submit()
  await wait(700)
  const dayList = await taskSvc.list({ role: 'creator', status: 'all' })
  const dayTask = dayList.list.find((t) => t.title === '周末收拾阳台')
  check(!!dayTask, '某一天模式发布成功')
  if (dayTask) {
    const dayDetail = await taskSvc.detail(dayTask.id)
    const dd = new Date(dayDetail.deadline)
    check(
      dd.getHours() === 23 && dd.getMinutes() === 59 && dd.getSeconds() === 59,
      '截止落在当天 23:59:59'
    )
    check(dayDetail.remindMinutes === 0, '某一天不设提前提醒 remindMinutes=' + dayDetail.remindMinutes)
  }
  const fmtUtil = require(path.join(ROOT, 'utils/format'))
  const wholeDayIso = new Date(new Date().setHours(23, 59, 59, 0)).toISOString()
  check(/当天完成/.test(fmtUtil.formatDeadline(wholeDayIso)), '展示文案：' + fmtUtil.formatDeadline(wholeDayIso))

  // 布置任务带附图：选完立刻上传，提交的只有公网 URL
  const withShots = loadPage('pages/tasks/create/index')
  withShots.onLoad({})
  await wait(150)
  withShots.applyParticipants(pickedUsers)
  withShots.onTitle(evt({}, { value: '带图的任务' }))
  const uploadBefore = calls.upload.length
  withShots.chooseImage()
  await wait(400)
  check(withShots.data.shots.length === 2, '选了两张图 ' + withShots.data.shots.length)
  check(
    calls.upload.length === uploadBefore + 2,
    '选完立刻上传 ' + (calls.upload.length - uploadBefore) + ' 次'
  )
  check(
    withShots.data.shots.every((s) => s.state === 'done' && s.url.indexOf('https://') === 0),
    '每张都换成了公网地址'
  )
  check(
    withShots.data.shots.every((s) => !s.tempPath),
    '传完就丢掉本机临时路径'
  )
  check(withShots.imageUrls().length === 2, '提交用的地址 2 个')

  // 有图还在传时，发布必须被拦住（否则那张图会被静默丢掉）
  withShots.applyShots(
    withShots.data.shots.concat([
      { k: 'inflight', url: '', tempPath: 'wxfile://tmp_c.jpg', state: 'uploading' },
    ])
  )
  const toastBeforeUpload = calls.toast.length
  await withShots.submit()
  check(
    calls.toast.length > toastBeforeUpload && /还有图在传/.test(calls.toast[calls.toast.length - 1]),
    '上传中发布被拦住'
  )
  check(withShots.data.submitting === false, '被拦住时没有进入提交态')
  withShots.removeImage(evt({ key: 'inflight' }))

  // 删一张
  withShots.removeImage(evt({ key: withShots.data.shots[0].k }))
  check(withShots.data.shots.length === 1, '删掉一张后剩 1 张')

  // 满 6 张不再让加
  withShots.applyShots(
    [1, 2, 3, 4, 5, 6].map((i) => ({
      k: 'full' + i,
      url: 'https://cdn.test/task-image/' + i + '.png',
      tempPath: '',
      state: 'done',
    }))
  )
  const toastBeforeFull = calls.toast.length
  withShots.chooseImage()
  await wait(100)
  check(
    calls.toast.length > toastBeforeFull &&
      /最多 6 张/.test(calls.toast[calls.toast.length - 1]),
    '满 6 张后不再让选'
  )

  // 带图发布 → 服务端回读
  withShots.applyShots([
    { k: 'final', url: 'https://cdn.test/task-image/keep.png', tempPath: '', state: 'done' },
  ])
  await withShots.submit()
  await wait(800)
  const shotList = await taskSvc.list({ role: 'creator', status: 'all' })
  const shotTask = shotList.list.find((t) => t.title === '带图的任务')
  check(!!shotTask, '带图任务发布成功')
  if (shotTask) {
    const shotDetail = await taskSvc.detail(shotTask.id)
    check(
      shotDetail.images.length === 1 && shotDetail.images[0].indexOf('https://') === 0,
      '附图回读 ' + shotDetail.images.length + ' 张'
    )
    const shotShown = require(path.join(ROOT, 'utils/present')).presentDetail(shotDetail)
    check(
      shotShown.shotCount === 1 && shotShown.shots.length === 1 && !!shotShown.shotHint,
      '详情展示：' + shotShown.shotHint
    )
  }
  // 6 张时第 3 张要压出「+N」
  const manyShots = require(path.join(ROOT, 'utils/present')).presentDetail({
    title: 'x',
    participants: [],
    deadline: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    images: ['https://a/1.png', 'https://a/2.png', 'https://a/3.png', 'https://a/4.png', 'https://a/5.png'],
  })
  check(
    manyShots.shots.length === 3 && manyShots.shotMore === 2 && manyShots.allShots.length === 5,
    '5 张图 → 3 张缩略图 + ' + manyShots.shotMore + ' 张折叠'
  )

  // 3) 预约中的任务：能筛出来、也能撤回
  const startAt = new Date(Date.now() + 3 * 3600 * 1000)
  const deadlineAt = new Date(Date.now() + 6 * 3600 * 1000)
  const schedTask = await taskSvc.create({
    title: '预约-取快递',
    participantIds: [create2.data.participants[0].id],
    completionMode: 'all',
    deadline: ymdOf(deadlineAt) + ' ' + hmsOf(deadlineAt),
    startAt: ymdOf(startAt) + ' ' + hmsOf(startAt),
    startNotify: false,
    remindMinutes: 10,
  })
  check(schedTask.status === 'scheduled', '未来开始时间 → 预约中 ' + schedTask.status)
  check(schedTask.startNotify === false, '开始时间点到点通知可以关掉')
  check(!!schedTask.startAt, '开始时间点已保存')
  check(schedTask.canCancel === true, '预约中任务可撤回')
  check(!schedTask.me || schedTask.me.canAccept === false, '预约中任务没有可接受的动作')
  const schedList = await taskSvc.list({ role: 'creator', status: 'scheduled' })
  check(
    schedList.list.some((t) => t.id === schedTask.id),
    '「预约中」筛选查到 ' + schedList.total + ' 条'
  )
  const schedCancelled = await taskSvc.cancel(schedTask.id)
  check(schedCancelled.status === 'cancelled', '预约中撤回成功 → ' + schedCancelled.status)

  // 撤回要通知全部参与者（不含委托人）
  const cancelNotices = (server.getState().notices || []).filter(
    (n) => Number(n.taskId) === Number(schedTask.id) && n.templateKey === 'TASK_CANCELLED'
  )
  check(cancelNotices.length >= 1, '撤回后参与者收到 ' + cancelNotices.length + ' 条取消通知')
  check(
    cancelNotices.every((n) => Number(n.toMemberId) !== 1),
    '委托人自己不会收到取消通知'
  )
  if (cancelNotices.length) {
    const preview = cancelNotices[0].fields.map((f) => f.label + ':' + f.value).join(' | ')
    check(/撤回时间/.test(preview), '取消通知字段：' + preview)
  }

  // 关掉「开始时间点」：预约中 → 待接受
  const startTask2 = await taskSvc.create({
    title: '预约-待取消开始时间',
    participantIds: [create2.data.participants[0].id],
    completionMode: 'all',
    deadline: ymdOf(deadlineAt) + ' ' + hmsOf(deadlineAt),
    startAt: ymdOf(startAt) + ' ' + hmsOf(startAt),
    remindMinutes: 0,
  })
  check(startTask2.status === 'scheduled', '新建带开始时间的任务 → 预约中')
  const noStart = await taskSvc.update(startTask2.id, { removeStartTime: true, startAt: null })
  check(noStart.status === 'pending', '关掉开始时间点 → ' + noStart.status)
  check(!noStart.startAt, '开始时间点已清空')
  const noStartDetail = await taskSvc.detail(startTask2.id)
  check(!noStartDetail.startAt && noStartDetail.status === 'pending', '详情也回到待接受')
  await taskSvc.cancel(startTask2.id)

  // 详情页展示：有开始时间才显示这一行
  const present = require(path.join(ROOT, 'utils/present'))
  const withStart = present.presentDetail({
    title: 'x',
    participants: [],
    deadline: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    startAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  })
  check(!!withStart.startText, '有开始时间点 → 文案 ' + withStart.startText)
  const withoutStart = present.presentDetail({
    title: 'x',
    participants: [],
    deadline: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    startAt: null,
  })
  check(withoutStart.startText === '', '没设开始时间点 → 详情不显示该行')

  // 「某一天」的开始时间点不能晚于当天 22:00
  const create3 = loadPage('pages/tasks/create/index')
  create3.onLoad({})
  await wait(200)
  create3.applyParticipants(pickedUsers)
  create3.setDueMode(evt({ mode: 'day' }))
  await wait(100)
  create3.onTitle(evt({}, { value: '很晚才开始的任务' }))
  create3.toggleSchedule(evt({}, { value: true }))
  create3.onStartDate(evt({}, { value: create3.data.dayDate }))
  create3.onStartTime(evt({}, { value: '22:30' }))
  const toastBeforeLate = calls.toast.length
  await create3.submit()
  await wait(300)
  check(
    calls.toast.slice(toastBeforeLate).some((t) => t.indexOf('22:00') >= 0),
    '「某一天」22:00 之后开始被拦：' + calls.toast[calls.toast.length - 1]
  )

  // 编辑：只有布置者能改；待接受可反复改，进行中只给一次
  const editTarget = (await taskSvc.list({ role: 'creator', status: 'pending' })).list[0]
  check(!!editTarget, '有可编辑的待接受任务')
  if (editTarget) {
    const beforeEdit = await taskSvc.detail(editTarget.id)
    check(beforeEdit.canEdit === true, '待接受任务 canEdit=true')

    const editPage = loadPage('pages/tasks/create/index')
    editPage.onLoad({ taskId: editTarget.id })
    await wait(400)
    check(editPage.data.editing === true, '编辑页进入编辑模式')
    check(editPage.data.title === beforeEdit.title, '回填标题：' + editPage.data.title)
    check(
      editPage.data.participants.length === beforeEdit.participants.length,
      '回填参与者 ' + editPage.data.participants.length + ' 人（只读）'
    )

    editPage.onTitle(evt({}, { value: '改过标题的任务' }))
    await editPage.submit()
    await wait(700)
    const afterEdit = await taskSvc.detail(editTarget.id)
    check(afterEdit.title === '改过标题的任务', '编辑生效：' + afterEdit.title)

    // 进行中：还能改一次，改完就锁
    const st = server.getState()
    const raw = st.tasks.find((t) => t.taskId === Number(editTarget.id))
    raw.participants[0].status = 1 // ACCEPTED
    raw.status = 2 // IN_PROGRESS
    const inProgress = await taskSvc.detail(editTarget.id)
    check(inProgress.canEdit === true, '进行中还能再改一次')
    check(inProgress.canCancel === true, '进行中的任务也能撤回')

    // 撤回挪到标题右侧后：底部操作栏只看「能不能催」，撤回由 canCancel 控制显隐
    const inProgressPage = loadPage('pages/tasks/detail/index')
    inProgressPage.onLoad({ id: editTarget.id })
    await wait(400)
    check(inProgressPage.data.task.barMode === 'creator', '进行中底部只留催一下：' + inProgressPage.data.task.barMode)
    check(inProgressPage.data.task.canCancel === true, '顶部撤回入口可见')
    await taskSvc.update(editTarget.id, { title: '进行中改了一次' })
    const afterOneEdit = await taskSvc.detail(editTarget.id)
    check(afterOneEdit.canEdit === false, '改过一次后 canEdit=false')
    let secondErr = ''
    try {
      await taskSvc.update(editTarget.id, { title: '再改一次' })
    } catch (e) {
      secondErr = e.message || ''
    }
    check(/改过一次/.test(secondErr), '二次编辑被拒：' + secondErr)
  }

  // 追加参与者：同一个接口，数组形式
  const svc = require(path.join(ROOT, 'services/task'))
  const extra = picker.data.friends[2]
  const mine = await svc.list({ role: 'creator', status: 'pending' })
  const target = mine.list.find(
    (t) =>
      t.participantCount < picker.data.friends.length &&
      !(t.participants || []).some((p) => p.id === extra.id)
  )
  if (target) {
    const before = await svc.detail(target.id)
    const grown = await svc.addParticipants(target.id, [extra.id])
    check(
      grown.participants.length === before.participants.length + 1,
      '追加参与者：' + before.participants.length + ' → ' + grown.participants.length
    )
  } else {
    check(true, '没有可追加的任务，跳过')
  }

  console.log('\n[9] 服务通知')
  const messages = loadPage('pages/messages/index/index')
  messages.onLoad({})
  await wait(400)
  check(messages.data.list.length > 0, '通知 ' + messages.data.list.length + ' 条')
  check(messages.data.list[0].fields.length >= 3, '卡片字段 ' + messages.data.list[0].fields.length + ' 行')
  console.log('    ' + messages.data.list[0].title + '｜' + messages.data.list[0].fields.map((f) => f.label + ':' + f.value).join('  '))
  const unreadBefore = messages.data.unread
  check(unreadBefore > 0, '未读 ' + unreadBefore + ' 条')
  await messages.markAll()
  check(messages.data.unread === 0, '全部已读')

  console.log('\n[10] 好友')
  const friends = loadPage('pages/friends/index/index')
  friends.onLoad({})
  await wait(500)
  check(friends.data.friends.length > 0, '好友 ' + friends.data.friends.length + ' 个')
  check(friends.data.requests.length > 0, '待处理请求 ' + friends.data.requests.length + ' 个')
  check(!!friends.data.inviteCode, '邀请码 ' + friends.data.inviteCode)
  const reqId = friends.data.requests[0].requestId
  await friends.accept(evt({ id: reqId }))
  await wait(400)
  check(friends.data.requests.length === 0, '同意后请求清空')
  check(friends.data.friends.length > 0, '好友数更新为 ' + friends.data.friends.length)

  console.log('\n[11] 我的 / 设置 / 头像昵称')
  const minePage = loadPage('pages/mine/index/index')
  minePage.onLoad({})
  await wait(500)
  check(!!minePage.data.user, '资料：' + (minePage.data.user && minePage.data.user.nickname))
  check(!!minePage.data.user.inviteCode, '我的页邀请码 ' + minePage.data.user.inviteCode)
  check(typeof minePage.data.stats.friendCount === 'number', '统计好友数 ' + minePage.data.stats.friendCount)
  check(!!minePage.data.rateText, '准时率 ' + minePage.data.rateText)

  const settings = loadPage('pages/mine/settings/index')
  settings.onLoad({})
  // 个人主体只能用一次性订阅，只申请 4 个模板；开始/变更/撤回只走站内
  check(settings.data.list.length === 4, '四个订阅模板（不含开始/变更/取消）')
  check(
    settings.data.list.every((item) => item.configured === false),
    '模板未配置时标记为审核中'
  )
  await settings.toggle(evt({ key: 'TASK_ASSIGNED', index: 0 }))
  check(true, '模板占位未配置时不报错')

  // 头像昵称页：头像只能来自微信 chooseAvatar，昵称来自 type=nickname，可以反复改
  const profile = loadPage('pages/mine/profile/index')
  await profile.onLoad()
  await wait(200)
  check(profile.data.nicknameInit === '小林', '头像昵称页回填 ' + profile.data.nicknameInit)
  profile.onChooseAvatar(evt({}, { avatarUrl: 'wxfile://tmp_me.jpg' }))
  // 选完立刻上传，拿到公网地址后就不该再依赖本机临时路径
  await wait(200)
  check(
    (profile.data.avatarUrl || '').indexOf('https://cdn.test/') === 0,
    '头像上传后换成公网地址 ' + profile.data.avatarUrl
  )
  check(!storage['lmd_avatar'], '上传成功后清掉本机临时路径')
  // 走真实提交路径：type=nickname 的值只能从 form submit 里取
  await profile.onSubmit(evt({}, { value: { nickname: '小林同学' } }))
  await wait(400)
  check(appInstance.globalData.user.nickname === '小林同学', '昵称改动生效 ' + appInstance.globalData.user.nickname)
  check(
    (appInstance.globalData.user.avatarUrl || '').indexOf('https://cdn.test/avatar/') === 0,
    '公网头像已入库'
  )
  const presentUtil = require(path.join(ROOT, 'utils/present'))
  const shown = presentUtil.presentUser(appInstance.globalData.user)
  check(shown.avatarUrl === appInstance.globalData.user.avatarUrl, '公网头像原样透传给 image')
  // 没有公网地址时仍然要有默认头像，临时路径不能进 image
  const fallbackShown = presentUtil.presentUser({ id: '1', nickname: '阿豆', avatarUrl: 'wxfile://tmp_x.jpg' })
  check(!fallbackShown.avatarUrl && !!fallbackShown.avatarStyle && !!fallbackShown.initial, '临时路径回落默认头像')

  // 完成凭证：详情页把参与者的图片整理成缩略图（最多 3 张 + 剩余数），点开看大图
  const shots = presentUtil.presentParticipant({
    userId: '9',
    nickname: '小王',
    status: 'done',
    remark: '阳台衣服收好了',
    images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
    completedAt: '2026-10-23T13:40:00.000Z',
  })
  check(
    shots.shotList.length === 3 && shots.moreCount === 2 && shots.shotCount === 5,
    '凭证缩略图 3 张 + 剩余 2 张'
  )
  const noShots = presentUtil.presentParticipant({ userId: '10', nickname: '小明', status: 'accepted' })
  check(noShots.shotCount === 0 && noShots.shotHint === '', '没交凭证的人不占位置')
  check(storage['lmd_user'] && storage['lmd_user'].nickname === '小林同学', '用户资料已缓存到本地')

  // 首登引导页：默认带出名字 + 文字头像，选的头像只存本机，可跳过
  // 先清掉本机预览，还原"第一次登录"的真实状态
  wx.removeStorageSync('lmd_avatar')
  const onboarding = loadPage('pages/onboarding/index')
  await onboarding.onLoad({ next: encodeURIComponent('pages/tasks/index/index') })
  await wait(150)
  check(!!onboarding.data.nicknameInit, '引导页默认带出名字 ' + onboarding.data.nicknameInit)
  check(
    !!onboarding.data.avatarStyle && !!onboarding.data.initial,
    '引导页头像带兜底色块 ' + (onboarding.data.avatarUrl || '文字头像')
  )
  onboarding.onChooseAvatar(evt({}, { avatarUrl: 'wxfile://tmp_ob.jpg' }))
  await wait(200)
  check(
    (onboarding.data.avatarUrl || '').indexOf('https://cdn.test/avatar/') === 0,
    '引导页头像上传成公网地址'
  )
  check(!storage['lmd_avatar'], '引导页上传成功后清掉本机路径')
  const navCount = calls.nav.length
  onboarding.skip()
  await wait(700)
  check(
    calls.nav.slice(navCount).indexOf('/pages/tasks/index/index') >= 0,
    '跳过引导回到任务首页'
  )

  // 从分享卡片进来的首登：引导完必须回到原来那一页（非 tab、带参数），
  // 否则用户点开别人的任务卡、登录完却掉在首页，还得自己找回来
  const obShare = loadPage('pages/onboarding/index')
  await obShare.onLoad({ next: encodeURIComponent('pages/tasks/receive/index?id=9') })
  await wait(150)
  const navBeforeShare = calls.nav.length
  obShare.skip()
  await wait(700)
  check(
    calls.nav.slice(navBeforeShare).indexOf('/pages/tasks/receive/index?id=9') >= 0,
    '引导完回到分享进来的那一页（带参数）'
  )

  // 「就这么定」：昵称落库（走 form 提交）
  const obSubmit = loadPage('pages/onboarding/index')
  await obSubmit.onLoad({ next: encodeURIComponent('pages/tasks/index/index') })
  await wait(150)
  await obSubmit.onSubmit(evt({}, { value: { nickname: '阿豆' } }))
  await wait(400)
  check(appInstance.globalData.user.nickname === '阿豆', '引导页保存昵称 阿豆')

  // 回归：选微信昵称是原生填充，可能只来一次带旧值的 blur、不触发 bindinput。
  // 以前受控 value 会被旧值顶回去（选了没反应），现在必须靠 form 拿到真值。
  const obNative = loadPage('pages/onboarding/index')
  await obNative.onLoad({ next: encodeURIComponent('pages/tasks/index/index') })
  await wait(150)
  const staleName = obNative.data.nicknameInit
  obNative.onNickname(evt({}, { value: staleName }))
  await obNative.onSubmit(evt({}, { value: { nickname: '微信来的名字' } }))
  await wait(400)
  check(
    appInstance.globalData.user.nickname === '微信来的名字',
    '原生填充的微信昵称能存上 ' + appInstance.globalData.user.nickname
  )

  // 用户拒绝授权：登录没带微信资料且库里也没昵称 -> 「用户XXXX」
  const meMember = server.getState().members.find((m) => m.memberId === 1)
  meMember.nickname = ''
  meMember.avatar = ''
  wx.removeStorageSync('lmd_app_token')
  const anon = await require(path.join(ROOT, 'services/auth')).login()
  check(/^用户[A-Z0-9]{4}$/.test(anon.nickname || ''), '拒绝授权时兜底昵称 ' + anon.nickname)
  check(!!anon.nickname && anon.nickname !== '微信用户', '不会把「微信用户」当昵称')

  // 好友页内嵌「添加好友」：邀请码、复制、输码加人都不再跳二级页
  const friendsPage = loadPage('pages/friends/index/index')
  friendsPage.onLoad({})
  await wait(400)
  check(friendsPage.data.inviteCode === 'K7M2QX', '好友页直接显示邀请码 ' + friendsPage.data.inviteCode)
  // 分享路径现在指向「加好友页」，用 code 传参（不再是登录页的 invite=）
  check(
    !!friendsPage.data.sharePath && friendsPage.data.sharePath.indexOf('code=K7M2QX') > 0,
    '分享路径就绪 ' + friendsPage.data.sharePath
  )

  // 好友详情：URL 里只有名字装不下头像，进页面必须按 uid 从好友列表补回来
  const wang = friendsPage.data.friends.filter((f) => String(f.userId) === '3')[0]
  check(!!wang && !!wang.avatarUrl, '列表里有云头像的好友：' + (wang && wang.avatarUrl))
  const friendDetail = loadPage('pages/friends/detail/index')
  friendDetail.onLoad({
    uid: '3',
    fid: wang ? wang.id : '',
    name: encodeURIComponent('小王'),
    count: 1,
  })
  await wait(500)
  const fdFriend = friendDetail.data.friend || {}
  check(
    fdFriend.avatarUrl === 'https://cdn.test/avatar/wang.png',
    '详情页补上了云头像 ' + fdFriend.avatarUrl
  )
  check(!!fdFriend.initial && !!fdFriend.avatarStyle, '文字头像兜底仍在')

  // 加好友页：别人点开显示「谁邀请你」，自己点开直接回好友列表
  const invPage = loadPage('pages/friends/invite/index')
  invPage.onLoad({ code: 'M3P8LA' }) // 妈妈
  await wait(400)
  check(
    !!invPage.data.preview && invPage.data.preview.nickname === '妈妈',
    '加好友页显示邀请人：' + (invPage.data.preview && invPage.data.preview.nickname)
  )
  check(invPage.data.preview && invPage.data.preview.friendFlag === true, '已是好友时 friendFlag=true')

  const selfInv = loadPage('pages/friends/invite/index')
  const navBeforeInv = calls.nav.length
  const tabBeforeInv = calls.tab.length
  selfInv.onLoad({ code: 'K7M2QX' }) // 自己的邀请码
  await wait(400)
  check(
    calls.nav.slice(navBeforeInv).indexOf('/pages/friends/index/index') >= 0,
    '自己点自己的卡片 → 回好友列表'
  )
  // 好友列表是 tabBar 页，必须 switchTab；redirectTo 会静默失败（表现为停在「加载中…」）
  check(
    calls.tab.slice(tabBeforeInv).indexOf('/pages/friends/index/index') >= 0 &&
      selfInv.data.loading === false,
    '自己点自己的卡片用 switchTab，且不会卡在加载中'
  )

  // 陌生人点开卡片 → 加好友 → 按钮切成「去看看好友」并真的跳过去
  const stInvite = server.getState()
  if (!stInvite.members.some((m) => m.memberId === 98)) {
    stInvite.members.push({
      memberId: 98,
      nickname: '隔壁老王',
      avatar: '',
      inviteCode: 'PP1Q2W',
      gender: 0,
    })
  }
  const invAdd = loadPage('pages/friends/invite/index')
  invAdd.onLoad({ code: 'PP1Q2W' })
  await wait(300)
  check(
    !!invAdd.data.preview && invAdd.data.preview.friendFlag === false,
    '陌生人卡片先显示「加为好友」'
  )
  const tabBeforeAdd = calls.tab.length
  await invAdd.onAdd()
  await wait(200)
  check(
    invAdd.data.joined === true && invAdd.data.preview.friendFlag === true,
    '加完按钮切成「去看看好友」（不再绑 onAdd，避免点了没反应）'
  )
  await wait(1000)
  check(
    calls.tab.slice(tabBeforeAdd).indexOf('/pages/friends/index/index') >= 0,
    '加完自动进好友列表'
  )
  // 刚加的人已经进了好友关系，好友页要重新拉一次，否则后面的相对断言会算错
  await friendsPage.load()

  // 分享卡片 + 从来没登录过：必须先引导登录 + 首登资料，再回到原页面（含参数）
  const savedToken = wx.getStorageSync('lmd_app_token')
  ;[
    { base: 'pages/tasks/receive/index', options: { id: '1' } },
    { base: 'pages/friends/invite/index', options: { code: 'M3P8LA' } },
  ].forEach((probe) => {
    wx.removeStorageSync('lmd_app_token')
    const navBeforeGate = calls.nav.length
    const gatePage = loadPage(probe.base)
    gatePage.onLoad(probe.options)
    const jumped = calls.nav.slice(navBeforeGate)[0] || ''
    const back = decodeURIComponent(jumped)
    const key = Object.keys(probe.options)[0]
    // 登录完成后要跳回「同一页 + 同一参数」，少一个参数就等于换了个页面
    const expect = probe.base + '?' + key + '=' + probe.options[key]
    check(
      jumped.indexOf('/pages/launch/index?redirect=') === 0 && back.indexOf(expect) > 0,
      '没登录过先引导登录（' + probe.base + '）：' + jumped.slice(0, 64)
    )
  })
  wx.setStorageSync('lmd_app_token', savedToken)

  // 好友分享：指向加好友页 + 薄荷绿封面
  const friendShare = friendsPage.onShareAppMessage()
  check(
    friendShare.path.indexOf('/pages/friends/invite/index?code=') === 0,
    '好友分享去加好友页：' + friendShare.path
  )
  check(friendShare.imageUrl.indexOf('friend-cover') > 0, '好友分享用专属封面')

  friendsPage.copyCode()
  check(calls.clipboard.indexOf('K7M2QX') >= 0, '复制按钮把邀请码写进剪贴板')

  friendsPage.onInputCode(evt({}, { value: 'ab' }))
  check(friendsPage.data.inputCode === 'AB', '输入自动转大写 ' + friendsPage.data.inputCode)
  const toastBeforeShort = calls.toast.length
  await friendsPage.applyCode()
  check(
    calls.toast.slice(toastBeforeShort).some((t) => t.indexOf('6 位') >= 0),
    '不足 6 位被拦：' + calls.toast[calls.toast.length - 1]
  )

  // 造一个还没加好友的人，用他的邀请码在好友页就地加上
  const st = server.getState()
  let stranger = st.members.find((m) => m.memberId === 99)
  if (!stranger) {
    stranger = { memberId: 99, nickname: '远方亲戚', avatar: '', inviteCode: 'ZZ9Y8X', gender: 0 }
    st.members.push(stranger)
  } else {
    stranger.inviteCode = 'ZZ9Y8X'
  }
  const friendCountBefore = friendsPage.data.friends.length
  friendsPage.onInputCode(evt({}, { value: 'zz9y8x' }))
  await friendsPage.applyCode()
  await wait(600)
  check(friendsPage.data.inputCode === '', '加成功后输入框清空')
  check(
    friendsPage.data.friends.length === friendCountBefore + 1,
    '新好友原地出现在列表：' + friendCountBefore + ' → ' + friendsPage.data.friends.length
  )
  check(calls.nav.every((u) => u.indexOf('friends/invite') < 0), '全程没有跳二级页')

  // 错误码：留在当前页提示，不清输入框以外的状态
  friendsPage.onInputCode(evt({}, { value: 'ZZZZZZ' }))
  const toastBeforeBad = calls.toast.length
  await friendsPage.applyCode()
  await wait(300)
  check(
    calls.toast.slice(toastBeforeBad).some((t) => t.indexOf('邀请码') >= 0),
    '错误邀请码有提示：' + calls.toast[calls.toast.length - 1]
  )
  check(friendsPage.data.applying === false, '失败后按钮恢复可点')


  console.log('\n[12] 登录态失效自动重登')
  storage['lmd_app_token'] = 'tok_expired'
  const summary = await require(path.join(ROOT, 'services/task')).summary()
  check(typeof summary.assignee === 'number', '过期 token 被自动换掉并重放成功（未读数 ' + summary.assignee + '）')
  check(storage['lmd_app_token'] !== 'tok_expired', '本地 token 已刷新')

  console.log('\n[13] 业务错误透出')
  try {
    await require(path.join(ROOT, 'services/task')).detail(99999)
    check(false, '不存在的任务应当报错')
  } catch (e) {
    check(!!e.message && e.code !== 0, '错误文案：' + e.message + '（code=' + e.code + '）')
  }

  console.log('\n[14] 退出登录清本地缓存')
  appInstance.setUser({ id: '1', nickname: '小林同学', avatarUrl: '' })
  check(!!storage['lmd_user'], '用户资料落在本地 ' + (storage['lmd_user'] && storage['lmd_user'].nickname))
  await require(path.join(ROOT, 'services/auth')).logout()
  await wait(500)
  check(!storage['lmd_user'], '退出登录后用户资料缓存已清')
  check(!storage['lmd_app_token'], '退出登录后 token 已清')
  check(!appInstance.globalData.user, '内存里的用户也清空了')

  await server.close()

  console.log('\n' + (errors === 0 ? '全部通过' : errors + ' 个失败'))
  if (errors) process.exitCode = 1
}

run().catch((e) => {
  console.error('\n跑挂了：', e)
  process.exitCode = 1
})
