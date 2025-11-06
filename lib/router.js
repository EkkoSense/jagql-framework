'use strict'
const express = require('express')
/**
 * @type {express.Express}
 */
let app
/**
 * @type {import("http").Server | import("https").Server | null | undefined}
 */
let server
const cookieParser = require('cookie-parser')
const debug = require('./debugging.js')
const responseHelper = require('./responseHelper.js')
const metrics = require('./metrics.js')
const urlTools = require("./urlTools.js")
const jsonApiResources = require('./jsonApiResources.js')
const jsonApiConfig = require('./jsonApiConfig.js')
const { Promisify } = require('./promisify.js')
const { JsonApiError } = require('./errorHandlers/JsonApiError.js')

/**
 * @typedef {import('../types/JsonApiRequest.js').JsonApiRequest} JsonApiRequest
 */

module.exports = class router {
    /**
     * @type {(req: Request) => Promise<void>}
     */
    static #authFunction

    /**
     *
     * @param {string} localUrlPath
     * @returns
     */
    static #getExternalUrl(localUrlPath) {
        /**
         * @type {string}
         */
        let urlBase
        /**
         * @type {string}
         */
        let relativePath
        const urlPrefixAlias = jsonApiConfig.urlPrefixAlias
        if (urlPrefixAlias) {
            urlBase = urlPrefixAlias.replace(/\/$/, ""),
            relativePath = localUrlPath.replace(jsonApiConfig.base, "/")
        } else {
            urlBase = urlTools.concatenateUrlPrefix(jsonApiConfig),
            relativePath = localUrlPath
        }
        return new URL(relativePath.replace(/^\/+/, ""), urlBase).toString()
    }

    static applyMiddleware() {
        app = app || jsonApiConfig.router || express()
        app.use((req, res, next) => {
            if(res.headersSent) {
                next()
                return
            }
            res.set({
                'Content-Type': 'application/vnd.api+json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '',
                'Cache-Control': 'private, must-revalidate, max-age=0',
                'Expires': 'Thu, 01 Jan 1970 00:00:00'
            })

            if (req.method === 'OPTIONS') {
                return res.status(204).end()
            }

            return next()
        })

        app.use((req, res, next) => {
            if(res.headersSent) {
                next()
                return
            }
            if (!req.headers['content-type'] && !req.headers.accept) return next()

            if (req.headers['content-type']) {
                // 415 Unsupported Media Type
                if (req.headers['content-type'].match(/^application\/vnd\.api\+json;.+$/)) {
                    return res.status(415).end(`HTTP 415 Unsupported Media Type - [${req.headers['content-type']}]`)
                }

                // Convert "application/vnd.api+json" content type to "application/json".
                // This enables the express body parser to correctly parse the JSON payload.
                if (req.headers['content-type'].match(/^application\/vnd\.api\+json$/)) {
                    req.headers['content-type'] = 'application/json'
                }
            }

            if (req.headers.accept) {
                // 406 Not Acceptable
                const acceptTypes = req.headers.accept.split(/, ?/)
                const matchingTypes = acceptTypes.filter(mediaType => // Accept application/*, */vnd.api+json, */* and the correct JSON:API type.
                    mediaType.match(/^(\*|application)\/(\*|json|vnd\.api\+json)$/) || mediaType.match(/\*\/\*/))

                if (matchingTypes.length === 0) {
                    return res.status(406).end()
                }
            }

            return next()
        })

        app.use(express.json(jsonApiConfig.bodyParserJsonOpts))
        app.use(express.urlencoded({ extended: true }))
        app.use(cookieParser())
        if (!jsonApiConfig.router) {
            app.disable('x-powered-by')
            app.disable('etag')
        }

        let requestId = 0
        app.route('*').all((req, res, next) => {
            debug.requestCounter(requestId++, req.method, req.url)
            if (requestId > 1000) requestId = 0
            next()
        })
    }

    static listen(port, cb) {
        if (!server) {
            if (jsonApiConfig.protocol === 'https') {
                server = require('https').createServer(jsonApiConfig.tls || {}, app)
            } else {
                server = require('http').createServer(app)
            }
            server.listen(port, cb)
        }
    }

    /**
     * Returns the component after the base path in `path`; ie, the subpath.
     *
     * In extreme cases, if the base path is not in the supplied path, returns
     * "".
     *
     * This is compatible with path + query + fragment.
     *
     * @param {string} path
     * @returns
     */
    static stripBasePath(path) {
        if (path[0] !== '/') path = `/${path}`
        const basePath = jsonApiConfig.base
        const i = path.indexOf(basePath)
        if (i == -1) {
            // Compat - this strips to "" if the base is not actually in the
            // path
            console.warn("Request path does not contain JSON:API path")
            return ""
        }
        return path.substring(i + basePath.length)
    }

    static close() {
        if (server) {
            server.close()
            server = null
        }
    }

    /**
     *
     */
    static routes = {}
    /**
     * Binds to the Express-like service. This will prepend the base path.
     *
     * @param {{verb: string, path: string}} config
     * @param {<R>(req: JsonApiRequest, resourceConfig: import("../types/ResourceConfig.js").ResourceConfig<R>, res: any) => *} handler
     */
    static bindRoute(config, handler) {
        const path = jsonApiConfig.base + config.path
        const verb = config.verb.toLowerCase()

        /**
         *
         * @param {express.Request} req
         * @param {express.Response} res
         * @param {(err?: any) => any} next
         */
        const routeHandler = async (req, res, next) => {
            if(res.headersSent) {
                // Presume we're already done
                next()
                return
            }
            const request = this.#getParams(req, res)
            const resourceConfig = jsonApiResources[request.params.type]
            request.resourceConfig = resourceConfig
            res._request = request
            res._startDate = new Date()
            await this.#authenticate(request, res)
            try {
                await handler(request, resourceConfig, res)
            } catch (e) {
                return next(e)
            }
            // next() // TODO Not used - this would otherwise trigger 404
        }
        this.routes[verb] = this.routes[verb] || {}
        this.routes[verb][config.path] = routeHandler
        app[verb](path, routeHandler)
    }

    /**
     *
     * @param {JsonApiRequest} request
     * @param {express.Response} res
     * @returns
     */
    static async #authenticate(request, res) {
        if (!this.#authFunction) return

        try {
            await this.#authFunction(request)
        } catch (err) {
            const payload = responseHelper.generateError(request, new JsonApiError({
                status: 401,
                code: 'UNAUTHORIZED',
                title: 'Authentication Failed',
                detail: err || 'You are not authorised to access this resource.'
            }))
            res.status(401).end(Buffer.from(JSON.stringify(payload)))
            throw err
        }
    }

    /**
     *
     * @param {(req: Request, cb: () => void) => void} authFunction
     */
    static authenticateWithCallback(authFunction) {
        this.#authFunction = Promisify.promisifyFunction(authFunction)
    }

    /**
     *
     * @param {(req: Request) => Promise<void>} authFunction
     */
    static authenticateWithPromise(authFunction) {
        this.#authFunction = authFunction
    }

    /**
     *
     * @param {(request: express.Request, res: express.Response) => any} handler
     */
    static bindNotFound(handler) {
        app.use((req, res) => {
            if(res.headersSent) {
                return
            }
            const request = this.#getParams(req, res)
            return handler(request, res)
        })
    }

    /**
     *
     * @param {(request: express.Request, res: express.Response, errorState:
     * JsonApiError | JsonApiError[] | any, next: (err?: any) => *) => any} handler
     */
    static bindErrorHandler(handler) {
        app.use((error, req, res, next) => {
            const request = this.#getParams(req, res)
            return handler(request, res, error, next)
        })
    }

    /**
     *
     * @param {import("express").Request} req
     * @param {import("express").Response} res
     * @returns {JsonApiRequest}
     */
    static #getParams(req, res) {
        const [path, query] = this.stripBasePath(req.url).split("?")

        const headersToRemove = [
            'host', 'connection', 'accept-encoding', 'accept-language', 'content-length'
        ]

        const combined = this.#getExternalUrl(req.url)

        const safeHeaders = { ...req.headers }
        for (const header of headersToRemove) {
            delete safeHeaders[header]
        }

        return {
            params: { ...req.params, ...req.body, ...req.query },
            headers: req.headers,
            safeHeaders,
            cookies: req.cookies,
            originalUrl: req.originalUrl,
            // expose original express req and res objects in case customer handlers need them for any reason.
            // can be useful when custom handlers rely on custom and/or third party express middleware that
            // modifies/augments the express req or res (e.g. res.locals) for things like authentication, authorization,
            // data connection pool management, etc.
            express: { req, res },
            route: {
                verb: req.method,
                host: req.headers.host,
                base: jsonApiConfig.base,
                path: path || "",
                query: query || "",
                combined
            }
        }
    }

    static sendResponse(res, payload, httpCode) {
        const timeDiff = (new Date()) - res._startDate
        metrics.processResponse(res._request, httpCode, payload, timeDiff)
        res.status(httpCode).end(Buffer.from(JSON.stringify(payload)))
    }

    static getExpressServer() {
        app = app || jsonApiConfig.router || express()
        return app
    }
}

