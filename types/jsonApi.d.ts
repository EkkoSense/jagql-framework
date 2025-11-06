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
  jsonapi?: boolean
  protocol: JsonApiProtocols
  urlPrefixAlias?: string
  hostname: string
  port: number
  /**
   * No leading / required
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