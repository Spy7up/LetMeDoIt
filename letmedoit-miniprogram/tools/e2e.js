/**
 * 真实后端联调（真 sa-app + 真 MySQL + 真 Redis）
 *
 * 与 sim.js 的区别：
 *  - sim.js 连 tools/contract-server（内存假数据），只验证前端链路自洽
 *  - 本脚本连 sa-app，验证前后端字段/枚举/路径真的对得上
 *
 * 只桩 wx，services/* 与 utils/request.js 全部走真实代码路径。
 *
 * 用法：
 *   node tools/e2e.js                  # 默认用 config 里的 dev 地址
 *   node tools/e2e.js http://x:8081    # 指定后端
 *
 * 前置：
 *   - sa-app 已启动，且已执行 docs/sql/letmedoit_task.sql
 *   - 该实例的 wx.miniapp.mock 必须为 true：脚本用假 code 登录，
 *     关掉 mock 后 code 换不到 openid（真实登录只能在微信开发者工具里跑）
 */
const path = require('path')

const ROOT = path.resolve(__dirname, '../miniprogram')
/** 默认跟随小程序当前环境，改 config 的 ENV 后脚本自动指向同一后端 */
const BASE = process.argv[2] || require(path.join(ROOT, 'config/index')).BASE_URL

/* ---------------- wx 桩 ---------------- */

const storage = {}
let loginCode = 'e2e_base'
let lastHeaders = {}

function httpRequest(opt) {
  const payload = opt.data == null ? '' : JSON.stringify(opt.data)
  lastHeaders = Object.assign({}, opt.header || {})
  const u = new URL(opt.url)
  const http = require('http')
  const req = http.request(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opt.method || 'GET',
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
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
        } catch (e) {}
        if (opt.success) opt.success({ statusCode: res.statusCode, data })
      })
    }
  )
  req.on('error', (e) => opt.fail && opt.fail({ errMsg: 'request:fail ' + e.message }))
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
  login: (opt) => setTimeout(() => opt.success({ code: loginCode }), 1),
  request: httpRequest,
  requestSubscribeMessage: (opt) => opt.success({}),
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => o.success && o.success({ confirm: true, content: '测试' }),
  showActionSheet: (o) => o.success && o.success({ tapIndex: 0 }),
  navigateTo: () => {},
  redirectTo: () => {},
  switchTab: () => {},
  reLaunch: () => {},
  navigateBack: () => {},
  stopPullDownRefresh: () => {},
  vibrateShort: () => {},
  chooseMedia: (o) =>
    o.success({ tempFiles: [{ tempFilePath: 'wxfile://a.jpg' }, { tempFilePath: 'wxfile://b.jpg' }] }),
  previewImage: () => {},
  setClipboardData: (o) => o.success && o.success(),
}
global.getApp = () => null
global.getCurrentPages = () => []
global.App = () => {}
global.Page = () => {}
global.Component = () => {}

/* ---------------- 断言 ---------------- */

let pass = 0
const fails = []
function check(cond, msg, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fails.push(msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
    console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
  }
}
function section(t) {
  console.log('\n' + t)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms || 80))
const api = (m) => require(path.join(ROOT, 'services/' + m))

/* ---------------- 账号 ---------------- */

const ACC = {
  granny: 'e2e_granny_v1',
  kid: 'e2e_kid_v1',
  // 每次跑用全新会员，保证「申请 → 同意」链路可重复验证（固定 code 第二次会撞「已经是好友了」）
  third: 'e2e_third_' + Date.now(),
}
const users = {}
/** 每个账号登录一次就复用 token：sa-app 对同一 IP 有 30 次/分钟的登录限频 */
const tokenCache = {}

/** 切号：优先复用 token，没有才真登录 */
async function as(name, nickname) {
  loginCode = ACC[name]
  const auth = api('auth')

  if (!tokenCache[name]) {
    wx.removeStorageSync('lmd_app_token')
    users[name] = await auth.login()
    tokenCache[name] = storage['lmd_app_token']
  }
  wx.setStorageSync('lmd_app_token', tokenCache[name])

  let me = users[name] || (await auth.getProfile())
  if (nickname && me.nickname !== nickname) {
    me = await auth.updateProfile({ nickname })
  }
  users[name] = me
  return me
}

