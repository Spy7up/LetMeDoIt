/**
 * 展示层派生：把接口返回的原始数据加工成「WXML 直接可用」的形状。
 * 页面里不做格式化计算，全部在这里一次算好（也便于以后换 UI 时复用）。
 */
const { formatDeadline, formatRelative, formatOverdue } = require('./format')
const { isRemote } = require('./avatar')
const { STATUS_MAP, PARTICIPANT_STATUS_MAP, COMPLETION_MODE_MAP } = require('../constants/task')

const PALETTE = [
  { bg: '#FFD9CF', fg: '#B4492A' },
  { bg: '#D6E4FF', fg: '#2B4C8C' },
  { bg: '#D9F0E4', fg: '#1F6B4F' },
  { bg: '#E8DEFB', fg: '#5B4A9E' },
  { bg: '#FBE7C6', fg: '#8A5A12' },
  { bg: '#FFE2D6', fg: '#B4492A' },
]

function hash(str) {
  const s = String(str || '')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 9973
  }
  return h
}

/**
 * 头像：取昵称末字当首图，底色由 id 稳定散列
 * <p>
 * 默认头像是「字 + 色块」，**任何情况下都有值**，不允许出现空白头像：
 * 只有公网 http(s) 地址才交给 <image>，临时路径（wxfile:// / http://tmp/）和空值
 * 一律清成空串，让模板走色块分支。详见 utils/avatar.js。
 */
function presentUser(u) {
  if (!u) return null
  const p = PALETTE[hash(u.id || u.userId) % PALETTE.length]
  const nickname = u.nickname || '有人'
  return Object.assign({}, u, {
    nickname,
    avatarUrl: isRemote(u.avatarUrl) ? u.avatarUrl : '',
    initial: nickname.slice(-1) || '?',
    avatarStyle: 'background:' + p.bg + ';color:' + p.fg,
  })
}

function presentParticipant(p) {
  const style = PARTICIPANT_STATUS_MAP[p.status] || PARTICIPANT_STATUS_MAP.pending
  return Object.assign(presentUser(p), {
    statusLabel: style.label,
    statusClass: 't-' + p.status,
    subText:
      p.status === 'done'
        ? p.remark || '已完成自己那份'
        : p.status === 'rejected'
        ? p.rejectReason || '拒绝了'
        : p.status === 'accepted'
        ? '还没说自己做完了'
        : p.status === 'skipped'
        ? '已完成，无需参与'
        : '还没接受',
    doneTimeText: p.completedAt ? formatRelative(p.completedAt) : '',
  })
}

function modeText(mode) {
  return mode === 'all' ? '需全员完成' : '任一人完成'
}

/** 列表项 */
function presentTask(t) {
  const display = t.displayStatus || t.status
  const style = STATUS_MAP[display] || STATUS_MAP.pending
  const isOverdue = display === 'overdue'
  const participants = (t.participants || []).map(presentUser)
  const counterpart = presentUser(t.counterpart)
  const isCreator = t.role === 'creator'

  // 卡片抬头：收到的看委托人，发出的看参与者（多人时显示"我布置的"）
  let head = counterpart
  let headName = counterpart ? counterpart.nickname : '有人'
  if (isCreator) {
    if (participants.length > 1) {
      headName = '我布置的'
    } else if (participants.length === 1) {
      head = participants[0]
      headName = participants[0].nickname
    }
  }

  return Object.assign({}, t, {
    participants,
    counterpart,
    headName,
    headInitial: head ? head.initial : '人',
    headStyle: head ? head.avatarStyle : 'background:#EFE9E3;color:#8C8279',
    statusLabel: style.label,
    statusClass: 't-' + display,
    deadlineText: formatDeadline(t.deadline),
    timeText: isOverdue ? formatOverdue(t.deadline) : formatDeadline(t.deadline),
    timeIsLate: isOverdue,
    timeAgo: formatRelative(t.updatedAt),
    modeText: modeText(t.completionMode),
    isMulti: (t.participantCount || 1) > 1,
    doneCount: (t.progress && t.progress.done) || 0,
    totalCount: (t.progress && t.progress.total) || (t.participantCount || 1),
    peopleText: participants
      .slice(0, 3)
      .map((p) => p.nickname)
      .join('、'),
    // 卡片上的可执行动作
    showAccept: !isCreator && t.myStatus === 'pending',
    showComplete: !isCreator && t.myStatus === 'accepted',
    showRemind: isCreator && (display === 'in_progress' || display === 'pending' || display === 'overdue'),
  })
}

/** 详情 */
function presentDetail(d) {
  const display = d.displayStatus || d.status
  const style = STATUS_MAP[display] || STATUS_MAP.pending
  const total = (d.progress && d.progress.total) || 1
  const done = (d.progress && d.progress.done) || 0
  const percent = Math.round((done / total) * 100)

  return Object.assign({}, d, {
    creator: presentUser(d.creator),
    participants: (d.participants || []).map(presentParticipant),
    statusLabel: style.label,
    statusClass: 't-' + display,
    deadlineText: formatDeadline(d.deadline),
    // 只有设了开始时间点才展示，没有就是空串（模板里 wx:if 控制）
    startText: d.startAt ? formatDeadline(d.startAt) : '',
    createdText: formatRelative(d.createdAt),
    modeText: modeText(d.completionMode),
    modeHint: (COMPLETION_MODE_MAP[d.completionMode] || COMPLETION_MODE_MAP.any).hint,
    bylineText:
      (d.isCreator ? '我布置的' : (d.creator && d.creator.nickname) + ' 布置的') +
      (total > 1 ? ' · ' + total + ' 人一起做' : ''),
    doneCount: done,
    totalCount: total,
    percent,
    barStyle: 'width:' + percent + '%',
    events: (d.events || []).map((e) =>
      Object.assign({}, e, {
        actor: presentUser(e.actor),
        timeText: formatRelative(e.createdAt),
      })
    ),
  })
}

/** 服务通知 */
function presentNotice(m) {
  return Object.assign({}, m, {
    // 微信服务通知里的时间是"今天 22:08 / 昨天 21:40"这种写法
    timeText: formatDeadline(m.createdAt),
    preview: (m.fields || []).slice(0, 2).map((f) => f.value).join(' · '),
  })
}

module.exports = {
  presentUser,
  presentParticipant,
  presentTask,
  presentDetail,
  presentNotice,
  modeText,
}
