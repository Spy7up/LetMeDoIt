/**
 * 好友关系
 */
const { http } = require('../utils/request')

function list(keyword) {
  return http.get('/friends', keyword ? { keyword } : null).then((res) => res.list)
}

function listRequests() {
  return http.get('/friends/requests').then((res) => res.list)
}

function request(toUserId, message) {
  return http.post('/friends/requests', { toUserId, message: message || '' })
}

function acceptRequest(id) {
  return http.post('/friends/requests/' + id + '/accept')
}

function rejectRequest(id) {
  return http.post('/friends/requests/' + id + '/reject')
}

function getInvite() {
  return http.get('/friends/invite')
}

function acceptInviteCode(code) {
  return http.post('/friends/invite/accept', { code: String(code || '').trim().toUpperCase() })
}

function remove(friendId) {
  return http.del('/friends/' + friendId)
}

module.exports = {
  list,
  listRequests,
  request,
  acceptRequest,
  rejectRequest,
  getInvite,
  acceptInviteCode,
  remove,
}
