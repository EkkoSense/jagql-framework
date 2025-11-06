'use strict'
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const PromisifyHandler = require('../promisifyHandler.js')
const Relation = require('../Relation.js')

module.exports = class addRelationRoute {
    static register() {
        router.bindRoute({
            verb: 'post',
            path: ':type/:id/relationships/:relation'
        }, async (request, resourceConfig, res) => {
            let response

            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'update')
            helper.verifyRequest(request, resourceConfig, 'find')
            helper.checkForBody(request)
            const ourResource = await handler.find(request)

            const theirResource = JSON.parse(JSON.stringify(ourResource))

            const theirs = request.params.data

            const rel = Relation.getRelation(resourceConfig, request.params.relation)
            if (rel.count == "many") {
                theirResource[request.params.relation] = theirResource[request.params.relation] || []
                theirResource[request.params.relation].push(theirs)
            } else {
                theirResource[request.params.relation] = theirs
            }

            helper.validateCreate(theirResource, resourceConfig)

            await handler.update(request, theirResource)

            const newResource = await handler.find(request)

            postProcess.fetchForeignKeys(newResource, resourceConfig)

            const sanitisedData = await responseHelper.enforceSchemaOnObject(
                newResource, resourceConfig, request.inferredBaseUrl)

            const sanitisedRelationData = sanitisedData.relationships[request.params.relation].data
            response = responseHelper.generateResponse(request, resourceConfig, sanitisedRelationData)
            await postProcess.handle(request, response)

            router.sendResponse(res, response, 201)
        })
    }
}