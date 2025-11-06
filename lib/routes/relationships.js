'use strict'

const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const PromisifyHandler = require('../promisifyHandler.js')
const Relation = require('../Relation.js')
const { JsonApiError } = require('../errorHandlers/JsonApiError.js')

module.exports = class relationshipsRoute {
    static register() {
        router.bindRoute({
            verb: 'get',
            path: ':type/:id/relationships/:relation'
        }, async (request, resourceConfig, res) => {
            let response

            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'find')

            const rel = Relation.getRelation(resourceConfig, request.params.relation)
            if (!rel) {
                throw new JsonApiError({
                    status: 404,
                    code: 'ENOTFOUND',
                    title: 'Resource not found',
                    detail: 'The requested relation does not exist within the requested type'
                })
            }

            const resource = await handler.find(request)

            postProcess.fetchForeignKeys(resource, resourceConfig)

            const sanitisedData = await responseHelper.checkSchemaOnObject(
                resource, resourceConfig, request.inferredBaseUrl)

            if (!sanitisedData) {
                throw new JsonApiError({
                    status: 404,
                    code: 'EVERSION',
                    title: 'Resource is not valid',
                    detail: 'The requested resource does not conform to the API specification. This is usually the result of a versioning change.'
                })
            }
            const sanitisedRelationshipData = sanitisedData.relationships[request.params.relation].data
            response = responseHelper.generateResponse(request, resourceConfig, sanitisedRelationshipData)

            return router.sendResponse(res, response, 200)
        })
    }
}