/* ---------------- 场景 ---------------- */

async function run() {
  require(path.join(ROOT, 'config/index')).BASE_URL = BASE
  console.log('后端：' + BASE)

  section('[1] 微信登录（mock openid）+ 鉴权头')
  let granny
  try {
    granny = await as('granny', '奶奶')
  } catch (e) {
    if (/微信登录失败/.test(e.message || '')) {
      console.error('\n该后端 wx.miniapp.mock 已关闭，脚本的假 code 换不到 openid。')
      console.error('要跑本脚本，请把该实例的 mock 打开（wx.miniapp.mock: true 并重启）。')
      console.error('真实登录链路只能在微信开发者工具里验证。')
      process.exitCode = 2
      return
    }
    throw e
  }
  check(!!granny && !!granny.id, '登录拿到会员：' + (granny && granny.nickname) + ' / id=' + (granny && granny.id))
  check(!!storage['lmd_app_token'], 'token 已落本地')
  check(typeof granny.id === 'string', 'Long 型 id 被转成字符串 ' + granny.id)

  // login 本身免鉴权，所以鉴权头要在一次真实业务请求之后再查
  await api('auth').getProfile()
  check(
    String(lastHeaders['App-Token'] || '').indexOf('Bearer ') === 0,
    '鉴权头 App-Token: Bearer …',
    lastHeaders['App-Token']
  )

  section('[2] 邀请码加好友（面对面路径，无需确认）')
  const friendSvc = api('friend')
  const invite = await friendSvc.getInvite()
  check(!!invite.inviteCode, '奶奶的邀请码 ' + invite.inviteCode)
  check(!!invite.sharePath, '分享路径 ' + invite.sharePath)

  const kid = await as('kid', '小明')
  check(kid.id !== granny.id, '两个 mock code 得到两个不同会员 ' + granny.id + ' / ' + kid.id)

  let kidFriends = await friendSvc.list()
  const already = kidFriends.some((f) => f.userId === granny.id)
  if (!already) {
    await friendSvc.acceptInviteCode(invite.inviteCode)
  }
  kidFriends = await friendSvc.list()
  const grannyInKid = kidFriends.find((f) => f.userId === granny.id)
  check(!!grannyInKid, '小明的好友列表里有奶奶（好友 ' + kidFriends.length + ' 人）')
  check(!!grannyInKid && !!grannyInKid.id, '好友项带 friendId ' + (grannyInKid && grannyInKid.id))
  check(
    !!grannyInKid && !!grannyInKid.displayName,
    'displayName 回退昵称：' + (grannyInKid && grannyInKid.displayName)
  )

  section('[3] 好友申请 → 同意（双向）')
  const third = await as('third', '表姐')
  const reqs = await friendSvc.listRequests()
  if (!reqs.some((r) => r.fromUser && r.fromUser.id === granny.id)) {
    await friendSvc.request(granny.id, '我是奶奶')
  }
  const mine = await as('granny', '奶奶')
  check(mine.id === granny.id, '切回奶奶账号，token 独立生效')
  const inbox = await friendSvc.listRequests()
  const fromThird = inbox.find((r) => r.fromUser && r.fromUser.id === third.id)
  check(!!fromThird, '奶奶收到表姐的申请 ' + (fromThird && fromThird.message))
  if (fromThird) {
    await friendSvc.acceptRequest(fromThird.id)
    const after = await friendSvc.list()
    check(after.some((f) => f.userId === third.id), '同意后成为好友，奶奶好友 ' + after.length + ' 人')
  }

  section('[4] 布置任务（多人 · 全员完成）')
  // 表姐要能把任务布置给小明的任务，先让两人成为好友（后端要求参与者必须是好友）
  await as('kid', '小明')
  const kidInvite = await friendSvc.getInvite()
  await as('third', '表姐')
  const thirdFriends = await friendSvc.list()
  if (!thirdFriends.some((f) => f.userId === users.kid.id)) {
    await friendSvc.acceptInviteCode(kidInvite.inviteCode)
  }
  check(
    (await friendSvc.list()).some((f) => f.userId === users.kid.id),
    '表姐与小明互为好友（第三方任务的前提）'
  )

  await as('granny', '奶奶')
  const taskSvc = api('task')
  const deadline = new Date(Date.now() + 3 * 3600 * 1000)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  const dl =
    deadline.getFullYear() +
    '-' + pad(deadline.getMonth() + 1) +
    '-' + pad(deadline.getDate()) +
    ' ' + pad(deadline.getHours()) +
    ':' + pad(deadline.getMinutes()) +
    ':' + pad(deadline.getSeconds())

  const created = await taskSvc.create({
    title: '联调-晾衣服',
    description: '阳台的衣服',
    participantIds: [kid.id, third.id],
    completionMode: 'all',
    deadline: dl,
    remindMinutes: 10,
  })
  check(!!created && !!created.id, '创建成功 taskId=' + (created && created.id))
  check(created && created.participants.length === 2, '参与者 ' + (created && created.participants.length) + ' 人')
  check(created && created.status === 'pending', '初始聚合状态 = ' + (created && created.status))
  check(created && created.isCreator === true, '创建者视角 isCreator=true')
  check(created && created.canEdit === true, '待接受时可编辑 canEdit=true')
  check(created && created.events.length >= 1, '时间线 ' + (created && created.events.length) + ' 条')
  check(created && created.deadline.indexOf('T') > 0, '时间已转 ISO 给展示层 ' + (created && created.deadline))

  const taskId = created.id

  section('[5] 收到方视角：列表 / 详情 / 权限位')
  await as('kid', '小明')
  const listAll = await taskSvc.list({ role: 'assignee', status: 'all' })
  const row = listAll.list.find((t) => t.id === taskId)
  check(!!row, '小明的收到列表里有该任务（共 ' + listAll.list.length + ' 条）')
  check(!!row && row.role === 'assignee', 'role 正确 ' + (row && row.role))
  check(!!row && row.myStatus === 'pending', '我在任务里的状态 pending')
  check(!!row && row.counterpart && row.counterpart.id === granny.id, 'counterpart 是委托人')
  check(!!row && typeof row.progress.total === 'number', 'progress ' + JSON.stringify(row && row.progress))

  const detail = await taskSvc.detail(taskId)
  check(detail.me && detail.me.canAccept === true, 'canAccept=true（服务端算的权限位）')
  check(detail.me && detail.me.canComplete === false, 'canComplete=false（还没接受）')
  check(detail.canCancel === false, '非创建者不能撤回')
  check(detail.participants.length === 2, '参与者明细 ' + detail.participants.length + ' 人')
  check(
    detail.participants.every((p) => typeof p.status === 'string'),
    '参与者状态已转字符串 ' + detail.participants.map((p) => p.status).join('/')
  )

  section('[6] 状态机：接受 → 完成（一人完成，他人不受影响）')
  const accepted = await taskSvc.accept(taskId)
  check(accepted.status === 'in_progress', '接受后聚合状态 ' + accepted.status)
  check(accepted.me && accepted.me.status === 'accepted', '我的格子 accepted')
  check(accepted.me && accepted.me.canComplete === true, '接受后 canComplete=true')

  const done = await taskSvc.complete(taskId, { remark: '晾好了', images: [] })
  check(done.me && done.me.status === 'done', '完成接口把本格置 done')
  check(done.progress.done === 1, '完成数 ' + done.progress.done + '/2 仍进行中（全员完成模式）')
  check(done.status === 'in_progress', '聚合状态仍是 ' + done.status)

  section('[7] 委托方视角：进度 / 催办限频 / 撤回权限')
  await as('granny', '奶奶')
  const fromCreator = await taskSvc.detail(taskId)
  check(fromCreator.progress.done === 1, '委托方看到完成进度 ' + fromCreator.progress.done + '/' + fromCreator.progress.total)
  check(fromCreator.canEdit === true, '进行中还能再改一次 canEdit=true（改完即锁）')
  check(fromCreator.canRemind === true, '可催办 canRemind=true')

  const reminded = await taskSvc.remind(taskId)
  check(!!reminded && reminded.id === taskId, '催办成功，返回最新详情')
  let limited = false
  try {
    await taskSvc.remind(taskId)
  } catch (e) {
    limited = e.code === 30001
    if (!limited) console.log('    非限频错误：' + e.message + ' code=' + e.code)
  }
  check(limited, '60 秒内重复催办被拦（code=30001）')

  section('[8] 服务通知（任务事件驱动）')
  const noticeSvc = api('notice')
  await as('third', '表姐')
  const notices = await noticeSvc.list({ unreadFlag: true, limit: 10 })
  check(Array.isArray(notices.list), '通知返回列表 ' + notices.list.length + ' 条')
  check(typeof notices.unreadCount === 'number', '未读数 ' + notices.unreadCount)
  const hit = notices.list.find((n) => n.taskId === taskId)
  check(!!hit, '表姐收到该任务的通知：' + (hit && hit.title))
  check(!!hit && hit.fields.length >= 1, '卡片字段 ' + (hit && hit.fields.length) + ' 行：' + JSON.stringify(hit && hit.fields))
  check(!!hit && typeof hit.read === 'boolean', 'read 字段已布尔化 ' + (hit && hit.read))

  const unread = await noticeSvc.unreadCount()
  check(typeof unread === 'number', '未读数接口 ' + unread)
  if (hit) {
    const left = await noticeSvc.markRead([hit.id])
    check(typeof left === 'number', '标记已读后剩余未读 ' + left)
  }

  section('[9] 摘要 / 统计 / 好友数')
  await as('kid', '小明')
  const summary = await taskSvc.summary()
  check(typeof summary.assignee === 'number', '摘要-等我回应 ' + summary.assignee)
  check(typeof summary.overdue === 'number', '摘要-逾期 ' + summary.overdue)
  check(Array.isArray(summary.waitingUsers), '摘要-等我的人 ' + summary.waitingUsers.length + ' 位')

  const stats = await taskSvc.stats()
  check(typeof stats.receivedCount === 'number', '统计-收到 ' + stats.receivedCount)
  check(typeof stats.onTimeRate === 'number', '统计-准时率 ' + stats.onTimeRate)
  check(stats.friendCount >= 1, '统计-好友数 ' + stats.friendCount)

  section('[10] 列表筛选（枚举 → 后端查询）')
  const pendingList = await taskSvc.list({ role: 'assignee', status: 'pending' })
  check(
    pendingList.list.every((t) => t.status === 'pending'),
    '待接受筛选 ' + pendingList.list.length + ' 条'
  )
  const overdueList = await taskSvc.list({ role: 'assignee', status: 'overdue' })
  check(
    overdueList.list.every((t) => t.displayStatus === 'overdue'),
    '逾期筛选 ' + overdueList.list.length + ' 条'
  )

  // 创建时间筛选：不限 ≥ 近 7 天 ≥ 今天，且倒序（updatedAt 递减）
  const allRange = await taskSvc.list({ role: 'assignee', status: 'all', timeRange: 'all' })
  const weekRange = await taskSvc.list({ role: 'assignee', status: 'all', timeRange: 'last7' })
  const todayRange = await taskSvc.list({ role: 'assignee', status: 'all', timeRange: 'today' })
  check(
    allRange.total >= weekRange.total && weekRange.total >= todayRange.total,
    '时间范围递减：不限 ' + allRange.total + ' / 近7天 ' + weekRange.total + ' / 今天 ' + todayRange.total
  )
  const desc = allRange.list.every(
    (t, i) => i === 0 || new Date(allRange.list[i - 1].updatedAt) >= new Date(t.updatedAt)
  )
  check(desc, '默认按时间倒序')

  section('[11] 拒绝自己那一格')
  const dl2 = new Date(Date.now() + 2 * 3600 * 1000)
  const dl2s =
    dl2.getFullYear() + '-' + pad(dl2.getMonth() + 1) + '-' + pad(dl2.getDate()) +
    ' ' + pad(dl2.getHours()) + ':' + pad(dl2.getMinutes()) + ':00'
  await as('third', '表姐')
  const t2 = await taskSvc.create({
    title: '联调-取快递',
    participantIds: [kid.id],
    completionMode: 'any',
    deadline: dl2s,
    remindMinutes: 0,
  })
  await as('kid', '小明')
  const rejected = await taskSvc.reject(t2.id, '今晚不在家')
  const meSlot = rejected.participants.find((p) => p.userId === users.kid.id)
  check(meSlot && meSlot.status === 'rejected', '拒绝后我的格子 = ' + (meSlot && meSlot.status))
  check(meSlot && meSlot.rejectReason === '今晚不在家', '拒绝理由落库')
  check(rejected.status === 'rejected', '单人拒绝时任务聚合状态 = ' + rejected.status)

  section('[12] 撤回')
  await as('third', '表姐')
  const dl3 = new Date(Date.now() + 5 * 3600 * 1000)
  const dl3s =
    dl3.getFullYear() + '-' + pad(dl3.getMonth() + 1) + '-' + pad(dl3.getDate()) +
    ' ' + pad(dl3.getHours()) + ':' + pad(dl3.getMinutes()) + ':00'
  const t3 = await taskSvc.create({
    title: '联调-撤回我',
    participantIds: [kid.id],
    completionMode: 'any',
    deadline: dl3s,
    remindMinutes: 0,
  })
  const cancelled = await taskSvc.cancel(t3.id)
  check(cancelled.status === 'cancelled', '撤回后状态 ' + cancelled.status)

  section('[13] 任一人完成 → 其他人自动跳过')
  await as('granny', '奶奶')
  const dl4 = new Date(Date.now() + 6 * 3600 * 1000)
  const dl4s =
    dl4.getFullYear() + '-' + pad(dl4.getMonth() + 1) + '-' + pad(dl4.getDate()) +
    ' ' + pad(dl4.getHours()) + ':' + pad(dl4.getMinutes()) + ':00'
  const t4 = await taskSvc.create({
    title: '联调-任一人完成',
    participantIds: [kid.id, third.id],
    completionMode: 'any',
    deadline: dl4s,
    remindMinutes: 0,
  })
  check(t4.completionMode === 'any', '完成条件 any')

  await as('kid', '小明')
  await taskSvc.accept(t4.id)
  const anyDone = await taskSvc.complete(t4.id, { remark: '我先做完了' })
  check(anyDone.status === 'completed', '任一人完成后整单状态 ' + anyDone.status)
  const thirdSlot = anyDone.participants.find((p) => p.userId === users.third.id)
  check(thirdSlot && thirdSlot.status === 'skipped', '另一人的格子被跳过 = ' + (thirdSlot && thirdSlot.status))
  check(anyDone.progress.skipped === 1, '跳过计数 ' + anyDone.progress.skipped)

  await as('third', '表姐')
  const thirdView = await taskSvc.detail(t4.id)
  check(thirdView.status === 'completed', '被跳过的人看到任务已完成')
  check(thirdView.me && thirdView.me.status === 'skipped', '被跳过的人 me.status = ' + (thirdView.me && thirdView.me.status))
  check(!thirdView.me || thirdView.me.canComplete === false, '被跳过的人不能再完成')

  section('[14] 错误路径')
  try {
    await taskSvc.detail(99999999)
    check(false, '不存在的任务应报错')
  } catch (e) {
    check(!!e.message && e.code !== 0, '不存在任务返回 code=' + e.code + ' msg=' + e.message)
  }
  try {
    await taskSvc.complete(t2.id, { remark: 'x' })
    check(false, '已拒绝任务不应能完成')
  } catch (e) {
    check(!!e.message, '非法状态流转被拦：' + e.message)
  }

  section('[15] 微信资料与兜底昵称')
  // 拒绝授权：登录只带 code，服务端生成「用户XXXX」
  loginCode = 'e2e_anon_' + Date.now()
  wx.removeStorageSync('lmd_app_token')
  const anon = await api('auth').login()
  check(/^用户[A-Z0-9]{4}$/.test(anon.nickname || ''), '未授权时兜底昵称 ' + anon.nickname)
  check(!anon.avatarUrl, '未授权时没有头像')

  // 授权：登录直接把微信昵称头像写进会员
  loginCode = 'e2e_wx_' + Date.now()
  wx.removeStorageSync('lmd_app_token')
  const authed = await api('auth').login({
    nickname: '微信上的名字',
    avatarUrl: 'https://thirdwx.qlogo.cn/e2e.jpg',
  })
  check(authed.nickname === '微信上的名字', '登录带微信昵称 ' + authed.nickname)
  check(authed.avatarUrl === 'https://thirdwx.qlogo.cn/e2e.jpg', '登录带微信头像')

  // 微信返回占位资料时不能当昵称用
  loginCode = 'e2e_placeholder_' + Date.now()
  wx.removeStorageSync('lmd_app_token')
  const placeholder = await api('auth').login({
    nickname: '微信用户',
    avatarUrl: 'https://thirdwx.qlogo.cn/grey.jpg',
  })
  check(/^用户[A-Z0-9]{4}$/.test(placeholder.nickname || ''), '占位昵称被替换 ' + placeholder.nickname)
  check(!placeholder.avatarUrl, '占位授权不带灰色默认头像')

  // 头像昵称仍可改（前端只给 chooseAvatar / type=nickname 入口，不提供上传）
  const changed = await api('auth').updateProfile({
    nickname: '改过的名字',
    avatarUrl: 'wxfile://tmp_avatar.jpg',
  })
  check(changed.nickname === '改过的名字', '可以再次修改昵称 ' + changed.nickname)
  check(changed.avatarUrl === 'wxfile://tmp_avatar.jpg', '头像更新成功')

  section('[16] 登录态失效自动重登')
  storage['lmd_app_token'] = 'tok_expired_for_e2e'
  const after = await taskSvc.summary()
  check(typeof after.assignee === 'number', '过期 token 自动换新并重放成功')
  check(storage['lmd_app_token'] !== 'tok_expired_for_e2e', '本地 token 已刷新')

  section('[17] 预约中的任务：可撤回、可筛选')
  await as('granny', '奶奶')
  const fmtAt = (ms) => {
    const d = new Date(ms)
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'
    )
  }
  const schedTask = await taskSvc.create({
    title: '联调-预约任务',
    description: '到点才通知',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: fmtAt(Date.now() + 6 * 3600 * 1000),
    startAt: fmtAt(Date.now() + 3 * 3600 * 1000),
    remindMinutes: 10,
  })
  check(schedTask.status === 'scheduled', '未来开始时间 → 预约中 ' + schedTask.status)

  const schedDetail = await taskSvc.detail(schedTask.id)
  check(schedDetail.canCancel === true, '预约中任务 canCancel=true')
  check(schedDetail.canEdit === true, '预约中任务 canEdit=true')

  const schedList = await taskSvc.list({ role: 'creator', status: 'scheduled' })
  check(
    schedList.list.some((t) => t.id === schedTask.id),
    '「预约中」筛选查到该任务（共 ' + schedList.total + ' 条）'
  )

  const schedCancelled = await taskSvc.cancel(schedTask.id)
  check(schedCancelled.status === 'cancelled', '预约中撤回成功 → ' + schedCancelled.status)

  // 撤回后参与者收到取消通知，委托人自己不收
  await as('kid', '小明')
  const kidAfterCancel = await api('notice').list({ limit: 30 })
  const cancelNotice = kidAfterCancel.list.find(
    (n) => String(n.taskId) === String(schedTask.id) && n.templateKey === 'TASK_CANCELLED'
  )
  check(!!cancelNotice, '参与者收到任务取消通知')
  if (cancelNotice) {
    const preview = cancelNotice.fields.map((f) => f.label + ':' + f.value).join(' | ')
    check(/撤回时间/.test(preview), '取消通知字段：' + preview)
  }
  await as('granny', '奶奶')
  const grannyAfterCancel = await api('notice').list({ limit: 30 })
  check(
    !grannyAfterCancel.list.some(
      (n) => String(n.taskId) === String(schedTask.id) && n.templateKey === 'TASK_CANCELLED'
    ),
    '委托人自己不会收到取消通知'
  )

  // 「某一天」：截止存当天 23:59:59，且不设提前提醒
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
  const dayDeadline =
    tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate()) + ' 23:59:59'
  const dayTask = await taskSvc.create({
    title: '联调-某一天任务',
    description: '当天做完就行',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: dayDeadline,
    remindMinutes: 0,
  })
  const dayDetail = await taskSvc.detail(dayTask.id)
  const stored = new Date(dayDetail.deadline)
  check(
    stored.getHours() === 23 && stored.getMinutes() === 59 && stored.getSeconds() === 59,
    '某一天截止落在 23:59:59'
  )
  check(dayDetail.remindMinutes === 0, '某一天不设提前提醒')

  section('[18] 编辑：只有布置者能改，进行中只给一次')
  await as('granny', '奶奶')
  const editTask = await taskSvc.create({
    title: '联调-可编辑任务',
    description: '先写一句话',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: fmtAt(Date.now() + 5 * 3600 * 1000),
    remindMinutes: 0,
  })
  const editable = await taskSvc.detail(editTask.id)
  check(editable.canEdit === true, '待接受 canEdit=true')
  check(editable.isCreator === true, '布置者视角 isCreator=true')

  const edited1 = await taskSvc.update(editTask.id, { title: '联调-改过的标题' })
  check(edited1.title === '联调-改过的标题', '待接受可以反复改：' + edited1.title)
  const edited2 = await taskSvc.update(editTask.id, { description: '再改一句' })
  check(edited2.description === '再改一句', '第二次编辑也成功')

  // 非布置者看不到编辑入口
  await as('kid', '小明')
  const kidView = await taskSvc.detail(editTask.id)
  check(kidView.canEdit === false, '参与者 canEdit=false')
  let kidErr = ''
  try {
    await taskSvc.update(editTask.id, { title: '参与者想改' })
  } catch (e) {
    kidErr = e.message || ''
  }
  check(/只有布置的人/.test(kidErr), '参与者改不了：' + kidErr)

  // 有人接了 → 进行中，只能再改一次
  await taskSvc.accept(editTask.id)
  await as('granny', '奶奶')
  const inProgress = await taskSvc.detail(editTask.id)
  check(inProgress.status === 'in_progress', '有人接受后状态 ' + inProgress.status)
  check(inProgress.canEdit === true, '进行中还能再改一次')

  await taskSvc.update(editTask.id, { title: '进行中改的那一次' })
  const afterOnce = await taskSvc.detail(editTask.id)
  check(afterOnce.canEdit === false, '进行中改过一次后 canEdit=false')
  check(afterOnce.canCancel === true, '进行中的任务也能撤回 canCancel=true')
  let secondErr = ''
  try {
    await taskSvc.update(editTask.id, { title: '想再改一次' })
  } catch (e) {
    secondErr = e.message || ''
  }
  check(/改过一次/.test(secondErr), '进行中二次编辑被拒：' + secondErr)

  section('[19] 开始时间点 + 到点通知 + 编辑后通知全员')
  await as('granny', '奶奶')
  const noticeSvc2 = api('notice')
  const startNotifyTask = await taskSvc.create({
    title: '联调-开始时间点任务',
    description: '到点通知',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: fmtAt(Date.now() + 6 * 3600 * 1000),
    startAt: fmtAt(Date.now() + 3 * 3600 * 1000),
    startNotify: false,
    remindMinutes: 10,
  })
  const snDetail = await taskSvc.detail(startNotifyTask.id)
  check(snDetail.status === 'scheduled', '开始时间点任务 → 预约中')
  check(snDetail.startNotify === false, '到点通知可以关掉')
  check(!!snDetail.startAt, '开始时间点已保存')

  // 预约中可改开始时间点（打开通知）
  const newStart = fmtAt(Date.now() + 2 * 3600 * 1000)
  const editedStart = await taskSvc.update(startNotifyTask.id, {
    startAt: newStart,
    startNotify: true,
  })
  check(editedStart.startNotify === true, '编辑后开始通知打开')
  const editedStartDetail = await taskSvc.detail(startNotifyTask.id)
  const savedStart = new Date(editedStartDetail.startAt)
  check(
    Math.abs(savedStart.getTime() - new Date(newStart.replace(' ', 'T')).getTime()) < 60000,
    '开始时间点已改：' + editedStartDetail.startAt
  )

  // 编辑后参与者收到变更通知
  await as('kid', '小明')
  const kidNotices = await noticeSvc2.list({ limit: 20 })
  const edited = kidNotices.list.find(
    (n) => n.taskId === startNotifyTask.id && n.templateKey === 'TASK_EDITED'
  )
  check(!!edited, '参与者收到任务变更通知')
  if (edited) {
    const preview = edited.fields.map((f) => f.label + ':' + f.value).join(' | ')
    check(/截止时间/.test(preview), '变更通知字段：' + preview)
  }

  // 非预约中任务不能改开始时间（后端直接忽略）
  await as('granny', '奶奶')
  const pendingTask = await taskSvc.create({
    title: '联调-待接受改开始时间',
    description: '',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: fmtAt(Date.now() + 6 * 3600 * 1000),
    remindMinutes: 0,
  })
  const pendingEdit = await taskSvc.update(pendingTask.id, {
    startAt: fmtAt(Date.now() + 2 * 3600 * 1000),
  })
  check(pendingEdit.status === 'pending' && !pendingEdit.startAt, '非预约中任务不会被执行开始时间')

  // 关掉开始时间点 → 退回待接受
  const noStartTask = await taskSvc.create({
    title: '联调-取消开始时间点',
    description: '',
    participantIds: [kid.id],
    completionMode: 'all',
    deadline: fmtAt(Date.now() + 6 * 3600 * 1000),
    startAt: fmtAt(Date.now() + 3 * 3600 * 1000),
    remindMinutes: 0,
  })
  check(noStartTask.status === 'scheduled', '带开始时间的新任务 → 预约中')
  const cleared = await taskSvc.update(noStartTask.id, { removeStartTime: true, startAt: null })
  check(cleared.status === 'pending', '关掉开始时间点 → ' + cleared.status)
  check(!cleared.startAt, '开始时间点已清空')
  const clearedDetail = await taskSvc.detail(noStartTask.id)
  check(clearedDetail.status === 'pending' && !clearedDetail.startAt, '重新查询仍是待接受')

  // 「某一天」22:00 之后开始，后端拒绝
  const tomorrow2 = new Date(Date.now() + 24 * 3600 * 1000)
  const dayDl =
    tomorrow2.getFullYear() + '-' + pad(tomorrow2.getMonth() + 1) + '-' + pad(tomorrow2.getDate()) + ' 23:59:59'
  const day22 = tomorrow2.getFullYear() + '-' + pad(tomorrow2.getMonth() + 1) + '-' + pad(tomorrow2.getDate()) + ' 22:30:00'
  let lateErr = ''
  try {
    await taskSvc.create({
      title: '联调-某一天晚开始',
      description: '',
      participantIds: [kid.id],
      completionMode: 'all',
      deadline: dayDl,
      startAt: day22,
      remindMinutes: 0,
    })
  } catch (e) {
    lateErr = e.message || ''
  }
  check(/22:00/.test(lateErr), '「某一天」22:00 后开始被拒：' + lateErr)

  section('结果')
  console.log('  通过 ' + pass + ' 项，失败 ' + fails.length + ' 项')
  if (fails.length) {
    console.log('\n失败明细：')
    fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f))
    process.exitCode = 1
  }
}

run().catch((e) => {
  console.error('\n跑挂了：', e.message || e)
  if (e && e.raw) console.error('  后端返回：', JSON.stringify(e.raw))
  process.exitCode = 1
})
