'use strict'
const jsonApi = require('../jsonApi.js')
const _ = {
  uniq: require('lodash.uniq'),
  uniqBy: require('lodash.uniqby')
}
const rerouter = require('../rerouter.js')
const async = require('async')
const debug = require('../debugging.js')
const ourJoi = require("../ourJoi.js")

module.exports = class includePP {
  static action(request, response, callback) {
    let includes = request.params.include
    const filters = request.params.filter
    if (!includes) return callback()
    includes = (`${includes}`).split(',')

    this.#arrayToTree(request, includes, filters, (attErr, includeTree) => {
      if (attErr) return callback(attErr)

      let dataItems = response.data
      if (!(Array.isArray(dataItems))) dataItems = [ dataItems ]
      includeTree._dataItems = dataItems

      this.#fillIncludeTree(includeTree, request, fiErr => {
        if (fiErr) return callback(fiErr)

        includeTree._dataItems = [ ]
        response.included = this.#getDataItemsFromTree(includeTree)
        response.included = _.uniqBy(response.included, someItem => `${someItem.type}~~${someItem.id}`)

        return callback()
      })
    })
  }

  static #arrayToTree(request, includes, filters, callback) {
    const validationErrors = [ ]
    const tree = {
      _dataItems: null,
      _resourceConfig: [ ].concat(request.resourceConfig)
    }

    const iterate = (text, node, filter) => {
      if (text.length === 0) return null
      const parts = text.split('.')
      const first = parts.shift()
      const rest = parts.join('.')
      if (!filter) filter = {}

      let resourceAttribute = node._resourceConfig.map(resourceConfig => {
        return resourceConfig.attributes[first]
      }).filter(a => a).pop()
      if (!resourceAttribute) {
        return validationErrors.push({
          status: '403',
          code: 'EFORBIDDEN',
          title: 'Invalid inclusion',
          detail: `${node._resourceConfig.resource} do not have property ${first}`
        })
      }
      const settings = ourJoi.getSettings(resourceAttribute)
      resourceAttribute = settings.__one || settings.__many
      if (!resourceAttribute) {
        return validationErrors.push({
          status: '403',
          code: 'EFORBIDDEN',
          title: 'Invalid inclusion',
          detail: `${node._resourceConfig.resource}.${first} is not a relation and cannot be included`
        })
      }

      filter = filter[first] || { }

      if (Array.isArray(filter)) {
        filter = filter.filter(i => i instanceof Object).pop()
      }

      if (!node[first]) {
        node[first] = {
          _dataItems: [ ],
          _resourceConfig: resourceAttribute.map(a => jsonApi._resources[a]),
          _filter: [ ]
        }

        if (!((Array.isArray(filter)) && (filter.length === 0))) {
          for (const i in filter) {
            if (!(typeof filter[i] === 'string' || (Array.isArray(filter[i])))) continue
            node[first]._filter.push(`filter[${i}]=${filter[i]}`)
          }
        }
      }
      iterate(rest, node[first], filter)
    }
    includes.forEach(include => {
      iterate(include, tree, filters)
    })

    if (validationErrors.length > 0) return callback(validationErrors)
    return callback(null, tree)
  }

  static #getDataItemsFromTree(tree) {
    let items = tree._dataItems
    for (const i in tree) {
      if (i[0] !== '_') {
        items = items.concat(this.#getDataItemsFromTree(tree[i]))
      }
    }
    return items
  }

  static #fillIncludeTree(includeTree, request, callback) {
    /** **
    includeTree = {
      _dataItems: [ ],
      _filter: { },
      _resourceConfig: { },
      person: { includeTree },
      booking: { includeTree }
    };
    ****/
    const includes = Object.keys(includeTree)

    const map = {
      primary: { },
      foreign: { }
    }
    includeTree._dataItems.forEach(dataItem => {
      if (!dataItem) return [ ]
      return Object.keys(dataItem.relationships || { }).filter(keyName => (keyName[0] !== '_') && (includes.indexOf(keyName) !== -1)).forEach(relation => {
        const someRelation = dataItem.relationships[relation]

        if (someRelation.meta.relation === 'primary') {
          let relationItems = someRelation.data
          if (!relationItems) return
          if (!(Array.isArray(relationItems))) relationItems = [ relationItems ]
          relationItems.forEach(relationItem => {
            const key = `${relationItem.type}~~${relation}~~${relation}`
            map.primary[key] = map.primary[key] || [ ]
            map.primary[key].push(relationItem.id)
          })
        }

        if (someRelation.meta.relation === 'foreign') {
          const key = `${someRelation.meta.as}~~${someRelation.meta.belongsTo}~~${relation}`
          map.foreign[key] = map.foreign[key] || [ ]
          map.foreign[key].push(dataItem.id)
        }
      })
    })

    const resourcesToFetch = []

    Object.keys(map.primary).forEach(relation => {
      let ids = _.uniq(map.primary[relation])
      const parts = relation.split('~~')
      const urlJoiner = '&filter[id]='
      ids = urlJoiner + ids.join(urlJoiner)
      if (includeTree[parts[1]]._filter) {
        ids += `&${includeTree[parts[1]]._filter.join('&')}`
      }
      resourcesToFetch.push({
        url: `${jsonApi._apiConfig.base + parts[0]}/?${ids}`,
        as: relation
      })
    })

    Object.keys(map.foreign).forEach(relation => {
      let ids = _.uniq(map.foreign[relation])
      ids.sort((a, b) => a.localeCompare(b))
      const parts = relation.split('~~')
      const urlJoiner = `&filter[${parts[0]}]=`
      ids = urlJoiner + ids.join(urlJoiner)
      if (includeTree[parts[2]]._filter) {
        ids += `&${includeTree[parts[2]]._filter.join('&')}`
      }
      resourcesToFetch.push({
        url: `${jsonApi._apiConfig.base + parts[1]}/?${ids}`,
        as: relation
      })
    })

    async.map(resourcesToFetch, (related, done) => {
      const parts = related.as.split('~~')
      debug.include(related)

      rerouter.route({
        method: 'GET',
        uri: related.url,
        originalRequest: request,
        params: {
          page: {offset: 0, limit: Math.pow(2, 32)} // Essentially no limit
        }
      }, (err, json) => {
        if (err) {
          debug.include('!!', JSON.stringify(err))
          return done(err.errors)
        }

        let data = json.data
        if (!data) return done()
        if (!(Array.isArray(data))) data = [ data ]
        includeTree[parts[2]]._dataItems = includeTree[parts[2]]._dataItems.concat(data)
        return done()
      })
    }, err => {
      if (err) return callback(err)

      async.map(includes, (include, done) => {
        if (include[0] === '_') return done()
        this.#fillIncludeTree(includeTree[include], request, done)
      }, callback)
    })
  }
}