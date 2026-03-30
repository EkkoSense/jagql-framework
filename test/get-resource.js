'use strict'

const assert = require('assert')
const helpers = require('./helpers.js')
const jsonApiTestServer = require('../example/server.js')


describe('Testing jsonapi-server', () => {
    describe('Searching for resources', () => {
        describe("Load test", () => {
            it("can load 100k objects in acceptable time", async () => {
                const { expect } = await import('chai')
                const start = new Date()
                const { err, res, json } = await helpers.requestAsync({
                    method: "GET",
                    url: "http://localhost:16999/rest/notes?page[limit]=1000000"
                })
                const finish = new Date()
                const elapsedMs = finish.valueOf() - start.valueOf()
                assert.strictEqual(err, null)
                // Note that 100,000 * 5us = 500,000us = 500ms
                expect(elapsedMs).to.be.lessThan(500, "Elapsed time is <5us per item")
                const vjson = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, "Expecting 200 OK")
                assert.deepEqual(vjson.included, [], "Response should have no included resources")
                assert.strictEqual(vjson.data.length, 100_000, "Response should contain all resources")
            })
        })
        it('unknown resource should error', async () => {
            const url = 'http://localhost:16999/rest/foobar'
            const { err, res, json } = await helpers.requestAsync({
                method: 'GET',
                url
            })
            assert.strictEqual(err, null)
            helpers.validateError(json)
            assert.strictEqual(res.statusCode, 404, 'Expecting 404')
        })

        it('empty search should return all objects', async () => {
            const url = 'http://localhost:16999/rest/articles'
            let { err, res, json } = await helpers.requestAsync({
                method: 'GET',
                url
            })
            assert.strictEqual(err, null)
            const data = helpers.validateJson(json)

            assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
            assert.deepEqual(data.included, [], 'Response should have no included resources')
            assert.strictEqual(data.data.length, 4, 'Response should contain exactly 4 resources')
            for (const resource of data.data) {
                helpers.validateArticle(resource)
            }
        })

        describe('applying sort', () => {
            it('ASC sort', async () => {
                const url = 'http://localhost:16999/rest/articles?sort=title'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 4, 'Response should contain exactly 4 resources')

                const previous = data.data[0]
                let current
                for (let i = 1; i < data.data.length; i++) {
                    current = data.data[i]
                    assert.ok(previous.attributes.title < current.attributes.title, 'Resources should be ordered')
                }
            })

            it('DESC sort', async () => {
                const url = 'http://localhost:16999/rest/articles?sort=-title'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 4, 'Response should contain exactly 4 resources')

                let previous
                let current
                for (let i = 1; i < data.data.length; i++) {
                    previous = data.data[i - 1]
                    current = data.data[i]
                    assert.ok(previous.attributes.title > current.attributes.title, 'Resources should be ordered')
                }
            })
        })

        describe('applying filter', () => {
            it('unknown attribute should error', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[foobar]=<M'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)
                assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
                const error = data.errors[0]
                assert.strictEqual(error.code, 'EFORBIDDEN')
                assert.strictEqual(error.title, 'Invalid filter')
            })

            it('unknown multiple attribute should error', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[foo]=bar&filter[foo]=baz'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)
                assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
                const error = data.errors[0]
                assert.strictEqual(error.code, 'EFORBIDDEN')
                assert.strictEqual(error.title, 'Invalid filter')
            })

            it('value of wrong type should error', async () => {
                const url = 'http://localhost:16999/rest/photos?filter[raw]=bob'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)
                assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
                const error = data.errors[0]
                assert.strictEqual(error.code, 'EFORBIDDEN')
                assert.strictEqual(error.title, 'Invalid filter')
                assert(error.detail.match("Filter value for key '.*?' is invalid"))
            })

            it('equality for strings', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[title]=How%20to%20AWS'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['How to AWS'], 'expected matching resources')
            })

            it('equality for numbers', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[views]=10'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['NodeJS Best Practices'], 'expected matching resources')
            })

            describe('equality for booleans', () => {
                it('matches false', async () => {
                    const url = 'http://localhost:16999/rest/photos?filter[raw]=false'
                    let { err, res, json } = await helpers.requestAsync({
                        method: 'GET',
                        url
                    })
                    assert.strictEqual(err, null)
                    const data = helpers.validateJson(json)

                    assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                    const photoTypes = data.data.map(i => i.attributes.raw)
                    assert.deepEqual(photoTypes,
                        [...new Array(data.data.length)].map(() => false),
                        "expected matching resources")
                })

                it('matches true', async () => {
                    const url = 'http://localhost:16999/rest/photos?filter[raw]=true'
                    const { err, res, json } = await helpers.requestAsync({
                        method: 'GET',
                        url
                    })
                    assert.strictEqual(err, null)
                    const data = helpers.validateJson(json)

                    assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                    const photoTypes = data.data.map(i => i.attributes.raw)
                    assert.deepEqual(photoTypes, [true, true], 'expected matching resources')
                })
            })

            it('less than for strings', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[title]=<M'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['How to AWS', 'Linux Rocks'], 'expected matching resources')
            })

            it('less than for numbers', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[views]=<23'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['Linux Rocks', 'NodeJS Best Practices'], 'expected matching resources')
            })

            it('greater than for strings', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[title]=>M'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['NodeJS Best Practices', 'Tea for Beginners'], 'expected matching resources')
            })

            it('greater than for numbers', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[views]=>27'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                titles.sort()
                assert.deepEqual(titles, ['How to AWS', 'Tea for Beginners'], 'expected matching resources')
            })

            it('case insensitive', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[title]=~linux rocks'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                assert.deepEqual(titles, ['Linux Rocks'], 'expected matching resources')
            })

            it('case insensitive for non-string types', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[created]=~2016-01-01'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 0, "didn't expect matching resources")
            })

            it('similar to', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[title]=:for'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                const titles = data.data.map(i => i.attributes.title)
                assert.deepEqual(titles, ['Tea for Beginners'], 'expected matching resources')
            })

            it('similar to for non-string types', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[created]=:2016-01-01'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 0, "didn't expect matching resources")
            })

            it('allows filtering by id', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[id]=1be0913c-3c25-4261-98f1-e41174025ed5&filter[id]=de305d54-75b4-431b-adb2-eb6b9e546014'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 2, 'Should only give the 2x requested resources')
            })

            it('allows for multiple filter values to be combined in a comma-separated list', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[tags]=6ec62f6d-9f82-40c5-b4f4-279ed1765492,7541a4de-4986-4597-81b9-cf31b6762486,2a3bdea4-a889-480d-b886-104498c86f69'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 3, 'Should only give the 3x requested resources')
            })

            it('allows for a compound of comma-separated list filters', async () => {
                const url = 'http://localhost:16999/rest/articles?filter[tags]=6ec62f6d-9f82-40c5-b4f4-279ed1765492,7541a4de-4986-4597-81b9-cf31b6762486,2a3bdea4-a889-480d-b886-104498c86f69&filter[id]=de305d54-75b4-431b-adb2-eb6b9e546014,1be0913c-3c25-4261-98f1-e41174025ed5'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 2, 'Should only give the 2x requested resources')
            })

            it('allows deep filtering', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author&filter[author]=d850ea75-4427-4f81-8595-039990aeede5&filter[author][firstname]=Mark'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 1, 'Should give the one matching resource')
                assert.strictEqual(data.included.length, 1, 'Should give the one matching include')
            })
        })

        describe('applying fields', () => {
            it('unknown attribute should error', async () => {
                const url = 'http://localhost:16999/rest/articles?fields[article]=title'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                helpers.validateError(json)
                assert.strictEqual(res.statusCode, 403, 'Expecting 403')
            })

            it('just title', async () => {
                const url = 'http://localhost:16999/rest/articles?fields[articles]=title'
                const { err, res, json } = await helpers.requestAsyncNoAssert({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                for (const resource of data.data) {
                    const keys = Object.keys(resource.attributes)
                    assert.deepEqual(keys, ['title'], 'should only have the title attribute')
                }
            })

            it('title AND content', async () => {
                const url = 'http://localhost:16999/rest/articles?fields[articles]=title,content'
                const { err, res, json } = await helpers.requestAsyncNoAssert({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                for (const resource of data.data) {
                    const keys = Object.keys(resource.attributes)
                    assert.deepEqual(keys, ['title', 'content'], 'should only have the title attribute')
                }
            })
        })

        describe('applying includes', () => {
            it('unknown attribute should error', async () => {
                const url = 'http://localhost:16999/rest/articles?include=foobar'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                helpers.validateError(json)
                assert.strictEqual(res.statusCode, 403, 'Expecting 403')
            })

            it('include author', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 4, 'Should be 4 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 4, 'Should be 4 included people resources')
            })

            it('include author and photos', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author,photos'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 7, 'Should be 7 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 3, 'Should be 3 included photos resources')
            })

            it('include author.photos and photos', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author.photos,photos'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 8, 'Should be 8 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 4, 'Should be 4 included photos resources')
            })

            it('include author.photos', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author.photos'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 8, 'Should be 8 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 4, 'Should be 4 included people resources')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 4, 'Should be 4 included photos resources')
            })

            it('include author with filter and people fields', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[people]=email'
                const { err, res, json } = await helpers.requestAsyncNoAssert({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 1, 'Should be 1 result article')
                assert.strictEqual(data.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

                assert.strictEqual(data.included.length, 1, 'Should be 1 included resource')
                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
                assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')
            })

            it('include author with filter and article fields', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[articles]=created'
                const { err, res, json } = await helpers.requestAsyncNoAssert({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 1, 'Should be 1 result article')
                assert.strictEqual(data.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

                assert.strictEqual(data.included.length, 1, 'Should be 1 included resource')
                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
                assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')
            })

            it('include author with filter and people+article fields', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author&filter[title]=Linux+Rocks&fields[people]=email&fields[articles]=created'
                const { err, res, json } = await helpers.requestAsyncNoAssert({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 1, 'Should be 1 result article')
                assert.strictEqual(data.data[0].attributes.created, '2015-11-11', 'Article should have created attribute')

                assert.strictEqual(data.included.length, 1, 'Should be 1 included resource')
                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 1, 'Should be 1 included people resource')
                assert.strictEqual(people[0].attributes.email, 'mark.fermor@example.com', 'Included people should have email attribute')
            })

            it('include author.photos with filter', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author][firstname]=Mark'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 2, 'Should be 2 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 1, 'Should be 1 included people resource')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 1, 'Should be 1 included photos resource')
            })

            it('include author.photos with multiple filters', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author]=ad3aa89e-9c5b-4ac9-a652-6670f9f27587&filter[author]=cc5cca2e-0dd8-4b95-8cfc-a11230e73116'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 5, 'Should be 2 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 2, 'Should be 2 included people resource')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 3, 'Should be 2 included photos resource')
            })

            it('include author.photos with multiple filters comma delineated', async () => {
                const url = 'http://localhost:16999/rest/articles?include=author.photos&filter[author][firstname]=Mark,Oli'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.included.length, 4, 'Should be 2 included resources')

                const people = data.included.filter(resource => resource.type === 'people')
                assert.strictEqual(people.length, 2, 'Should be 2 included people resource')

                const photos = data.included.filter(resource => resource.type === 'photos')
                assert.strictEqual(photos.length, 2, 'Should be 2 included photos resource')
            })

            it("correctly loads large numbers of includes (reverse)", async () => {
                const url = "http://localhost:16999/rest/people?filter[id]=be100353-4f53-494b-8af9-ba9b8c425527&include=photos&page[limit]=100000"
                const { err, res, json } = await helpers.requestAsync({
                    method: "GET",
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, "Expecting 200 OK")
                assert.strictEqual(data.included.length, 1005, "Should be 1005 included resources")
            })

            it("correctly loads large numbers of includes (forward)", async () => {
                const url = "http://localhost:16999/rest/people?filter[id]=be100353-4f53-494b-8af9-ba9b8c425527&include=notes&page[limit]=100000"
                const { err, res, json } = await helpers.requestAsync({
                    method: "GET",
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, "Expecting 200 OK")
                assert.strictEqual(data.included.length, 1005, "Should be 1005 included resources")
            })
        })

        describe('by foreign key', () => {
            it('should find resources by a relation', async () => {
                const url = 'http://localhost:16999/rest/articles/?filter[photos]=aab14844-97e7-401c-98c8-0bd5ec922d93'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 2, 'Should be 2 matching resources')
            })

            it('should find resources by many relations', async () => {
                const url = 'http://localhost:16999/rest/articles/?filter[photos]=aab14844-97e7-401c-98c8-0bd5ec922d93&filter[photos]=4a8acd65-78bb-4020-b9eb-2d058a86a2a0'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateJson(json)

                assert.strictEqual(res.statusCode, 200, 'Expecting 200 OK')
                assert.strictEqual(data.data.length, 3, 'Should be 3 matching resources')
            })

            it('should error with incorrectly named relations', async () => {
                const url = 'http://localhost:16999/rest/articles/?filter[photo]=aab14844-97e7-401c-98c8-0bd5ec922d93'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)

                assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
                const error = data.errors[0]
                assert.strictEqual(error.code, 'EFORBIDDEN')
                assert.strictEqual(error.title, 'Invalid filter')
                assert(error.detail.match('do not have attribute or relationship'))
            })

            it('should error when querying the foreign end of a relationship', async () => {
                const url = 'http://localhost:16999/rest/comments/?filter[article]=aab14844-97e7-401c-98c8-0bd5ec922d93'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)

                assert.strictEqual(res.statusCode, 403, 'Expecting 403 FORBIDDEN')
                const error = data.errors[0]
                assert.strictEqual(error.code, 'EFORBIDDEN')
                assert.strictEqual(error.title, 'Invalid filter')
                assert(error.detail.match('is a foreign reference and does not exist on'))
            })

            it('should give clean validation errors', async () => {
                const url = 'http://localhost:16999/rest/articles?include=fdfdds,sdf'
                const { err, res, json } = await helpers.requestAsync({
                    method: 'GET',
                    url
                })
                assert.strictEqual(err, null)
                const data = helpers.validateError(json)

                assert.strictEqual(res.statusCode, 403, 'Expecting 403 EFORBIDDEN')
                assert.strictEqual(data.errors.length, 2, 'Should be 2 errors')
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
