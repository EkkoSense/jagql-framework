'use strict'

const request = require('./request')
const assert = require('assert')
const helpers = require('./helpers.js')
const jsonApiTestServer = require('../example/server.js')

describe('Testing jsonapi-server', () => {
  describe('Deleting a resource', () => {
    it('errors with invalid type', done => {
      const data = {
        method: 'delete',
        url: 'http://localhost:16999/rest/foobar/someId'
      }
      request(data, (err, res, json) => {
        assert.strictEqual(err, null)
        helpers.validateError(json)
        assert.strictEqual(res.statusCode, 404, 'Expecting 404')

        done()
      }).catch(done)
    })

    it('errors with invalid id', done => {
      const data = {
        method: 'delete',
        url: 'http://localhost:16999/rest/comments/foobar'
      }
      request(data, (err, res, json) => {
        assert.strictEqual(err, null)
        helpers.validateError(json)
        assert.strictEqual(res.statusCode, 404, 'Expecting 404')

        done()
      }).catch(done)
    })

    describe('deleting a comment', () => {
      it('deletes the resource', done => {
        const data = {
          method: 'delete',
          url: 'http://localhost:16999/rest/comments/6b017640-827c-4d50-8dcc-79d766abb408'
        }
        request(data, (err, res, json) => {
          assert.strictEqual(err, null)
          json = JSON.parse(json)
          const keys = Object.keys(json)
          assert.deepEqual(keys, [ 'meta' ], 'Should only have a meta block')
          assert.strictEqual(res.statusCode, 200, 'Expecting 200')

          done()
        }).catch(done)
      })

      it('new resource is gone', done => {
        const url = 'http://localhost:16999/rest/comments/6b017640-827c-4d50-8dcc-79d766abb408'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          helpers.validateError(json)
          assert.strictEqual(res.statusCode, 404, 'Expecting 404')

          done()
        }).catch(done)
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
