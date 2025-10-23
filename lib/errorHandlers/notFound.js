'use strict'
const helper = require('../routes/helper.js')
const router = require('../router.js')
const { JsonApiError } = require('./JsonApiError.js')

module.exports = class notFound {
  static register() {
    router.bindNotFound((request, res) => {
      if(res.headersSent) {
        return
      }
      helper.handleError(request, res, new JsonApiError({
        status: 404,
        code: 'EINVALID',
        title: 'Invalid Route',
        detail: 'This is not the API you are looking for?'
      }))
    })
  }
}