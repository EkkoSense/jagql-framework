'use strict'
const sort = module.exports = { }

/**
 *
 * @param {import('../../types/Handler.js').JsonApiRequest} request
 * @param {import('../../types/JsonApiResponse.js').JsonApiResponseBodyWithMeta} response
 * @param {() => any} callback
 * @returns
 */
sort.action = (request, response, callback) => {
  let attribute = request.params.sort
  let ascending = 1
  if (!attribute) return callback()
  attribute = (`${attribute}`)
  if (attribute[0] === '-') {
    ascending = -1
    attribute = attribute.substring(1, attribute.length)
  }

  if (!request.resourceConfig.attributes[attribute]) {
    return callback({ // eslint-disable-line standard/no-callback-literal
      status: '403',
      code: 'EFORBIDDEN',
      title: 'Invalid sort',
      detail: `${request.resourceConfig.resource} do not have property ${attribute}`
    })
  }

  // todo: consider using a stable sort algerith (e.g. lodash.sortBy)
  response.data = response.data.sort((a, b) => {
    if (typeof a.attributes[attribute] === 'string') {
      return a.attributes[attribute].localeCompare(b.attributes[attribute]) * ascending
    } else if (typeof a.attributes[attribute] === 'number' || a.attributes[attribute] instanceof Date) {
      return (a.attributes[attribute] - b.attributes[attribute]) * ascending
    } else {
      return 0
    }
  })

  return callback()
}
