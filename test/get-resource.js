'use strict'

const assert = require('assert')
const helpers = require('./helpers.js')
const request = require('./request')
const jsonApiTestServer = require('../example/server.js')


describe('Testing jsonapi-server', () => {
  describe('Searching for resources', () => {
    describe("Load test", () => {
      it("can load 100k objects in acceptable time", async () => {
        const { expect } = await import('chai')
        const start = new Date()
        const {err, res, json} = await helpers.requestAsync({
          method: "GET",
          url: "http://localhost:16999/rest/notes?page[limit]=1000000"
        })
        const finish = new Date()
        const elapsedMs = finish.valueOf() - start.valueOf()
        assert.strictEqual(err, null)
        expect(elapsedMs).to.be.lessThan(500, "Elapsed time is <5us per item")
        const vjson = helpers.validateJson(json)

        assert.strictEqual(res.statusCode, 200, "Expecting 200 OK")
        assert.deepEqual(vjson.included, [ ], "Response should have no included resources")
        assert.strictEqual(vjson.data.length, 100_000, "Response should contain all resources")
      })
    })
    it('unknown resource should error', done => {
      const url = 'http://localhost:16999/rest/foobar'
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

    it('empty search should return all objects', async () => {
      const url = 'http://localhost:16999/rest/articles'
      let {err, res, json} = await helpers.requestAsync({
        method: 'GET',
        url
      })
      assert.strictEqual(err, null)
      json = helpers.validateJson(json)

      assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
      assert.deepEqual(json.included, [ ], 'Response should have no included resources')
      assert.strictEqual(json.data.length, 4, 'Response should contain exactly 4 resources')
      for(const resource of json.data) {
        helpers.validateArticle(resource)
      }
    })

    describe('applying sort', () => {
      it('ASC sort', done => {
        const url = 'http://localhost:16999/rest/articles?sort=title'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 4, 'Response should contain exactly 4 resources')

          const previous = json.data[0]
          let current
          for (let i = 1; i < json.data.length; i++) {
            current = json.data[i]
            assert.ok(previous.attributes.title < current.attributes.title, 'Resources should be ordered')
          }

          done()
        }).catch(done)
      })

      it('DESC sort', done => {
        const url = 'http://localhost:16999/rest/articles?sort=-title'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 4, 'Response should contain exactly 4 resources')

          let previous
          let current
          for (let i = 1; i < json.data.length; i++) {
            previous = json.data[i - 1]
            current = json.data[i]
            assert.ok(previous.attributes.title > current.attributes.title, 'Resources should be ordered')
          }

          done()
        }).catch(done)
      })
    })

    describe('applying filter', () => {
      it('unknown attribute should error', done => {
        const url = 'http://localhost:16999/rest/articles?filter[foobar]=<M'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)
          assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
          const error = json.errors[0]
          assert.strictEqual(error.code, 'EFORBIDDEN')
          assert.strictEqual(error.title, 'Invalid filter')
          done()
        }).catch(done)
      })

      it('unknown multiple attribute should error', done => {
        const url = 'http://localhost:16999/rest/articles?filter[foo]=bar&filter[foo]=baz'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)
          assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
          const error = json.errors[0]
          assert.strictEqual(error.code, 'EFORBIDDEN')
          assert.strictEqual(error.title, 'Invalid filter')
          done()
        }).catch(done)
      })

      it('value of wrong type should error', done => {
        const url = 'http://localhost:16999/rest/photos?filter[raw]=bob'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)
          assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
          const error = json.errors[0]
          assert.strictEqual(error.code, 'EFORBIDDEN')
          assert.strictEqual(error.title, 'Invalid filter')
          assert(error.detail.match("Filter value for key '.*?' is invalid"))
          done()
        }).catch(done)
      })

      it('equality for strings', done => {
        const url = 'http://localhost:16999/rest/articles?filter[title]=How%20to%20AWS'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'How to AWS' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('equality for numbers', done => {
        const url = 'http://localhost:16999/rest/articles?filter[views]=10'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'NodeJS Best Practices' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      describe('equality for booleans', () => {
        it('matches false', async () => {
          const url = 'http://localhost:16999/rest/photos?filter[raw]=false'
          let {err, res, json} = await helpers.requestAsync({
            method: 'GET',
            url
          })
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const photoTypes = json.data.map(i => i.attributes.raw)
          assert.deepEqual(photoTypes, [ false, false ], 'expected matching resources')
        })

        it('matches true', done => {
          const url = 'http://localhost:16999/rest/photos?filter[raw]=true'
          helpers.request({
            method: 'GET',
            url
          }, (err, res, json) => {
            assert.strictEqual(err, null)
            json = helpers.validateJson(json)

            assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
            const photoTypes = json.data.map(i => i.attributes.raw)
            assert.deepEqual(photoTypes, [ true, true ], 'expected matching resources')

            done()
          }).catch(done)
        })
      })

      it('less than for strings', done => {
        const url = 'http://localhost:16999/rest/articles?filter[title]=<M'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'How to AWS', 'Linux Rocks' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('less than for numbers', done => {
        const url = 'http://localhost:16999/rest/articles?filter[views]=<23'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'Linux Rocks', 'NodeJS Best Practices' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('greater than for strings', done => {
        const url = 'http://localhost:16999/rest/articles?filter[title]=>M'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'NodeJS Best Practices', 'Tea for Beginners' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('greater than for numbers', done => {
        const url = 'http://localhost:16999/rest/articles?filter[views]=>27'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          titles.sort()
          assert.deepEqual(titles, [ 'How to AWS', 'Tea for Beginners' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('case insensitive', done => {
        const url = 'http://localhost:16999/rest/articles?filter[title]=~linux rocks'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          assert.deepEqual(titles, [ 'Linux Rocks' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('case insensitive for non-string types', done => {
        const url = 'http://localhost:16999/rest/articles?filter[created]=~2016-01-01'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 0, "didn't expect matching resources")

          done()
        }).catch(done)
      })

      it('similar to', done => {
        const url = 'http://localhost:16999/rest/articles?filter[title]=:for'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          const titles = json.data.map(i => i.attributes.title)
          assert.deepEqual(titles, [ 'Tea for Beginners' ], 'expected matching resources')

          done()
        }).catch(done)
      })

      it('similar to for non-string types', done => {
        const url = 'http://localhost:16999/rest/articles?filter[created]=:2016-01-01'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 0, "didn't expect matching resources")

          done()
        }).catch(done)
      })

      it('allows filtering by id', done => {
        const url = 'http://localhost:16999/rest/articles?filter[id]=1be0913c-3c25-4261-98f1-e41174025ed5&filter[id]=de305d54-75b4-431b-adb2-eb6b9e546014'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 2, 'Should only give the 2x requested resources')

          done()
        }).catch(done)
      })

      it('allows for multiple filter values to be combined in a comma-separated list', done => {
        const url = 'http://localhost:16999/rest/articles?filter[tags]=6ec62f6d-9f82-40c5-b4f4-279ed1765492,7541a4de-4986-4597-81b9-cf31b6762486,2a3bdea4-a889-480d-b886-104498c86f69'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 3, 'Should only give the 3x requested resources')

          done()
        }).catch(done)
      })

      it('allows for a compound of comma-separated list filters', done => {
        const url = 'http://localhost:16999/rest/articles?filter[tags]=6ec62f6d-9f82-40c5-b4f4-279ed1765492,7541a4de-4986-4597-81b9-cf31b6762486,2a3bdea4-a889-480d-b886-104498c86f69&filter[id]=de305d54-75b4-431b-adb2-eb6b9e546014,1be0913c-3c25-4261-98f1-e41174025ed5'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 2, 'Should only give the 2x requested resources')

          done()
        }).catch(done)
      })

      it('allows deep filtering', done => {
        const url = 'http://localhost:16999/rest/articles?include=author&filter[author]=d850ea75-4427-4f81-8595-039990aeede5&filter[author][firstname]=Mark'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 1, 'Should give the one matching resource')
          assert.strictEqual(json.included.length, 1, 'Should give the one matching include')

          done()
        }).catch(done)
      })
    })

    describe('applying fields', () => {
      it('unknown attribute should error', done => {
        const url = 'http://localhost:16999/rest/articles?fields[article]=title'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          helpers.validateError(json)
          assert.strictEqual(res.statusCode, 403, 'Expecting 403')
          done()
        }).catch(done)
      })

      it('just title', done => {
        const url = 'http://localhost:16999/rest/articles?fields[articles]=title'
        request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          for(const resource of json.data) {
            const keys = Object.keys(resource.attributes)
            assert.deepEqual(keys, [ 'title' ], 'should only have the title attribute')
          }

          done()
        }).catch(done)
      })

      it('title AND content', done => {
        const url = 'http://localhost:16999/rest/articles?fields[articles]=title,content'
        request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          for(const resource of json.data) {
            const keys = Object.keys(resource.attributes)
            assert.deepEqual(keys, [ 'title', 'content' ], 'should only have the title attribute')
          }

          done()
        }).catch(done)
      })
    })

    describe('applying includes', () => {
      it('unknown attribute should error', done => {
        const url = 'http://localhost:16999/rest/articles?include=foobar'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          helpers.validateError(json)
          assert.strictEqual(res.statusCode, 403, 'Expecting 403')
          done()
        }).catch(done)
      })

      it('include author', done => {
        const url = 'http://localhost:16999/rest/articles?include=author'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 4, 'Should be 4 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

          done()
        }).catch(done)
      })

      it('include author and photos', done => {
        const url = 'http://localhost:16999/rest/articles?include=author,photos'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 7, 'Should be 7 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 3, 'Should be 3 included photos resources')

          done()
        }).catch(done)
      })

      it('include author.photos and photos', done => {
        const url = 'http://localhost:16999/rest/articles?include=author.photos,photos'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 8, 'Should be 8 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 4, 'Should be 4 included photos resources')

          done()
        }).catch(done)
      })

      it('include author.photos', done => {
        const url = 'http://localhost:16999/rest/articles?include=author.photos'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 8, 'Should be 8 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 4, 'Should be 4 included photos resources')

          done()
        }).catch(done)
      })

      it('include author with filter and people fields', done => {
        const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[people]=email'
        request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 1, 'Should be 1 result article')
          assert.strictEqual(json.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

          assert.strictEqual(json.included.length, 1, 'Should be 1 included resource')
          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
          assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')

          done()
        }).catch(done)
      })

      it('include author with filter and article fields', done => {
        const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[articles]=created'
        request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 1, 'Should be 1 result article')
          assert.strictEqual(json.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

          assert.strictEqual(json.included.length, 1, 'Should be 1 included resource')
          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
          assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')

          done()
        }).catch(done)
      })

      it('include author with filter and people+article fields', done => {
        const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[people]=email&fields[articles]=created'
        request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 1, 'Should be 1 result article')
          assert.strictEqual(json.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

          assert.strictEqual(json.included.length, 1, 'Should be 1 included resource')
          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
          assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')

          done()
        }).catch(done)
      })

      it('include author.photos with filter', done => {
        const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author][firstname]=Mark'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 2, 'Should be 2 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 1, 'Should be 1 included people resource')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 1, 'Should be 1 included photos resource')

          done()
        }).catch(done)
      })

      it('include author.photos with multiple filters', done => {
        const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author]=ad3aa89e-9c5b-4ac9-a652-6670f9f27587&filter[author]=cc5cca2e-0dd8-4b95-8cfc-a11230e73116'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 5, 'Should be 2 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 2, 'Should be 2 included people resource')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 3, 'Should be 2 included photos resource')

          done()
        })
      })

      it('include author.photos with multiple filters comma delineated', done => {
        const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author][firstname]=Mark,Oli'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.included.length, 4, 'Should be 2 included resources')

          const people = json.included.filter(resource => resource.type === 'people')
          assert.strictEqual(people.length, 2, 'Should be 2 included people resource')

          const photos = json.included.filter(resource => resource.type === 'photos')
          assert.strictEqual(photos.length, 2, 'Should be 2 included photos resource')

          done()
        }).catch(done)
      })
    })

    describe('by foreign key', () => {
      it('should find resources by a relation', done => {
        const url = 'http://localhost:16999/rest/articles/?filter[photos]=aab14844-97e7-401c-98c8-0bd5ec922d93'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 2, 'Should be 2 matching resources')
          done()
        }).catch(done)
      })

      it('should find resources by many relations', done => {
        const url = 'http://localhost:16999/rest/articles/?filter[photos]=aab14844-97e7-401c-98c8-0bd5ec922d93&filter[photos]=4a8acd65-78bb-4020-b9eb-2d058a86a2a0'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateJson(json)

          assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
          assert.strictEqual(json.data.length, 3, 'Should be 3 matching resources')
          done()
        }).catch(done)
      })

      it('should error with incorrectly named relations', done => {
        const url = 'http://localhost:16999/rest/articles/?filter[photo]=aab14844-97e7-401c-98c8-0bd5ec922d93'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)

          assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
          const error = json.errors[0]
          assert.strictEqual(error.code, 'EFORBIDDEN')
          assert.strictEqual(error.title, 'Invalid filter')
          assert(error.detail.match('do not have attribute or relationship'))
          done()
        }).catch(done)
      })

      it('should error when querying the foreign end of a relationship', done => {
        const url = 'http://localhost:16999/rest/comments/?filter[article]=aab14844-97e7-401c-98c8-0bd5ec922d93'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)

          assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
          const error = json.errors[0]
          assert.strictEqual(error.code, 'EFORBIDDEN')
          assert.strictEqual(error.title, 'Invalid filter')
          assert(error.detail.match('is a foreign reference and does not exist on'))
          done()
        }).catch(done)
      })

      it('should give clean validation errors', done => {
        const url = 'http://localhost:16999/rest/articles?include=fdfdds,sdf'
        helpers.request({
          method: 'GET',
          url
        }, (err, res, json) => {
          assert.strictEqual(err, null)
          json = helpers.validateError(json)

          assert.strictEqual(res.statusCode, 403, 'Expecting 403 EFORBIDDEN')
          assert.strictEqual(json.errors.length, 2, 'Should be 2 errors')

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
