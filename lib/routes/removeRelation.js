'use strict'
const helper = require('./helper.js')
const router = require('../router.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const tools = require('../tools.js')
const PromisifyHandler = require('../promisifyHandler.js')
const Relation = require('../Relation.js')
const { JsonApiError } = require('../errorHandlers/JsonApiError.js')

module.exports = class removeRelationRoute {
    static register() {
        router.bindRoute({
            verb: 'delete',
            path: ':type/:id/relationships/:relation'
        }, async (request, resourceConfig, res) => {
            let response

            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'update')
            helper.verifyRequest(request, resourceConfig, 'find')

            helper.checkForBody(request)

            const theirResource = await handler.find(request)

            const rel = Relation.getRelation(resourceConfig, request.params.relation)
            const isMany = rel.count == "many"
            const relationType = rel.resources
            const theirs = tools.ensureArray(request.params.data)

            const theirRelationP = theirResource[request.params.relation]
            const theirRelation = tools.isPromise(theirRelationP)
                ? await theirRelationP : theirRelationP

            const keys = tools.ensureArrayNotNullish(theirRelation).map(j => '' + j.id)

            for (const theirDatum of theirs) {
                if (relationType.indexOf(theirDatum.type) === -1) {
                    throw new JsonApiError({
                        status: 403,
                        code: 'EFORBIDDEN',
                        title: 'Invalid Request',
                        detail: `Invalid type ${theirDatum.type}`
                    })
                }
                const someId = theirDatum.id
                const indexOfTheirs = keys.indexOf('' + someId)
                if (indexOfTheirs === -1) {
                    throw new JsonApiError({
                        status: 403,
                        code: 'EFORBIDDEN',
                        title: 'Invalid Request',
                        detail: `Unknown id ${someId}`
                    })
                }
                if (isMany) {
                    theirRelation.splice(indexOfTheirs, 1)
                }
            }

            const theirRelationSimplified = isMany ?
                theirRelation.map(r => ({ ...r, id: '' + r.id })) : null

            const update = {
                id: '' + theirResource.id,
                type: theirResource.type,
                [request.params.relation]: theirRelationSimplified
            }

            helper.validateCreatePartial(update, resourceConfig)

            await handler.update(request, update)

            const newResource = await handler.find(request)

            postProcess.fetchForeignKeys(newResource, resourceConfig)

            const sanitisedData = await responseHelper.checkSchemaOnObject(
                newResource, resourceConfig, request.inferredBaseUrl)

            const sanitisedRelationData = sanitisedData.relationships[request.params.relation].data
            response = responseHelper.generateResponse(request, resourceConfig, sanitisedRelationData)
            await postProcess.handle(request, response)

            router.sendResponse(res, response, 200)
        })
    }
}