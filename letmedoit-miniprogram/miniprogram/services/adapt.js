/**
 * 接口适配层（后端 VO → 页面领域模型）
 *
 * 为什么需要这一层：
 *  1. 后端 ID 是 Long、状态是数字、时间是 "yyyy-MM-dd HH:mm:ss"；
 *     页面用字符串状态、ISO 时间，两边直接耦合以后很难改。
 *  2. 页面模板（present.js）只认一套字段，视图层不关心后端长什么样。
 *
 * 约定：只在这里做字段改名与类型转换，不做任何业务判断
 * （权限位 canXxx、聚合状态 status 全部由服务端给出，前端不重算）。
 */
const {
  TASK_STATUS_CODE,
  PARTICIPANT_STATUS_CODE,
  ROLE_CODE,
  COMPLETION_MODE_CODE,
} = require('../constants/task')
const { toIso } = require('../utils/format')

/** 后端 Long 可能是数字或字符串，统一成字符串（页面做 === 比较时不会翻车） */
function id(value) {
  return value == null ? '' : String(value)
}

function toStatus(code) {
  return TASK_STATUS_CODE[code] || 'pending'
}

function toParticipantStatus(code) {
  return PARTICIPANT_STATUS_CODE[code] || 'pending'
}

function toRole(code) {
  return ROLE_CODE[code] || 'assignee'
}

function toCompletionMode(code) {
  return COMPLETION_MODE_CODE[code] || 'any'
}

/** TaskUserVO / WxMemberVO → 页面用户 */
function user(vo) {
  if (!vo) return null
  return {
    id: id(vo.memberId),
    userId: id(vo.memberId),
    nickname: vo.nickname || '',
    avatarUrl: vo.avatar || '',
  }
}

/** 当前登录会员 */
function member(vo) {
  if (!vo) return null
  return {
    id: id(vo.memberId),
    userId: id(vo.memberId),
    memberId: id(vo.memberId),
    nickname: vo.nickname || '',
    avatarUrl: vo.avatar || '',
    phone: vo.phone || '',
    gender: vo.gender == null ? 0 : vo.gender,
    inviteCode: vo.inviteCode || '',
  }
}

/** TaskParticipantVO（继承 TaskUserVO，自带 memberId/nickname/avatar） */
function participant(vo) {
  if (!vo) return null
  return Object.assign(user(vo), {
    status: toParticipantStatus(vo.status),
    statusDesc: vo.statusDesc || '',
    completedAt: toIso(vo.completeTime),
    remark: vo.completeRemark || '',
    images: vo.completeImages || [],
    rejectReason: vo.rejectReason || '',
  })
}

/** 列表项 TaskListVO */
function listItem(vo) {
  const total = vo.participantCount || 0
  return {
    id: id(vo.taskId),
    title: vo.title || '',
    status: toStatus(vo.status),
    statusDesc: vo.statusDesc || '',
    isOverdue: !!vo.overdueFlag,
    deadline: toIso(vo.deadline),
    role: toRole(vo.role),
    completionMode: toCompletionMode(vo.completionMode),
    participantCount: total,
    progress: { total, done: vo.doneCount || 0 },
    participants: (vo.participants || []).map(user),
    counterpart: user(vo.creator),
    myStatus: vo.myStatus == null ? null : toParticipantStatus(vo.myStatus),
    updatedAt: toIso(vo.updateTime),
  }
}

/** 事件 TaskEventVO */
function event(vo) {
  return {
    id: id(vo.eventId),
    type: vo.eventTypeDesc || '',
    text: vo.content || '',
    actor: user(vo.actor),
    createdAt: toIso(vo.createTime),
  }
}

/** 详情 TaskDetailVO */
function detail(vo) {
  if (!vo) return null
  return {
    id: id(vo.taskId),
    title: vo.title || '',
    description: vo.description || '',
    creator: user(vo.creator),
    participants: (vo.participants || []).map(participant),
    completionMode: toCompletionMode(vo.completionMode),
    progress: {
      total: vo.totalCount || 0,
      done: vo.doneCount || 0,
      accepted: vo.acceptedCount || 0,
      rejected: vo.rejectedCount || 0,
      skipped: vo.skippedCount || 0,
    },
    status: toStatus(vo.status),
    startAt: toIso(vo.startTime),
    deadline: toIso(vo.deadline),
    remindMinutes: vo.remindMinutes || 0,
    isOverdue: !!vo.overdueFlag,

    // 我这格的状态 + 按钮权限（权限位由服务端算，前端直接用）
    me: vo.me
      ? {
          userId: id(vo.me.memberId),
          status: toParticipantStatus(vo.me.status),
          completedAt: toIso(vo.me.completeTime),
          remark: vo.me.completeRemark || '',
          images: vo.me.completeImages || [],
          canAccept: !!vo.canAccept,
          canReject: !!vo.canReject,
          canComplete: !!vo.canComplete,
        }
      : null,
    isCreator: !!vo.creatorFlag,
    canCancel: !!vo.canCancel,
    canRemind: !!vo.canRemind,
    canAddParticipant: !!vo.canAddParticipant,
    canEdit: !!vo.canEdit,

    createdAt: toIso(vo.createTime),
    updatedAt: toIso(vo.updateTime),
    events: (vo.events || []).map(event),
  }
}

/** FriendVO */
function friend(vo) {
  return {
    id: id(vo.friendId),
    userId: id(vo.memberId),
    nickname: vo.nickname || '',
    avatarUrl: vo.avatar || '',
    remark: vo.remark || '',
    displayName: vo.displayName || vo.nickname || '',
    activeTaskCount: vo.activeTaskCount || 0,
    lastActiveAt: toIso(vo.lastActiveTime),
  }
}

/** FriendRequestVO */
function request(vo) {
  return {
    id: id(vo.requestId),
    fromUser: user(vo.fromMember),
    message: vo.applyMessage || '',
    createdAt: toIso(vo.createTime),
  }
}

/** NoticeVO */
function notice(vo) {
  return {
    id: id(vo.noticeId),
    taskId: id(vo.taskId),
    templateKey: vo.templateKey || '',
    title: vo.title || '',
    fields: vo.fields || [],
    read: !!vo.readFlag,
    createdAt: toIso(vo.createTime),
  }
}

module.exports = {
  user,
  member,
  participant,
  listItem,
  detail,
  event,
  friend,
  request,
  notice,
}
