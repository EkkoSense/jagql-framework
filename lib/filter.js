'use strict'

const Attribute = require("./Attribute")
const { JsonApiError } = require("./errorHandlers/JsonApiError")
const Prop = require("./Prop")
const Relation = require("./Relation")
const RemoteRelation = require("./RemoteRelation")

/**
 * @typedef {import("../types/Filter").FilterSpec} FilterSpec
 */

/**
 * Single-character field prefix
 */
const FILTER_OPERATORS = new Set(['<', '>', '~', ':'])
/**
 * Single-character field prefix
 */
const STRING_ONLY_OPERATORS = new Set(['~', ':'])
const FILTER_SEPARATOR = ','

/**
 *
 */
module.exports = class filter {
  /**
   * Filter values starting with any of <>~: become an operator-value pair.
   * Otherwise it's the plain value.
   *
   * @param {string} element
   * @returns {FilterSpec}
   */
  static #splitElement(element) {
    if (!element) return null
    if (FILTER_OPERATORS.has(element[0])) {
      return { operator: element[0], value: element.substring(1) }
    }
    return { operator: null, value: element }
  }

  /**
   * If the filter definition looks valid, returns it; otherwise, returns an
   * error.
   *
   * This is called once per filter value, once per find/search request
   *
   * @param {string} attributeName
   * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
   * @param {string} scalarElement
   * @returns {{result: FilterSpec} | {error: string}}
   */
  static #parseFilterDef(attributeName, resourceConfig, scalarElement) {
    if (!scalarElement) return { error: 'invalid or empty filter element' }

    const splitElement = this.#splitElement(scalarElement)
    if (!splitElement) return { error: 'empty filter' }

    const operator = splitElement.operator
    const rel = Relation.getRelation(resourceConfig, attributeName)
    if(rel) {
      if(operator && STRING_ONLY_OPERATORS.has(operator)) {
        return {error: `operator ${operator} can only be applied to string attributes`}
      }
      return { result: splitElement } // relationship attribute: no further validation
    }
    const schema = Attribute.getAttribute(resourceConfig, attributeName)
    if(operator && schema && STRING_ONLY_OPERATORS.has(operator)) {
      const desc = schema.describe()
      if(desc.type !== "string") {
        return {error: `operator ${operator} can only be applied to string attributes`}
      }
    }

    const validateResult = schema.validate(splitElement.value)
    if (validateResult.error) {
      return { error: validateResult.error.message }
    }

    return { result: { operator: splitElement.operator,
      value: validateResult.value } }
  }

  /**
   * This is called once per filter attribute, once per find/search request
   *
   * @param {string} attributeName
   * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
   * @param {string[]} filterDefs
   * @returns {{result: FilterSpec[]} | {error: string[]}}
   */
  static #parseFilterDefsHelper(attributeName, resourceConfig, filterDefs) {
    if (!filterDefs) return { error: 'invalid or empty filter element' }

    const parsedDefs = filterDefs.map(
      filterDef => this.#parseFilterDef(attributeName, resourceConfig, filterDef))

    /**
     * @type {string[]}
     */
    const errors = []
    /**
     * @type {FilterSpec[]}
     */
    const results = []
    for(const def of parsedDefs) {
      if(def.error) {
        errors.push(def.error)
      } else {
        results.push(def.result)
      }
    }

    if (errors.length) return { error: errors }

    return { result: results }
  }

  /**
   * This is called once per filter attribute, once per find/search request
   *
   * @param {string} attributeName
   * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
   * @param {string[]} filterDefs
   * @returns {{error: import("../types/JsonApiResponse").JsonApiError} | {result: FilterSpec[]}}
   */
  static #parseFilterDefs(attributeName, resourceConfig, filterDefs) {
    const helperResult =
      this.#parseFilterDefsHelper(attributeName, resourceConfig, filterDefs)

    if (helperResult.error) {
      return {
        error: new JsonApiError({
          status: 403,
          code: 'EFORBIDDEN',
          title: 'Invalid filter',
          detail: `Filter value for key '${attributeName}' is invalid: ${helperResult.error}`
        })
      }
    }
    return { result: helperResult.result }
  }

  /**
   * This is called once per find/search request
   *
   * @param {import("../types/JsonApiRequest").JsonApiRequest} request
   * @throws {import("../types/CallbackHandler").JsonApiError}
   */
  static parseAndValidate(request) {
    if (!request.params.filter) return

    const resourceConfig = request.resourceConfig

    /**
     * @type {Record<string, FilterSpec[]>}
     */
    const processedFilter = { }

    const filterReformatted = Object.fromEntries(
      Object.entries(request.params.filter).map(([key, filterElement]) => {
        if (typeof filterElement == "string") {
          filterElement = filterElement.split(FILTER_SEPARATOR)
        }
        return [key, filterElement]
      })
    )

    for (const [key, filterDefs] of Object.entries(filterReformatted)) {
      if (!Array.isArray(filterDefs) && filterDefs instanceof Object) continue // skip deep filters

      if (!Prop.hasProperty(resourceConfig, key)) {
        throw new JsonApiError({
          status: 403,
          code: 'EFORBIDDEN',
          title: 'Invalid filter',
          detail: `${resourceConfig.resource} do not have attribute or relationship '${key}'`
        })
      }

      const rel = Relation.getRelation(resourceConfig, key)
      if (rel && RemoteRelation.isRemoteRelation(rel)) {
        throw new JsonApiError({
          status: 403,
          code: 'EFORBIDDEN',
          title: 'Invalid filter',
          detail: `Filter relationship '${key}' is a foreign reference and does not exist on ${resourceConfig.resource}`
        })
      }

      const parsedFilterElement = this.#parseFilterDefs(key,
          resourceConfig, filterDefs)
      if (parsedFilterElement.error) throw parsedFilterElement.error

      processedFilter[key] = [...parsedFilterElement.result]
    }

    request.params.filter = filterReformatted // Compat only
    request.processedFilter = processedFilter
  }
}

