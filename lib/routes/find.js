'use strict'

const helper = require('./helper.js')
const router = require('../router.js')
const filter = require('../filter.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const PromisifyHandler = require('../promisifyHandler.js')
const { JsonApiError } = require('../errorHandlers/JsonApiError.js')

module.exports = class findRoute {
    static register() {
        router.bindRoute({
            verb: 'get',
            path: ':type/:id'
        }, async (request, resourceConfig, res) => {
            let response
            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'find')

            filter.parseAndValidate(request)

            const resource = await handler.find(request)

            postProcess.fetchForeignKeys(resource, resourceConfig)
            const inferredBaseUrl = request.inferredBaseUrl

            const sanitisedData = resourceConfig.options?.enforceSchemaOnGet ?
                await responseHelper.enforceSchemaOnObject(resource,
                    resourceConfig, inferredBaseUrl) :
                await responseHelper.checkSchemaOnObject(resource,
                    resourceConfig, inferredBaseUrl)

            if (!sanitisedData) {
                throw new JsonApiError({
                    status: 404,
                    code: 'EVERSION',
                    title: 'Resource is not valid',
                    detail: 'The requested resource does not conform to the API specification. This is usually the result of a versioning change.'
                })
            }
            response = responseHelper.generateResponse(request, resourceConfig, sanitisedData)
            response.included = []
            await postProcess.handle(request, response)

            return router.sendResponse(res, response, 200)
        })
    }
}