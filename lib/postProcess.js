'use strict'
const postProcess = module.exports = { }

const jsonApi = require('..')
const debug = require('./debugging.js')
const rerouter = require('./rerouter.js')
const async = require('async')
postProcess._applySort = require('./postProcessing/sort.js').action
postProcess._applyFilter = require('./postProcessing/filter.js').action
postProcess._applyIncludes = require('./postProcessing/include.js').action
postProcess._applyFields = require('./postProcessing/fields.js').action

// sometimes the resourceConfig is an object... sometimes it's an array.
function getHandlerFromRequest (request) {
  let rc = request.resourceConfig || {}
  if (rc instanceof Array) {
    rc = rc[0] || {}
  }
  return rc.handlers || {}
}

postProcess.handle = (request, response, callback) => {
  let handler = getHandlerFromRequest(request)
  let tasks = [
    { name: 'sort', fn: '_applySort', skip: 'handlesSort' },
    { name: 'filter', fn: '_applyFilter', skip: 'handlesFilter' },
    // not permitting handlers to skip includes or fields, since these two steps cross the bounds into
    // other handlers' data.
    { name: 'includes', fn: '_applyIncludes' },
    { name: 'fields', fn: '_applyFields' }
  ].reduce((tasks, step) => {
    // short circuit if a custom handler claims to already have done the postprocess step
    // (e.g. if a handler is generating a database query that is already returning the records in the correct order,
    // it can set handlesSort = true on itself)
    if (step.skip && handler[step.skip]) return tasks

    tasks.push(next => {
      // declare that we are entering a postprocess step.
      // this will allow custom handlers to optionally provide alternative logic pathes when doing postprocess
      // steps like fetching foreign key records for 'includes', etc. (i.e. it will allow the custom handler to
      // differentiate a GET /:type request and a rerouted include request GET /:type?include=other_type
      request.postProcess = step.name

      // call the post process step.
      // note, we're not using an 'arrow fn' here, since we need the 'arguments' list.
      postProcess[step.fn](request, response, function () {
        // delete postProcess field before passing on the results.
        delete request.postProcess
        next.apply(this, arguments)
      })
    })
    return tasks
  }, [])

  async.waterfall(tasks, err => callback(err))
}

postProcess._fetchRelatedResources = (request, mainResource, callback) => {
  // Fetch the other objects
  let dataItems = mainResource[request.params.relation]

  if (!dataItems) return callback(null, [ null ], null)

  if (!(Array.isArray(dataItems))) dataItems = [ dataItems ]

  const page = request.params.page
  const dataItemsPage = dataItems.slice(page.offset,
    page.offset + page.limit)

  let resourcesToFetch = dataItemsPage.reduce((map, dataItem) => {
    map[dataItem.type] = map[dataItem.type] || [ ]
    map[dataItem.type].push(dataItem.id)
    return map
  }, { })

  resourcesToFetch = Object.keys(resourcesToFetch).map(type => {
    let ids = resourcesToFetch[type]
    const urlJoiner = '&filter[id]='
    ids = urlJoiner + ids.join(urlJoiner)
    let uri = `${jsonApi._apiConfig.pathPrefix + type}/?${ids}`
    if (request.route.query) {
      uri += `&${request.route.query}`
    }
    return uri
  })

  let total = null
  async.map(resourcesToFetch, (related, done) => {
    debug.include(related)

    rerouter.route({
      method: 'GET',
      uri: related,
      originalRequest: request,
      params: { filter: request.params.filter,
        page: { offset: 0, limit: dataItemsPage.length } }
    }, (err, json) => {
      if (err) {
        debug.include('!!', JSON.stringify(err))
        return done(err.errors)
      }

      let data = json.data

      if (json.meta && json.meta.page) {
        total = (total || 0) + json.meta.page.total
      }

      if (!(Array.isArray(data))) data = [ data ]

      return done(null, data)
    })
  }, (err, otherResources) => {
    if (err) return callback(err)
    const relatedResources = [].concat.apply([], otherResources)
    return callback(null, relatedResources, total)
  })
}

postProcess.fetchForeignKeys = (request, items, schema, callback) => {
  if (!(Array.isArray(items))) {
    items = [ items ]
  }
  items.forEach(item => {
    for (const i in schema) {
      const settings = schema[i]._settings
      if (settings && settings.__as) {
        item[i] = undefined
      }
    }
  })
  return callback()
}
