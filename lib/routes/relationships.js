'use strict'
const relationshipsRoute = module.exports = { }

const async = require('async')
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const ourJoi = require("../ourJoi.js")

relationshipsRoute.register = () => {
  router.bindRoute({
    verb: 'get',
    path: ':type/:id/relationships/:relation'
  }, (request, resourceConfig, res) => {
    let resource
    let response

    async.waterfall([
      callback => {
        helper.verifyRequest(request, resourceConfig, res, 'find', callback)
      },
      callback => {
        const relation = resourceConfig.attributes[request.params.relation]
        const settings = ourJoi.getSettings(relation)
        if (!(settings?.__one || settings?.__many)) {
          return callback({ // eslint-disable-line standard/no-callback-literal
            status: '404',
            code: 'ENOTFOUND',
            title: 'Resource not found',
            detail: 'The requested relation does not exist within the requested type'
          })
        }
        callback()
      },
      callback => {
        try {
          resourceConfig.handlers.find(request, callback)
        } catch (e) {
          callback(e)
        }
      },
      (result, callback) => {
        resource = result
        postProcess.fetchForeignKeys(request, resource, resourceConfig.attributes, callback)
      },
      callback => {
        responseHelper._checkSchemaOnObject(resource, resourceConfig.attributes, callback).catch(callback)
      },
      (sanitisedData, callback) => {
        if (!sanitisedData) {
          return callback({ // eslint-disable-line standard/no-callback-literal
            status: '404',
            code: 'EVERSION',
            title: 'Resource is not valid',
            detail: 'The requested resource does not conform to the API specification. This is usually the result of a versioning change.'
          })
        }
        sanitisedData = sanitisedData.relationships[request.params.relation].data
        response = responseHelper._generateResponse(request, resourceConfig, sanitisedData)
        callback()
      }
    ], err => {
      if (err) return helper.handleError(request, res, err)
      return router.sendResponse(res, response, 200)
    })
  })
}
