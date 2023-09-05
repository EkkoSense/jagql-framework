'use strict'

const assert = require('assert')
const helpers = require('./helpers.js')
const jsonApiTestServer = require('../example/server.js')

const Lokka = require('lokka').Lokka
const Transport = require('lokka-transport-http').Transport
const client = new Lokka({
  transport: new Transport('http://localhost:16999/rest/')
})

describe('Testing jsonapi-server', () => {
  describe('polymorphic relationships', () => {
    it('including the tuple', done => {
      const url = 'http://localhost:16999/rest/tuples?include=media'
      helpers.request({
        method: 'GET',
        url
      }, (err, res, json) => {
        assert.strictEqual(err, null)
        json = helpers.validateJson(json)

        assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
        assert.strictEqual(json.data.length, 2, 'Should be 2 main resources')
        assert.strictEqual(json.included.length, 4, 'Should be 4 included resources')

        done()
      })
    })

    context('including through the tuple', () => {
      it('including the first half', done => {
        const url = 'http://localhost:16999/rest/tuples?include=media.photographer'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 6, 'Should be no included resources')

          const markExists = json.included.filter(resource => {
            return resource.attributes.firstname === 'Mark'
          })
          assert.ok(markExists, 'Mark should be included as a photographer')

          done()
        })
      })

      it('including the second half', done => {
        const url = 'http://localhost:16999/rest/tuples?include=media.author'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 6, 'Should be no included resources')

          const pedroExists = json.included.filter(resource => {
            return resource.attributes.firstname === 'Pedro'
          })
          assert.ok(pedroExists, 'Pedro should be included as an author')

          done()
        })
      })

      it('including both', done => {
        const url = 'http://localhost:16999/rest/tuples?include=media.photographer,media.author'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 7, 'Should be no included resources')

          const markExists = json.included.filter(resource => {
            return resource.attributes.firstname === 'Mark'
          })
          assert.ok(markExists, 'Mark should be included as a photographer')

          const pedroExists = json.included.filter(resource => {
            return resource.attributes.firstname === 'Pedro'
          })
          assert.ok(pedroExists, 'Pedro should be included as an author')

          done()
        })
      })
    })
  })

  before(() => {
    jsonApiTestServer.start()
  })
  after(() => {
    jsonApiTestServer.close()
  })
})
