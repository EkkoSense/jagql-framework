'use strict'
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const PromisifyHandler = require('../promisifyHandler.js')

module.exports = class updateRoute {
    static register() {
        router.bindRoute({
            verb: 'patch',
            path: ':type/:id'
        }, async (request, resourceConfig, res) => {
            let response
            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'update')
            helper.verifyRequest(request, resourceConfig, 'find')

            helper.checkForBody(request)

            const theirs = request.params.data
            const theirResource = {
                id: request.params.id,
                type: request.params.type,
                ...theirs.attributes,
                meta: theirs.meta
            }
            for (const i in theirs.relationships) {
                theirResource[i] = theirs.relationships[i].data
            }

            helper.validateCreatePartial(theirResource, resourceConfig)

            await handler.update(request, theirResource)
            const newResource = await handler.find(request)

            postProcess.fetchForeignKeys(newResource, resourceConfig)

            const sanitisedData = await responseHelper.enforceSchemaOnObject(
                newResource, resourceConfig, request.inferredBaseUrl)

            response = responseHelper.generateResponse(request, resourceConfig, sanitisedData)
            await postProcess.handle(request, response)

            router.sendResponse(res, response, 200)
        })
    }
}