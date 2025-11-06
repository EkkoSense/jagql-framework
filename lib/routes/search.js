'use strict'
const helper = require('./helper.js')
const router = require('../router.js')
const filter = require('../filter.js')
const pagination = require('../pagination.js')
const postProcess = require('../postProcess.js')
const responseHelper = require('../responseHelper.js')
const PromisifyHandler = require('../promisifyHandler.js')

module.exports = class searchRoute {
    static register() {
        router.bindRoute({
            verb: 'get',
            path: ':type'
        }, async (request, resourceConfig, res) => {
            let response
            const handler = PromisifyHandler.for(resourceConfig?.handlers)

            helper.verifyRequest(request, resourceConfig, 'search')

            helper.validateSearch(request, resourceConfig)

            filter.parseAndValidate(request)

            pagination.importPaginationParams(request)

            const [searchResultsIn, paginationInfo] = await handler.search(request)
            const searchResults = pagination.enforcePagination(request, searchResultsIn)

            postProcess.fetchForeignKeys(searchResults, resourceConfig)

            const sanitisedData = await responseHelper.checkSchemaOnArray(
                searchResults, resourceConfig, request.inferredBaseUrl)

            response = responseHelper.generateResponse(request, resourceConfig, sanitisedData, paginationInfo)
            response.included = []
            await postProcess.handle(request, response)

            return router.sendResponse(res, response, 200)
        })
    }
}