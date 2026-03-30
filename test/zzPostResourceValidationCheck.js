'use strict'

const assert = require('assert')
const helpers = require('./helpers.js')
const jsonApiTestServer = require('../example/server.js')

describe('Testing jsonapi-server (post)', () => {
  for(const resource of [ { name: 'articles', count: 4 },
    { name: 'comments', count: 2 },
    { name: 'people', count: 5 },
    { name: 'photos', count: 50 }, // Note page limit
    { name: 'tags', count: 5 }
  ]) {
    describe(`Searching for ${resource.name}`, () => {
      it(`should find ${resource.count}`, async () => {
        const url = `http://localhost:16999/rest/${resource.name}`
        const {err, json} = await helpers.requestAsync({
          method: 'GET',
          url
        })
        assert.strictEqual(err, null)
        const data = helpers.validateJson(json)
        assert.strictEqual(data.data.length, resource.count, `Expected ${resource.count} resources`)
      })
    })
  }

  before(() => {
    jsonApiTestServer.start()
  })
  after(() => {
    jsonApiTestServer.close()
  })
})
