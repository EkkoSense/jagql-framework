/**
 * @module @jagql/framework
 */

/// <reference types="express" />

import { Application, Request, Router } from 'express'
import * as H from './CallbackHandler'
import { Metrics } from './metrics'
import * as RC from './ResourceConfig'
import { ResourceConfig } from './ResourceConfig'
import OurJoi = require('./ourJoi')
import ChainCallbackHandlerType = require('./ChainCallbackHandler')
import MemoryHandlerType = require('./MemoryCallbackHandler')

export import ResourceConfig = RC.ResourceConfig

export type JsonApiProtocols = 'http' | 'https'
export import CallbackHandler = H.CallbackHandler
/**
 * @deprecated use CallbackHandler
 */
export import Handler = H.CallbackHandler
export import BaseType = RC.BaseType
import ChainPromiseHandler from "../lib/handlers/ChainPromiseHandler"
import MemoryPromiseHandler from "./MemoryPromiseHandler"
import { JsonApiRequest } from "./JsonApiRequest"

export interface ApiConfig {
  graphiql?: boolean
  /**
   * If set, the external URL base may be supplied in the given header. This
   * overrides the local configuration if present.
   */
  inferExternalUrlFromHeader?: string
  jsonapi?: boolean
  /**
   * Used to determine which kind of service to start, as well as for URL
   * construction if urlPrefixAlias is unset.
   */
  protocol: JsonApiProtocols
  /**
   * If set, this sets the external view of the URL, as may be used if this
   * service runs through a proxy. If not supplied, that's equivalent to
   * supplying `${protocol}://${hostname}:${port}/${base}`. For historical
   * reasons, this value must end with the `base` value.
   */
  urlPrefixAlias?: string
  /**
   * Used for URL construction if urlPrefixAlias is unset.
   */
  hostname: string
  /**
   * Used to launch the service, if you don't provide your own router, as well
   * as for URL construction if urlPrefixAlias is unset.
   */
  port: number
  /**
   * No leading / required. This is the base path for the service. Used for
   * internal routing, external route binding; for URL construction where
   * urlPrefixAlias is unset; and included in route advice to handlers.
   *
   * The internal version will always have a leading and trailing "/".
   */
  base: string,
  meta: any
  swagger?: any
  router?: Router
  bodyParserJsonOpts?: any
}

/**
 *
 */
export interface DefineOptions {
  idRequired: boolean
}

/**
 * Our modified Joi instance
 */
export const Joi: typeof OurJoi.Joi

/**
 * Configure things like -
 *  - http/https
 *  - host, port
 *  - enable/disable swagger
 *
 * @param {ApiConfig} apiConfig
 */
export function setConfig(apiConfig: ApiConfig): void

/**
 * [[include:resources.md]]
 * @param {ResourceConfig<T>} resConfig
 * @param {DefineOptions} [options]
 */
export function define<T>(resConfig: ResourceConfig<T>, options?: DefineOptions): void
export function authenticate(authenticator: (req: JsonApiRequest, cb: () => void) => void): void

/**
 * Application metrics are generated and exposed via an event emitter interface.
 * Whenever a request has been processed and it about to be returned to the customer,
 * a `data` event will be emitted:
 *
 * ```javascript
 * jsonApi.metrics.on("data", function(data) {
 *   // send data to your metrics stack
 * });
 * ```
 */
export const metrics: Metrics
export function getExpressServer(): Application
/**
 * @deprecated use CallbackHandlers.Chain
 */
export const ChainHandler: typeof ChainCallbackHandlerType
export const CallbackHandlers: {
  Chain: typeof ChainCallbackHandlerType
  Memory: typeof MemoryHandlerType
}
export const PromiseHandlers: {
  Chain: typeof ChainPromiseHandler
  Memory: typeof MemoryPromiseHandler
}
/**
 * @deprecated use CallbackHandlers.Memory
 */
export const MemoryHandler: typeof MemoryHandlerType
export function onUncaughtException(err: Error): void
export function start(callback: Function): void
export function close(): void
export function getSchemaSettings(schema: Schema): OurJoi.OurJoiSettings | undefined
export function getToManyRelationsFor(ResourceConfig: ResourceConfig): Iterable<string>
export const knownResources: string[]
export * from "./JsonApiRequest"