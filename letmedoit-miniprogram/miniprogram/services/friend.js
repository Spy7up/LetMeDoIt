/**
 * 好友关系
 *
 * 注意两个 id 不要混：
 *  - friendId 是「关系 id」，解除好友用它
 *  - memberId（页面里的 userId）是「人」，派活、加好友、选参与人都用它
 */
const { http } = require('../utils/request')
const adapt = require('./adapt')

function list(keyword) {
  return http
    .get('/api/friend/list', keyword ? { keyword } : null)
    .then((rows) => (rows || []).map(adapt.friend))
}

function listRequests() {
  return http.get('/api/friend/request/list').then((rows) => (rows || []).map(adapt.request))
}

/** 发起好友申请 */
function request(toUserId, message) {
  return http.post('/api/friend/request/add', {
    toMemberId: Number(toUserId),
    applyMessage: message || '',
  })
}

function acceptRequest(id) {
  return http.post('/api/friend/request/accept', { requestId: Number(id) })
}

function rejectRequest(id) {
  return http.post('/api/friend/request/reject', { requestId: Number(id) })
}

/** 我的邀请码与分享路径 */
function getInvite() {
  return http.get('/api/friend/invite')
}

/**
 * 邀请码预览（点开分享卡片的人看）
 * @param {string} code 邀请码
 * @returns {Promise<{inviteCode, memberId, nickname, avatar, selfFlag, friendFlag}>}
 */
function invitePreview(code) {
  const value = String(code || '').trim().toUpperCase()
  return http.get('/api/friend/invite/' + encodeURIComponent(value))
}

/**
 * 输入邀请码加好友（双向直接建立关系，不需要对方确认）
 * @returns {Promise<{message:string}>} 后端返回的是文案，如「已加上 妈妈」
 */
function acceptInviteCode(code) {
  return http
    .post('/api/friend/invite/accept', { inviteCode: String(code || '').trim().toUpperCase() })
    .then((message) => ({ message: message || '已加上好友' }))
}

function remove(friendId) {
  return http.post('/api/friend/remove', { friendId: Number(friendId) })
}

module.exports = {
  list,
  listRequests,
  request,
  acceptRequest,
  rejectRequest,
  getInvite,
  invitePreview,
  acceptInviteCode,
  remove,
}
