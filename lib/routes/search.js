'use strict'
const searchRoute = module.exports = { }

const async = require('async')
const helper = require('./helper.js')
const router = require('../router.js')
const filter = require('../filter.js')
const pagination = require('../pagination.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')

searchRoute.register = () => {
  router.bindRoute({
    verb: 'get',
    path: ':type'
  }, (request, resourceConfig, res) => {
    let searchResults
    let response
    let paginationInfo

    async.waterfall([
      callback => {
        helper.verifyRequest(request, resourceConfig, res, 'search', callback)
      },
      callback => {
        helper.validate(request.params, resourceConfig.searchParams, callback)
      },
      function parseAndValidateFilter (callback) {
        return callback(filter.parseAndValidate(request))
      },
      function validatePaginationParams (callback) {
        pagination.validatePaginationParams(request)
        return callback()
      },
      callback => {
        try {
          resourceConfig.handlers.search(request, callback)
        } catch (e) {
          console.error(e)
          callback(e)
        }
      },
      function enforcePagination (results, pageInfo, callback) {
        searchResults = pagination.enforcePagination(request, results)
        paginationInfo = pageInfo
        return callback()
      },
      callback => {
        postProcess.fetchForeignKeys(request, searchResults, resourceConfig.attributes, callback)
      },
      callback => {
        responseHelper._checkSchemaOnArray(searchResults, resourceConfig.attributes, callback).catch(callback)
      },
      (sanitisedData, callback) => {
        try {
          response = responseHelper._generateResponse(request, resourceConfig, sanitisedData, paginationInfo)
          response.included = [ ]
          postProcess.handle(request, response, callback)
        } catch(e) {
          callback(e)
        }
      }
    ], err => {
      if (err) return helper.handleError(request, res, err)
      return router.sendResponse(res, response, 200)
    })
  })
}
