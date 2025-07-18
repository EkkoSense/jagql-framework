'use strict'
const { Handler } = require('./Handler')
const _ = {
  assign: require('lodash.assign')
}

const Joi = require("joi")

class MemoryHandler extends Handler {
  static #clone (obj) { return JSON.parse(JSON.stringify(obj)) }
  static #indexOf (list, obj) {
    for (const i in list) {
      if (list[i].id === obj.id) return i
    }
    return -1
  }

  constructor () {
    super()
    this.handlesSort = true
    this.resources = { }
  }
  /**
   Internal helper function to sort data
   */
  #sortList(request, list) {
    let attribute = request.params.sort
    if (!attribute) return

    let ascending = 1
    attribute = (`${attribute}`)
    if (attribute[0] === '-') {
      ascending = -1
      attribute = attribute.substring(1, attribute.length)
    }

    list.sort((a, b) => {
      if (typeof a[attribute] === 'string') {
        return a[attribute].localeCompare(b[attribute]) * ascending
      } else if (typeof a[attribute] === 'number') {
        return (a[attribute] - b[attribute]) * ascending
      } else {
        return 0
      }
    })
  }

  /**
   * initialise gets invoked once for each resource that uses this hander.
   * In this instance, we're allocating an array in our in-memory data store.
   *
   * Compat: Joi 17
   *
   * @param {import("../../types/ResourceConfig").ResourceConfig<any>} resourceConfig
   */
  initialise (resourceConfig) {
    const schema = resourceConfig.attributes
    const compiled = Joi.compile(schema)
    const resources = resourceConfig.examples ? resourceConfig.examples.map(item => {
      const attrs = {...item}
      delete attrs.id
      delete attrs.type
      delete attrs.meta
      const validationResult = compiled.validate(attrs)
      if (validationResult.error) {
        return item
      } else {
        return {
          id: item.id,
          type: item.type,
          meta: item.meta,
          ...validationResult.value
        }
      }
    }) : []
    this.resources[resourceConfig.resource] = resources
    this.ready = true
  }

  /**
   Search for a list of resources, given a resource type.
   */
  search (request, callback) {
    let results = this.resources[request.params.type]

    const idFilter = request.params?.filter?.id
    if (idFilter) {
      if(Array.isArray(idFilter)) {
        const idFilterMatch = new Set(idFilter)
        results = results.filter(resource => idFilterMatch.has(resource.id))
      } else {
        results = results.filter(resource => resource.id === idFilter)
      }
    }

    this.#sortList(request, results)
    const resultCount = results.length
    if (request.params.page) {
      results = results.slice(request.params.page.offset, request.params.page.offset + request.params.page.limit)
    }
    return callback(null, MemoryHandler.#clone(results), resultCount)
  }

  /**
   Delete a resource, given a resource type and and id.
   */
  delete (request, callback) {
    // Find the requested resource
    this.find(request, (err, theResource) => {
      if (err) return callback(err)

      // Remove the resource from the in-memory store.
      const index = MemoryHandler.#indexOf(this.resources[request.params.type], theResource)
      this.resources[request.params.type].splice(index, 1)

      // Return with no error
      return callback()
    })
  }

  /**
   Update a resource, given a resource type and id, along with a partialResource.
   partialResource contains a subset of changes that need to be merged over the original.
   */
  update (request, partialResource, callback) {
    // Find the requested resource
    this.find(request, (err, theResource) => {
      if (err) return callback(err)

      // Merge the partialResource over the original
      theResource = _.assign(theResource, partialResource)

      // Push the newly updated resource back into the in-memory store
      const index = MemoryHandler.#indexOf(this.resources[request.params.type], theResource)
      this.resources[request.params.type][index] = theResource

      // Return the newly updated resource
      return callback(null, MemoryHandler.#clone(theResource))
    })
  }

  /**
   Find a specific resource, given a resource type and and id.
   */
  find (request, callback) {
    // Pull the requested resource from the in-memory store
    const theResource = this.resources[request.params.type].filter(anyResource => anyResource.id === request.params.id).pop()

    // If the resource doesn't exist, error
    if (!theResource) {
      return callback({ // eslint-disable-line standard/no-callback-literal
        status: '404',
        code: 'ENOTFOUND',
        title: 'Requested resource does not exist',
        detail: `There is no ${request.params.type} with id ${request.params.id}`
      })
    }

    // Return the requested resource
    return callback(null, MemoryHandler.#clone(theResource))
  }
  /**
   Create (store) a new resource given a resource type and an object.
   */
  create (request, newResource, callback) {
    // Check to see if the ID already exists
    const index = MemoryHandler.#indexOf(this.resources[request.params.type], newResource)
    if (index !== -1) {
      return callback({ // eslint-disable-line standard/no-callback-literal
        status: '403',
        code: 'EFORBIDDEN',
        title: 'Requested resource already exists',
        detail: `The requested resource already exists of type ${request.params.type} with id ${request.params.id}`
      })
    }
    // Push the newResource into our in-memory store.
    this.resources[request.params.type].push(newResource)
    // Return the newly created resource
    return callback(null, MemoryHandler.#clone(newResource))
  }
}

exports = module.exports = MemoryHandler
