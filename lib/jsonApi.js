'use strict'

const jsonApiConfig = require("./jsonApiConfig.js")
const jsonApiResources = require("./jsonApiResources.js")
const jsonApiErrHandler = require("./jsonApiErrHandler.js")
const ourJoi = require('./ourJoi.js')
const router = require('./router.js')
const responseHelper = require('./responseHelper.js')
const handlerEnforcer = require('./handlerEnforcer.js')
const pagination = require('./pagination.js')
const routes = require('./routes')
const metrics = require('./metrics.js')
const schemaValidator = require('./schemaValidator.js')
const version = require(require('path').join(__dirname, '../package.json')).version
const MemoryChallbackHandler = require("./handlers/MemoryCallbackHandler.js")
const ChainCallbackHandler = require('./handlers/ChainCallbackHandler.js')
const urlTools = require("./urlTools.js")
const errorHandlers = require("./errorHandlers/index.js")
const initialRoutes = require("./initialRoutes/index.js")
const JoiCompat = require("./JoiCompat.js")
const Relation = require("./Relation.js")
const RemoteRelation = require("./RemoteRelation.js")
const Attribute = require("./Attribute.js")
const ChainPromiseHandler = require("./handlers/ChainPromiseHandler.js")
const MemoryPromiseHandler = require("./handlers/MemoryPromiseHandler.js")
const promisifyHandler = require("./promisifyHandler.js")

/**
 * Ensures that `base` starts and ends with "/".
 *
 * @param {string} base
 * @returns
 */
const cleanBaseUrl = (base) => {
  if (!base) {
    base = ''
  }
  if (base[0] !== '/') {
    base = `/${base}`
  }
  if (base[base.length - 1] !== '/') {
    base += '/'
  }
  return base
}

