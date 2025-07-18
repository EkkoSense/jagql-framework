'use strict'

const server = module.exports = { }

const jsonApi = require('../lib/jsonApi')
const fs = require('fs')
const path = require('path')
const debug = require('debug')

jsonApi.setConfig({
  graphiql: true,
  swagger: {
    title: 'Example JSON:API Server',
    version: '0.1.1',
    description: 'This is the API description block that shows up in the swagger.json',
    termsOfService: 'http://example.com/termsOfService',
    contact: {
      name: 'API Contact',
      email: 'apicontact@holidayextras.com',
      url: 'docs.hapi.holidayextras.com'
    },
    license: {
      name: 'MIT',
      url: 'http://opensource.org/licenses/MIT'
    },
    security: [
      {
        'APIKeyHeader': []
      }
    ],
    securityDefinitions: {
      APIKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Auth'
      }
    }
  },
  protocol: 'http',
  hostname: 'localhost',
  port: 16999,
  base: 'rest',
  meta: {
    description: 'This block shows up in the root node of every payload'
  }
})

jsonApi.authenticate((request, callback) => {
  // If a "blockMe" header is provided, block access.
  if (request.headers.blockme) return callback(new Error('Fail'))

  // If a "blockMe" cookie is provided, block access.
  if (request.cookies.blockMe) return callback(new Error('Fail'))

  return callback()
})

fs.readdirSync(path.join(__dirname, '/resources')).filter(filename => /^[a-z].*\.js$/.test(filename)).map(filename => path.join(__dirname, '/resources/', filename)).forEach(require)

jsonApi.onUncaughtException((request, error) => {
  const errorDetails = error.stack.split('\n')
  const currentError = errorDetails.shift()
  console.error(JSON.stringify({
    request: Object.fromEntries(Object.entries(request).filter(([k, v]) => typeof v !== 'object')),
    error: currentError,
    stack: errorDetails
  }))
})

jsonApi.metrics.on('data', data => {
  debug('metrics')(data)
})

// If we're using the example server for the test suite,
// wait for the tests to call .start();
if (typeof describe === 'undefined') {
  jsonApi.start(() => {
    console.log('Server running on http://localhost:16999')
  })
}
server.start = jsonApi.start
server.close = jsonApi.close
server.getExpressServer = jsonApi.getExpressServer
