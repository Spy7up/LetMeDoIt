/**
 * 文件上传
 *
 * 头像、任务凭证图统一走这里：先把图传到对象存储，拿到公网 https URL 再提交业务接口。
 * 微信给的是本机临时路径（wxfile:// / http://tmp/），只能本机预览，绝不能存库。
 *
 * 注意：wx.uploadFile 的合法域名要在小程序后台「uploadFile 合法域名」里配，
 * 这里传的是我们自己的后端（和 request 同一个域名），一般不用额外加。
 */
const config = require('../config/index')
const { getToken } = require('../utils/request')

const UPLOAD_URL = '/api/file/upload'
const TIMEOUT = 30000

function authHeader() {
  const token = getToken()
  if (!token) return {}
  const value = config.TOKEN_PREFIX ? config.TOKEN_PREFIX + ' ' + token : token
  return { [config.TOKEN_HEADER]: value }
}

/**
 * 上传一张图片
 *
 * @param {string} filePath 临时文件路径
 * @param {string} bizType  avatar / task-image
 * @returns {Promise<{url:string, key:string}>}
 */
function uploadImage(filePath, bizType) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('没有要上传的图片'))
      return
    }
    wx.uploadFile({
      url: config.BASE_URL + UPLOAD_URL,
      filePath,
      name: 'file',
      timeout: TIMEOUT,
      header: authHeader(),
      formData: { bizType: bizType || 'common' },
      success(res) {
        let body = null
        try {
          body = JSON.parse(res.data)
        } catch (e) {
          body = null
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || !body || body.code !== 0) {
          reject(new Error((body && body.msg) || '上传失败，请重试'))
          return
        }
        const data = body.data || {}
        if (!data.fileUrl) {
          reject(new Error('上传成功但没拿到地址，请重试'))
          return
        }
        resolve({ url: data.fileUrl, key: data.fileKey || '' })
      },
      fail() {
        reject(new Error('上传失败，请检查网络后重试'))
      },
    })
  })
}

module.exports = { uploadImage }