module.exports = class jsonApi {
  /**
   * @type {Record<string, import("../types/ResourceConfig.js").ResourceConfig<any>>}
   */
  static #resources = jsonApiResources
  /**
   * @type {import('../types/jsonApi').ApiConfig}
   */
  static #apiConfig = jsonApiConfig
  /**
   *
   */
  static #errHandler = jsonApiErrHandler
  static onUncaughtException(errHandler) {
    this.#errHandler.handler = errHandler.bind(this)
  }

  static _version = version

  static Joi = ourJoi.Joi
  static metrics = metrics.emitter
  /**
   * @deprecated use CallbackHandlers.Memory
   */
  static MemoryHandler = MemoryChallbackHandler
  /**
   * @deprecated use CallbackHandlers.Chain
   */
  static ChainHandler = ChainCallbackHandler

  /**
   * @readonly
   */
  static CallbackHandlers = Object.freeze({
    Chain: ChainCallbackHandler,
    Memory: MemoryChallbackHandler,
  })

  /**
   * @readonly
   */
  static PromiseHandlers = Object.freeze({
    Chain: ChainPromiseHandler,
    Memory: MemoryPromiseHandler
  })

  /**
   *
   */
  static get knownResources() {
    return Object.keys(this.#resources)
  }

  /**
   *
   * @param {import("../types/ResourceConfig.js").ResourceConfig} resourceConfig
   * @returns
   */
  static *getToManyRelationsFor(resourceConfig) {
    for(const [name, rel] of Relation.getAllRelations(resourceConfig)) {
      if(rel.count == "many") {
        yield name
      }
    }
  }

  /**
   *
   * @param {import('../types/jsonApi').ApiConfig} apiConfig
   */
  static setConfig(apiConfig) {
    for(const k in this.#apiConfig) {
      delete this.#apiConfig[k]
    }
    Object.assign(this.#apiConfig, apiConfig)
    this.#apiConfig.base = cleanBaseUrl(this.#apiConfig.base)
    // This is used for both local routing and for advisory links in the
    // response. Despite the name, it's not a path - it's a base URL, and
    // strictly speaking, it's the external one.
    this.#apiConfig.pathPrefix = apiConfig.urlPrefixAlias ||
      urlTools.concatenateUrlPrefix(this.#apiConfig, true)
    responseHelper.setBaseUrl(this.#apiConfig.pathPrefix)
    responseHelper.setMetadata(this.#apiConfig.meta)
  }

  /**
   * @deprecated please use authenticateWithCallback
   * @type {import("../types/jsonApi.js").authenticate}
   */
  static authenticate = router.authenticateWithCallback.bind(router)
  /**
   * @type {import("../types/jsonApi.js").authenticate}
   */
  static authenticateWithCallback = router.authenticateWithCallback.bind(router)
  /**
   * @type {import("../types/jsonApi.js").authenticate}
   */
  static authenticateWithPromise = router.authenticateWithPromise.bind(router)

  /**
   * This should be called once per resource, once per service instance.
   *
   * @type {import("../types/jsonApi").define}
   */
  static define(resourceConfig, options) {
    if (!resourceConfig.resource.match(/^[A-Za-z0-9_]*$/)) {
      throw new Error(`Resource '${resourceConfig.resource}' contains illegal characters!`)
    }
    resourceConfig.namespace = resourceConfig.namespace || 'default'
    resourceConfig.searchParams = resourceConfig.searchParams || { }
    resourceConfig.actions ??= {}
    this.#resources[resourceConfig.resource] = resourceConfig

    handlerEnforcer.wrap(promisifyHandler.for(resourceConfig.handlers))

    resourceConfig.handlers.initialise = resourceConfig.handlers.initialise || resourceConfig.handlers.initialize
    if (resourceConfig.handlers.initialise) {
      resourceConfig.handlers.initialise(resourceConfig)
    }

    for(const attribute of Object.keys(resourceConfig.attributes)) {
      if (!attribute.match(/^[A-Za-z0-9_]*$/)) {
        throw new Error(`Attribute '${attribute}' on ${resourceConfig.resource} contains illegal characters!`)
      }
    }
    for(const action in resourceConfig.actions) {
      if (!action.match(/^[A-Za-z0-9_]*$/)) {
        throw new Error(`Attribute '${action}' on ${resourceConfig.resource} contains illegal characters!`)
      }
    }

    resourceConfig.searchParams = {
      type: ourJoi.Joi.any().required().valid(resourceConfig.resource)
        .description(`Always "${resourceConfig.resource}"`)
        .example(resourceConfig.resource),
      sort: ourJoi.Joi.any()
        .description('An attribute to sort by')
        .example('title'),
      filter: ourJoi.Joi.any()
        .description('An attribute+value to filter by')
        .example('title'),
      fields: ourJoi.Joi.any()
        .description('An attribute+value to filter by')
        .example('title'),
      include: ourJoi.Joi.any()
        .description('An attribute to include')
        .example('title'),
      ...resourceConfig.searchParams,
      ...pagination.joiPageDefinition
    }

    const idType = ourJoi.Joi.string()
    const idTypeSpec = (options?.idRequired === false) ? idType.optional() :
      idType.required()

    resourceConfig.attributes = {
      id: idTypeSpec
        .description('Unique resource identifier')
        .example('1234'),
      type: ourJoi.Joi.string().required().valid(resourceConfig.resource)
        .description(`Always "${resourceConfig.resource}"`)
        .example(resourceConfig.resource),
      meta: ourJoi.Joi.object().optional(),
      ...resourceConfig.attributes,
    }

    resourceConfig.onCreate = Object.fromEntries(
      Object.keys(resourceConfig.attributes).filter(
        i => {
          const rel = Relation.getRelation(resourceConfig, i)
          if(rel) {
            return !RemoteRelation.isRemoteRelation(rel)
          }
          /**
           * @type {import('joi').Schema}
           */
          const schema = Attribute.getAttribute(resourceConfig, i)
          const describe = schema.describe()
          return !describe.metas?.includes("readonly")
      }).map(k => {
        const rel = Relation.getRelation(resourceConfig, k)
        if(rel) {
          return [k, rel.schema]
        }
        return [k, Attribute.getAttribute(resourceConfig, k)]
      })
    )
  }

  static getExpressServer = () => router.getExpressServer()

  static getSchemaSettings = JoiCompat.getSettings.bind(JoiCompat)

  static #startInner(cb) {
    schemaValidator.validateAllResourceConfigs(this.#resources)
    router.applyMiddleware()
    initialRoutes.register()
    routes.register()
    errorHandlers.register()
    if (!this.#apiConfig.router) {
      router.listen(this.#apiConfig.port, cb)
    }
  }

  static #closeInner() {
    router.close()
    metrics.emitter.removeAllListeners('data')
    for (const i in this.#resources) {
      const resourceConfig = this.#resources[i]
      if (resourceConfig.handlers.close) resourceConfig.handlers.close()
    }
  }

  static start = cb => this.#startInner(cb)

  static close = () => this.#closeInner()
}