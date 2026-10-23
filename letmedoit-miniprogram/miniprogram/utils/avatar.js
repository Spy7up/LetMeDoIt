/**
 * 头像
 *
 * 硬约束（个人主体 + 还没接文件上传）：
 *   wx 的 chooseAvatar 给的是**本机临时路径**（wxfile://… / http://tmp/…），
 *   既不能分享给别人，重启后也会失效。所以它绝对不能当"头像 URL"存进数据库，
 *   否则换台设备打开就是裂图 —— 这就是之前"头像不显示"的根因。
 *
 * 于是头像分两层：
 *   1. 默认头像：昵称最后一个字 + 稳定色块（纯 CSS，在 utils/present.js 里算）。
 *      这一层**永远存在、永远不会裂**，是全站（好友、任务、详情）看到的形态。
 *   2. 本机预览：用户自己选的头像只写本机 storage，仅「我的」和资料页可见；
 *      临时文件被微信回收后 <image> 会 binderror，页面自动回落成色块。
 */

/** 本机预览头像的存储键（全局只有一个：当前登录用户） */
const KEY = 'lmd_avatar'

/**
 * 是不是可以给别人看的公网地址
 * 只认 http(s)，且排除临时目录：wxfile:// 与 http://tmp/ 都是本机文件
 */
function isRemote(url) {
  const text = String(url == null ? '' : url).trim()
  if (!text) return false
  if (text.indexOf('wxfile://') === 0) return false
  if (text.indexOf('/tmp/') >= 0 || text.indexOf('http://tmp') === 0) return false
  return /^https?:\/\//i.test(text)
}

/** 读本机预览头像；可能已失效，交给页面 binderror 自愈 */
function getLocal() {
  try {
    const value = wx.getStorageSync(KEY)
    return value ? String(value) : ''
  } catch (e) {
    return ''
  }
}

function setLocal(url) {
  try {
    if (url) wx.setStorageSync(KEY, url)
    else wx.removeStorageSync(KEY)
  } catch (e) {
    // 存储失败只影响预览，不影响默认头像
  }
}

function clearLocal() {
  setLocal('')
}

/**
 * 「我的」页专用：本机预览优先，其余情况保持服务端头像（没有就用色块）
 * 注意：只对当前用户调用，别用在好友/参与者身上，否则会把我的头像套到别人头上
 */
function withLocalAvatar(user) {
  if (!user) return user
  const local = getLocal()
  return local ? Object.assign({}, user, { avatarUrl: local }) : user
}

module.exports = { KEY, isRemote, getLocal, setLocal, clearLocal, withLocalAvatar }
