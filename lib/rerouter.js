'use strict'
const rerouter = module.exports = { }

const router = require('./router.js')
const debug = require('./debugging.js')
const jsonApi = require('./jsonApi.js')
const url = require('qs')
const _ = {
  assign: require('lodash.assign'),
  omit: require('lodash.omit')
}

rerouter.route = (newRequest, callback) => {
  const validRoutes = router._routes[newRequest.method.toLowerCase()]

  const path = rerouter._generateSanePath(newRequest)
  const route = rerouter._pickFirstMatchingRoute(validRoutes, path)

  const urlParams = url.parse(newRequest.uri.split('?')[1] || { })

  const req = {
    url: newRequest.uri,
    originalUrl: newRequest.originalRequest.originalUrl,
    headers: newRequest.originalRequest.headers,
    cookies: newRequest.originalRequest.cookies,
    params: {
      ...rerouter._mergeParams(urlParams, newRequest.params),
      page: newRequest.params?.page ?? urlParams.page,
    },
  }
  rerouter._extendUrlParamsOntoReq(route, path, req)

  debug.reroute('Request', route, JSON.stringify(req))

  const res = {
    set () { },
    status (httpCode) {
      res.httpCode = httpCode
      return res
    },
    end (payload) {
      const err = null
      if (res.httpCode >= 400) {
        debug.reroute('Error', payload.toString())
        return callback(JSON.parse(payload.toString()))
      }
      if (newRequest.method !== 'GET') {
        debug.reroute('Response', payload.toString())
      }
      const json = JSON.parse(payload.toString())
      return callback(err, json)
    }
  }
  validRoutes[route](req, res, _.omit(newRequest.originalRequest, [ 'params', 'route' ]))
}

rerouter._generateSanePath = newRequest => {
  let path = newRequest.uri
  if (path.match(/^https?:\/\//)) {
    path = path.split('/').slice(3).join('/')
  }
  if (jsonApi._apiConfig.base !== '/') {
    if (path[0] !== '/') path = `/${path}`
    path = path.split(jsonApi._apiConfig.base)
    path.shift()
    path = path.join(jsonApi._apiConfig.base)
  }
  path = path.replace(/^\//, '').split('?')[0].replace(/\/$/, '')
  return path
}

rerouter._pickFirstMatchingRoute = (validRoutes, path) => Object.keys(validRoutes).filter(someRoute => {
  someRoute = someRoute.replace(/(:[a-z]+)/g, '[^/]*?')
  someRoute = new RegExp(`^${someRoute}$`)
  return someRoute.test(path)
}).pop()

rerouter._extendUrlParamsOntoReq = (route, path, req) => {
  route.split('/').forEach((urlPart, i) => {
    if (urlPart[0] !== ':') return
    req.params[urlPart.substring(1)] = path.split('/')[i]
  })
}

rerouter._mergeParams = (objA, objB) => {
  if (!objB) return objA
  return {
    ...objA,
    ...objB,
    ...Object.fromEntries(
      Object.entries(objA).filter(([k]) => k in objB).map(([k, valueA]) => {
        const valueB = objB[k]
        if (!valueB) {
          return [k, valueA]
        } else {
          if ((typeof valueA === 'string') || (typeof valueB === 'string')) {
            return [k, [ valueA, valueB ]]
          } else {
            return [k, rerouter._mergeParams(valueA, valueB)]
          }
        }
      })
    )
  }
}
