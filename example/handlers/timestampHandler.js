'use strict'

const jsonApi = require('../..')

class TimestampHandler extends jsonApi.ChainHandler {
  beforeSearch(request, callback) {
    console.log('Before Search 2')
    return callback(null, request)
  }

  afterSearch(request, results, pagination, callback) {
    console.log('After Search 2')
    return callback(null, results, pagination)
  }

  beforeInitialise(resourceConfig) {
    console.log('Before Initialise 1', resourceConfig.resource)
  }
}

module.exports = new jsonApi.ChainHandler()
