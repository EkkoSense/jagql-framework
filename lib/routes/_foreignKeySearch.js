'use strict'
const foreignKeySearchRoute = module.exports = { }

const async = require('async')
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const ourJoi = require("../ourJoi.js")

foreignKeySearchRoute.register = () => {
  const NonForeignKeyParam = new Set(['include', 'type', 'sort', 'filter',
    'fields', 'requestId'])
  router.bindRoute({
    verb: 'get',
    path: ':type/relationships/?'
  }, (request, resourceConfig, res) => {
    let foreignKey
    let searchResults
    let response

    async.waterfall([
      callback => {
        helper.verifyRequest(request, resourceConfig, res, 'search', callback)
      },
      callback => {
        foreignKey = Object.keys(request.params).filter(
          param => !NonForeignKeyParam.has(param)).pop()
        request.params.relationships = { }
        request.params.relationships[foreignKey] = request.params[foreignKey]
        delete request.params[foreignKey]
        callback()
      },
      callback => {
        const foreignKeySchema = resourceConfig.attributes[foreignKey]
        const settings = ourJoi.getSettings(foreignKeySchema)
        if (!settings) {
          return callback({ // eslint-disable-line standard/no-callback-literal
            status: '403',
            code: 'EFORBIDDEN',
            title: 'Invalid foreign key lookup',
            detail: `Relation [${foreignKey}] does not exist within ${request.params.type}`
          })
        }
        if (!(settings?.__one || settings?.__many)) {
          return callback({ // eslint-disable-line standard/no-callback-literal
            status: '403',
            code: 'EFORBIDDEN',
            title: 'Invalid foreign key lookup',
            detail: `Attribute [${foreignKey}] does not represent a relation within ${request.params.type}`
          })
        }
        callback()
      },
      callback => {
        try {
          resourceConfig.handlers.search(request, callback)
        } catch (e) {
          callback(e)
        }
      },
      (results, pageData, callback) => {
        searchResults = results.map(result => ({
          id: '' + result.id,
          type: result.type
        }))
        if (resourceConfig.attributes[foreignKey]) {
          searchResults = searchResults[0] || null
        }
        callback()
      },
      callback => {
        response = responseHelper._generateResponse(request, resourceConfig, searchResults)
        response.included = [ ]
        postProcess.handle(request, response, callback)
      }
    ], err => {
      if (err) return helper.handleError(request, res, err)
      return router.sendResponse(res, response, 200)
    })
  })
}
