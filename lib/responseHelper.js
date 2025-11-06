'use strict'
const pagination = require('./pagination.js')
const Joi = require('joi')
const debug = require('./debugging.js')
const tools = require('./tools.js')
const Relation = require('./Relation.js')
const RemoteRelation = require('./RemoteRelation.js')
const Prop = require('./Prop.js')
const { JsonApiError } = require('./errorHandlers/JsonApiError.js')

/**
 * @typedef {import('../types/JsonApiRequest.js').JsonApiRequest} JsonApiRequest
 */

/**
 * @template {any} T
 * @param {T} item
 * @param {import('../types/ResourceConfig').ResourceConfig<T>} resourceConfig
 * @returns {Promise<T>}
 */
async function loadPromises (item, resourceConfig) {
  const itemOut = {}
  for (const k in resourceConfig.attributes) {
    const v = item[k]
    if (tools.isPromise(v)) {
      itemOut[k] = await v
    } else {
      itemOut[k] = v
    }
  }
  return itemOut
}

/**
 *
 */
module.exports = class responseHelper {
  /**
   * @type {string} The base URL, strictly for the advisory links in the
   * response.
   */
  static #baseUrl
  static #metadata

  /**
   * Called once per validated object
   *
   * @param {*} item
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   */
  static #convertId(item, resourceConfig) {
    if (item.id) {
      item.id = '' + item.id
    }
    for(const p of this.#getLinkProperties(resourceConfig)) {
      const v = item[p]
      if(!v) continue
      if(Array.isArray(v)) {
        item[p] = v.map(vi => ({id: '' + vi.id, type: vi.type, meta: vi.meta}))
      } else {
        item[p] = {id: '' + v.id, type: v.type, meta: v.meta}
      }
    }
  }

  /**
   * Called 1-2 times for every datum produced by a request
   *
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @returns
   */
  static #getLinkProperties(resourceConfig) {
    return Relation.getAllRelations(resourceConfig).map(([k]) => k)
  }

  /**
   * Set the base URL, strictly for the advisory links in the
   * response.
   *
   * @param {string} baseUrl
   */
  static setBaseUrl(baseUrl) {
    this.#baseUrl = baseUrl
  }

  static setMetadata(meta) {
    this.#metadata = meta
  }

  /**
   * Called for search endpoints (once per request)
   *
   * Checks output data against the schema
   *
   * @template R
   * @param {R[]} items
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {string | null} inferredBaseUrl
   * @returns
   */
  static async checkSchemaOnArray(items, resourceConfig, inferredBaseUrl) {
    const baseUrl = inferredBaseUrl ?? this.#baseUrl
    // Only check the first 10 items, for basic sanity checks
    const checkItems = items.slice(0, 10)

    const compiledSchema = Joi.compile(Prop.getAllSchemas(resourceConfig))
    for (const cItem of checkItems) {
      const item = await loadPromises(cItem, resourceConfig)
      this.#convertId(item, resourceConfig)

      debug.validationOutput(JSON.stringify(item))
      const validationResult = compiledSchema.validate(item)
      if (validationResult.error) {
        debug.validationError(validationResult.error.message,
          JSON.stringify(item))
      }
    }

    // Whatever happens, we return the success response with all items
    return this.#generateDataItems(items, resourceConfig, baseUrl)
  }

  /**
   * Routinely called at the end of single-object requests
   *
   * @param {*} cItem
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {string | null} inferredBaseUrl
   * @returns
   */
  static async checkSchemaOnObject(cItem, resourceConfig, inferredBaseUrl) {
    const baseUrl = inferredBaseUrl ?? this.#baseUrl
    debug.validationOutput(JSON.stringify(cItem))
    const item = await loadPromises(cItem, resourceConfig)
    this.#convertId(item, resourceConfig)
    const compiledSchema = Joi.compile(Prop.getAllSchemas(resourceConfig))
    const validationResult = compiledSchema.validate(item)
    if (validationResult.error) {
      debug.validationError(validationResult.error.message, JSON.stringify(item))
    }

    return this.#generateDataItem(validationResult.value, resourceConfig,
      baseUrl)
  }

  /**
   * Called once per request, generally where a single object is to be created/updated
   *
   * @param {*} cItem
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {string | null} inferredBaseUrl
   * @throws
   * @returns
   */
  static async enforceSchemaOnObject(cItem, resourceConfig, inferredBaseUrl) {
    const baseUrl = inferredBaseUrl ?? this.#baseUrl
    debug.validationOutput(JSON.stringify(cItem))
    const item = await loadPromises(cItem, resourceConfig)
    this.#convertId(item, resourceConfig)
    const compiled = Joi.compile(Prop.getAllSchemas(resourceConfig))
    const validationResult = compiled.validate(item)
    if (validationResult.error) {
      debug.validationError(validationResult.error.message, JSON.stringify(item))
      throw new JsonApiError({
        status: 500,
        code: 'EINVALIDITEM',
        title: 'Item in response does not validate',
        detail: {
          item: item,
          error: validationResult.error.message
        }
      })
    }

    const dataItem = await this.#generateDataItem(validationResult.value,
      resourceConfig, baseUrl)
    return dataItem
  }

  /**
   *
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @returns
   */
  static #getDataItemInfo(resourceConfig) {
    const linkProperties = this.#getLinkProperties(resourceConfig)
    const attributeProperties = Object.keys(resourceConfig.attributes).filter(someProperty => {
      if (someProperty === 'id') return false
      if (someProperty === 'type') return false
      if (someProperty === 'meta') return false
      return !Relation.getRelation(resourceConfig, someProperty)
    })
    return { attributeProperties, linkProperties }
  }

  /**
   * Called once for every datum produced by a request
   *
   * @param {*} item
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {string} baseUrl
   * @returns
   */
  static async #generateDataItem(item, resourceConfig, baseUrl) {
    const { attributeProperties, linkProperties } = responseHelper.#getDataItemInfo(resourceConfig)

    const attributes = Object.fromEntries(
      attributeProperties.filter(p => p in item).map(p => [p, item[p]]))

    const relationships = this.#generateRelationships(item, resourceConfig,
      linkProperties, baseUrl)

    return {
      type: item.type,
      id: '' + item.id,
      attributes,
      links: this.#generateLinks(item, baseUrl),
      relationships: tools.isPromise(relationships) ? await relationships : relationships,
      meta: item.meta
    }
  }

  /**
   * Called once per applicable request
   *
   * @param {*[]} items
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {string} baseUrl
   * @returns {*[] | Promise<*[]>}
   */
  static #generateDataItems(items, resourceConfig, baseUrl) {
    if(!items.length) {
      return []
    }
    const { attributeProperties, linkProperties } = responseHelper.#getDataItemInfo(resourceConfig)

    const results = []
    const promises = []
    for(const item of items) {
      const attributes = Object.fromEntries(
        attributeProperties.map(p => [p, item[p]]))
      const relationships = this.#generateRelationships(item, resourceConfig,
        linkProperties, baseUrl)
      const result = {
        type: item.type,
        id: '' + item.id,
        attributes,
        links: this.#generateLinks(item, baseUrl),
        relationships: {},
        meta: item.meta
      }

      if(tools.isPromise(relationships)) {
        promises.push(relationships.then(r => result.relationships = r))
      } else {
        result.relationships = relationships
      }

      results.push(result)
    }

    if(promises.length) {
      return Promise.all(promises).then(() => results)
    }

    return results
  }

  /**
   *
   * @param {{type: string, id: string}} item
   * @param {string} baseUrl
   * @returns
   */
  static #generateLinks(item, baseUrl) {
    return {
      self: `${baseUrl + item.type}/${item.id}`
    }
  }

  /**
   * Called once for every datum produced by a request
   *
   * @param {*} item
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {*} linkProperties
   * @param {string} baseUrl
   * @returns
   */
  static #generateRelationships(item, resourceConfig, linkProperties, baseUrl) {
    if (linkProperties.length === 0) return undefined

    const links = { }

    const promises = []
    for (const linkProperty of linkProperties) {
      const l = this.#generateLink(item, resourceConfig, linkProperty, baseUrl)
      if(tools.isPromise(l)) {
        promises.push(l.then(a => links[linkProperty] = a))
      } else {
        links[linkProperty] = l
      }
    }

    if(promises.length) {
      return Promise.all(promises).then(() => links)
    }

    return links
  }

  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {*} linkProperty
   * @param {RemoteRelation} rel
   * @param {string} baseUrl
   * @returns
   */
  static async #generateLinkRemote(item, linkProperty, rel, baseUrl) {
    const relatedResource = rel.resources[0]
    return {
      meta: {
        relation: 'foreign',
        belongsTo: relatedResource,
        as: rel.remoteKey,
        many: rel.count == "many",
        readOnly: true
      },
      links: {
        // get information about the linkage - list of ids and types
        // /rest/bookings/relationships/?customer=26aa8a92-2845-4e40-999f-1fa006ec8c63
        self:
          `${baseUrl + relatedResource}/relationships/?${rel.remoteKey}=${item.id}`,
        // get full details of all linked resources
        // /rest/bookings/?filter[customer]=26aa8a92-2845-4e40-999f-1fa006ec8c63
        related:
          `${baseUrl + relatedResource}/?filter[${rel.remoteKey}]=${item.id}`
      },
      // $FlowFixMe: the data property can be either undefined (not present), null or [ ]
      data: item[linkProperty] ? null : undefined
    }
  }


  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {*} linkProperty
   * @param {*} linkItem
   * @param {string} baseUrl
   * @returns
   */
  static async #generateLinkOneInner(item, linkProperty, linkItem, baseUrl) {
    return {
      meta: {
        relation: 'primary',
        // type: rel.resources,
        readOnly: false
      },
      links: {
        self: `${baseUrl + item.type}/${item.id}/relationships/${linkProperty}`,
        related: `${baseUrl + item.type}/${item.id}/${linkProperty}`
      },
      // $FlowFixMe: the data property can be either undefined (not present), null or [ ]
      data: linkItem ? {
        type: linkItem.type,
        id: '' + linkItem.id,
        meta: linkItem.meta
      } : null
    }
  }

  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {*} linkProperty
   * @param {string} baseUrl
   * @returns
   */
  static async #generateLinkOne(item, linkProperty, baseUrl) {
    if(tools.isPromise(item[linkProperty])) {
      return item[linkProperty].then(linkItem => this.#generateLinkOneInner(
        item, linkProperty, linkItem, baseUrl))
    } else {
      return this.#generateLinkOneInner(item, linkProperty, item[linkProperty],
        baseUrl)
    }
  }

  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {*} linkProperty
   * @param {*} linkItemOrItems
   * @param {string} baseUrl
   * @returns
   */
  static async #generateLinkManyInner(item, linkProperty, linkItemOrItems,
    baseUrl
  ) {
    return {
      meta: {
        relation: 'primary',
        // type: rel.resources,
        readOnly: false
      },
      links: {
        self: `${baseUrl + item.type}/${item.id}/relationships/${linkProperty}`,
        related: `${baseUrl + item.type}/${item.id}/${linkProperty}`
      },
      // $FlowFixMe: the data property can be either undefined (not present), null or [ ]
      data: linkItemOrItems ?
        tools.ensureArrayNotNullish(linkItemOrItems).map(linkItem => ({
        type: linkItem.type,
        id: '' + linkItem.id,
        meta: linkItem.meta
      })) : [],
    }
  }

  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {*} linkProperty
   * @param {string} baseUrl
   * @returns
   */
  static async #generateLinkMany(item, linkProperty, baseUrl) {
    if(tools.isPromise(item[linkProperty])) {
      return item[linkProperty].then(
        linkItemOrItems => this.#generateLinkManyInner(item, linkProperty,
          linkItemOrItems, baseUrl))
    } else {
      return this.#generateLinkManyInner(item, linkProperty,
        item[linkProperty], baseUrl)
    }
  }

  /**
   * Called once for every datum-relationship generated in a request
   *
   * @param {*} item
   * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
   * @param {*} linkProperty
   * @param {string} baseUrl
   * @returns
   */
  static #generateLink(item, resourceConfig, linkProperty, baseUrl) {
    const rel = Relation.getRelation(resourceConfig, linkProperty)

    if (RemoteRelation.isRemoteRelation(rel)) {
      return this.#generateLinkRemote(item, linkProperty, rel, baseUrl)
    }

    if (rel.count == "one") {
      return this.#generateLinkOne(item, linkProperty, baseUrl)
    }

    if (rel.count == "many" && item[linkProperty] !== undefined) {
      return this.#generateLinkMany(item, linkProperty, baseUrl)
    }

    return {
      meta: {
        relation: 'primary',
        // type: rel.resources,
        readOnly: false
      },
      links: {
        self: `${baseUrl + item.type}/${item.id}/relationships/${linkProperty}`,
        related: `${baseUrl + item.type}/${item.id}/${linkProperty}`
      },
      data: undefined
    }
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @param {JsonApiError | JsonApiError[]} errOrErrs
   * @returns {import('../types/JsonApiResponse.js').JsonApiResponseBodyErrorWithMeta}
   */
  static generateError(request, errOrErrs) {
    const baseUrl = request.inferredBaseUrl ?? this.#baseUrl
    debug.errors(request.route.verb, request.route.combined, JSON.stringify(errOrErrs))
    const errors = tools.ensureArray(errOrErrs)

    const errorResponse = {
      jsonapi: {
        version: '1.0'
      },
      meta: this.generateMeta(request),
      links: {
        self: baseUrl + request.route.path
      },
      errors,
    }

    return errorResponse
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @param {*} resourceConfig
   * @param {*} sanitisedData
   * @param {*} handlerTotal
   * @returns {import('../types/JsonApiResponse.js').JsonApiResponseBodyWithMeta}
   */
  static generateResponse(request, resourceConfig, sanitisedData, handlerTotal) {
    const baseUrl = request.inferredBaseUrl ?? this.#baseUrl
    return {
      jsonapi: {
        version: '1.0'
      },

      meta: this.generateMeta(request, handlerTotal),

      links: {
        self: baseUrl + request.route.path +
          (request.route.query ? "?" + request.route.query : ""),
        ...pagination.generatePageLinks(request, handlerTotal),
      },

      data: sanitisedData
    }
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @returns
   */
  static #getMetadata(request) {
    if (typeof this.#metadata === 'function') {
      return this.#metadata(request)
    } else {
      return {...this.#metadata}
    }
  }

  /**
   *
   * @param {JsonApiRequest} request
   * @param {*} handlerTotal
   * @returns
   */
  static generateMeta(request, handlerTotal) {
    const meta = this.#getMetadata(request)

    if (handlerTotal) {
      meta.page = pagination.generateMetaSummary(request, handlerTotal)
    }

    return meta
  }
}