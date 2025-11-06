'use strict'
const debug = require('./debugging.js')
const rerouter = require('./rerouter.js')
const srt = require('./postProcessing/sort.js')
const filter = require('./postProcessing/filter.js')
const incl = require('./postProcessing/include.js')
const fields = require('./postProcessing/fields.js')
const tools = require('./tools.js')
const jsonApiConfig = require('./jsonApiConfig.js')
const Relation = require('./Relation.js')
const RemoteRelation = require('./RemoteRelation.js')

/**
 * @typedef {import('../types/JsonApiRequest.js').JsonApiRequest} JsonApiRequest
 */

/**
 *
 */
module.exports = class postProcess {
  /**
   *
   * @param {JsonApiRequest} request
   * @returns
   */
  static #getHandlerFromRequest(request) {
    // sometimes the resourceConfig is an object... sometimes it's an array.
    const rc = (request.resourceConfig instanceof Array) ?
      request.resourceConfig[0] : request.resourceConfig
    return rc?.handlers
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @param {import('../types/JsonApiResponse.js').JsonApiResponseBodyWithMeta} response
   * @param {string} name
   * @param {(request: JsonApiRequest, response:
   * import('../types/JsonApiResponse.js').JsonApiResponseBodyWithMeta) => *} f
   */
  static async #postProcess(request, response, name, f) {
    request.postProcess = name
    await f(request, response)
    delete request.postProcess
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @param {import('../types/JsonApiResponse.js').JsonApiResponseBodyWithMeta} response
   */
  static async handle(request, response) {
    const handler = this.#getHandlerFromRequest(request)
    if(!handler?.handlesSort) {
      await this.#postProcess(request, response, "sort", (request, response) => srt.action(request, response))
    }
    if(!handler?.handlesFilter) {
      await this.#postProcess(request, response, "filter", (request, response) => filter.action(request, response))
    }
    // not permitting handlers to skip includes or fields, since these two steps cross the bounds into
    // other handlers' data.
    await this.#postProcess(request, response, "includes", (request, response) => incl.action(request, response))
    return this.#postProcess(request, response, "fields", (request, response) => fields.action(request, response))
  }

  /**
   * @template R
   * @param {JsonApiRequest} request
   * @param {R} mainResource
   * @returns {Promise<[any[], number | null]>}
   */
  static async fetchRelatedResources(request, mainResource) {
    // Fetch the other objects
    const dataItemOrItems = mainResource[request.params.relation]

    if (!dataItemOrItems) return [[ null ], null]

    const dataItems = tools.ensureArrayNotNullish(dataItemOrItems)

    const page = request.params.page
    const total = dataItems.length
    const dataItemsPage = dataItems.slice(page.offset,
      page.offset + page.limit)

    /**
     * @type {Record<string, string[]>}
     */
    const resourcesByType = {}
    for(const dataItem of dataItemsPage) {
      resourcesByType[dataItem.type] ??= [ ]
      resourcesByType[dataItem.type].push(dataItem.id)
    }

    /**
     * URIs compatible with the rerouter
     */
    const resourceUrisToFetch = Object.keys(resourcesByType).map(type => {
      const ids = resourcesByType[type]
      let query = ids.map(id => `filter[id]=${id}`).join("&")
      if (request.route.query) {
        query += `&${request.route.query}`
      }
      return `${jsonApiConfig.pathPrefix + type}/?${query}`
    })

    /**
     * @type {any[]}
     */
    const relatedResources = []
    for(const related of resourceUrisToFetch) {
      debug.include(related)

      let body
      try {
        body = await rerouter.route({
          method: 'GET',
          uri: related,
          originalRequest: request,
          params: { filter: request.params.filter,
            page: { offset: 0, limit: dataItemsPage.length } }
        })
      } catch(err) {
        debug.include('!!', JSON.stringify(err))
        if(err.errors) {
          throw err.errors
        } else {
          throw err
        }
      }
      const data = tools.ensureArrayNotNullish(body.data)

      relatedResources.push(...data)
    }
    return [relatedResources, total]
  }

  /**
   * This is generally called once per request
   *
   * @param {*[] | *} itemOrItems
   * @param {import('../types/ResourceConfig.js').ResourceConfig} resourceConfig
   * @returns
   */
  static fetchForeignKeys(itemOrItems, resourceConfig) {
    const items = tools.ensureArray(itemOrItems)
    const stripKeys = Relation.getAllRelations(resourceConfig).filter(([i, rel]) => {
      return RemoteRelation.isRemoteRelation(rel) ? rel.remoteKey : undefined
    }).map(([i]) => i)
    if(!stripKeys.length) {
      return
    }
    for(const item of items) {
      for(const i of stripKeys) {
        item[i] = undefined
      }
    }
  }
}