'use strict'
const createRoute = module.exports = { }

const async = require('async')
const _ = {
  assign: require('lodash.assign')
}
const uuid = require('uuid')
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')

createRoute.register = () => {
  router.bindRoute({
    verb: 'post',
    path: ':type'
  }, (request, resourceConfig, res) => {
    let theirResource
    let newResource
    let response

    async.waterfall([
      callback => {
        helper.verifyRequest(request, resourceConfig, res, 'create', callback)
      },
      callback => {
        helper.verifyRequest(request, resourceConfig, res, 'find', callback)
      },
      callback => {
        helper.checkForBody(request, callback)
      },
      callback => {
        const theirs = request.params.data
        theirResource = _.assign(
          { type: request.params.type },
          (request.resourceConfig.primaryKey === 'uuid') && { id: uuid.v4() },
          (request.resourceConfig.primaryKey === 'autoincrement') && { id: 'DEFAULT' },
          theirs.id && { id: theirs.id }, // Take id from client if provided, but not for autoincrement
          theirs.attributes,
          { meta: theirs.meta }
        )
        for (const i in theirs.relationships) {
          theirResource[i] = theirs.relationships[i].data
        }
        helper.validate(theirResource, resourceConfig.onCreate, callback)
      },
      callback => {
        try {
          resourceConfig.handlers.create(request, theirResource, callback)
        } catch (e) {
          callback(e)
        }
      },
      (result, callback) => {
        newResource = result
        request.params.id = '' + newResource.id
        try {
          resourceConfig.handlers.find(request, callback)
        } catch (e) {
          callback(e)
        }
      },
      (result, callback) => {
        newResource = result
        postProcess.fetchForeignKeys(request, newResource, resourceConfig.attributes, callback)
      },
      callback => {
        responseHelper._enforceSchemaOnObject(newResource, resourceConfig.attributes, callback).catch(callback)
      },
      (sanitisedData, callback) => {
        request.route.path += `/${newResource.id}`
        res.set({
          'Location': `${request.route.combined}/${newResource.id}`
        })
        response = responseHelper._generateResponse(request, resourceConfig, sanitisedData)
        postProcess.handle(request, response, callback)
      }
    ], err => {
      if (err) return helper.handleError(request, res, err)
      return router.sendResponse(res, response, 201)
    })
  })
}
