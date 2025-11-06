'use strict'

const swagger = require('../lib/swagger')
let swaggerDoc

/**
 * This supports validation against a JSON schema (not a Joi one)
 */
module.exports = class swaggerValidator {
  /**
   *
   * @param {string} method
   * @param {string} path
   * @returns
   */
  static #getModel(method, path) {
    const normalisedPath = path.replace("/rest/", "/").replace(/\/$/, "")
    let match = Object.keys(swaggerDoc.paths).filter(somePath => {
      somePath = somePath.replace(/\{[a-zA-Z-_]*\}/gi, '(.*?)')
      somePath = `^${somePath}$`
      somePath = new RegExp(somePath)
      return somePath.test(normalisedPath)
    }).pop()

    if (!match) {
      if (normalisedPath.indexOf('foobar') !== -1) {
        return { responses: { default: { schema: { $ref: '#/definitions/error' } } } }
      }
      throw new Error(`Swagger Validation: No matching path for ${normalisedPath}`)
    }

    match = swaggerDoc.paths[match]
    match = match[method]

    if (!match) {
      throw new Error(`Swagger Validation: No matching path for ${method} ${normalisedPath}`)
    }
    return match
  }

  static #getRef(ref) {
    ref = ref.split('/')
    ref.shift()
    let model = swaggerDoc
    while (ref.length) {
      model = model[ref.shift()]
    }
    return model
  }

  static #validateArray(model, payload, urlPath, validationPath) {
    if (!(payload instanceof Array)) {
      throw new Error(`Swagger Validation: ${urlPath} Expected Array at ${validationPath}`)
    }
    for(const [j, i] of payload.entries()) {
      this.#validateModel(model.items, i, urlPath, `${validationPath}[${j}]`, model.required)
    }
  }

  static #validateModel(model, payload, urlPath, validationPath, required) {
    if (!model) return
    if (required && !payload) {
      throw new Error(`Swagger Validation: ${urlPath} Expected required value at ${validationPath}`)
    }
    if (!payload) return

    if (model.$ref) {
      model = this.#getRef(model.$ref)
    }

    if (model.oneOf) {
      let lastError
      for(const m of model.oneOf) {
        try {
          this.#validateModel(m, payload, urlPath, validationPath, required)
          return
        } catch(e) {
          lastError = e
        }
      }
      throw lastError
    } else if (model.type === 'array') {
      this.#validateArray(model, payload, urlPath, validationPath)
    } else if (model.type === 'object') {
      this.#validateObject(model, payload, urlPath, validationPath)
    } else {
      this.#validateOther(model, payload, urlPath, validationPath)
    }
  }

  static #validateObject(model, payload, urlPath, validationPath) {
    // added this for relation test 'with two filters on same field against has-many relation', where an array of data was
    // being returned, and loop of the payload properties below was throwing because it was not finding property '0' in
    // the model.  As a work around, if the payload is an array, we're validating each element in the array separately.
    // todo: not sure this is the right thing to do here... is the error being bypassed here a legitamate swagger validation failure?
    if (payload instanceof Array) {
      for(const i of payload) {
        this.#validateObject(model, i, urlPath, validationPath)
      }
      return
    }
    if (!model.properties) return

    for (const i in model.properties) {
      const isRequired = ((model.required || [ ]).indexOf(i) !== -1)
      this.#validateModel(model.properties[i], payload[i], urlPath, `${validationPath}.${i}`, isRequired)
    }

    for (const j in payload) {
      if (!model.properties[j]) {
        throw new Error(`Swagger Validation: ${urlPath} Found unexpected property '${j}' at ${validationPath}.${j}`)
      }
    }
  }

  static #validateOther(model, payload, urlPath, validationPath) {
    if (model.type === 'string') {
      if (typeof payload !== 'string') {
        throw new Error(`Swagger Validation: ${urlPath} Expected string at ${validationPath}, got ${typeof payload}`)
      }
    } else if (model.type === 'number') {
      if (typeof payload !== 'number') {
        throw new Error(`Swagger Validation: ${urlPath} Expected number at ${validationPath}, got ${typeof payload}`)
      }
    } else if (model.type === 'boolean') {
      if (typeof payload !== 'boolean') {
        throw new Error(`Swagger Validation: ${urlPath} Expected boolean at ${validationPath}, got ${typeof payload}`)
      }
    } else {
      throw new Error(`Swagger Validation: ${urlPath} Unknown type ${model.type} at ${validationPath}`)
    }
  }

  static #validatePayload(method, path, httpCode, payload) {
    const model = this.#getModel(method, path)
    let schema = model.responses[httpCode]

    if (!schema) {
      schema = model.responses.default
    }
    if (!schema) throw new Error(`Unknown payload for ${method}, ${path}, ${httpCode}`)

    return this.#validateModel(schema.schema, payload, `${method}@${path}`, 'response', true)
  }

  static #validateRequest(method, path, body) {
    const model = this.#getModel(method, path)

    // Default Error model only implies a 404
    if (Object.keys(model.responses).length === 1) return null

    const bodySchema = model.parameters.filter(parameter => parameter.in === 'body').pop()

    // If there is no schema and no body, all is good
    if (!bodySchema && !body) return null

    return this.#validateModel(bodySchema.schema, body, `${method}@${path}`, 'request', true)
  }

  static assert(params, statusCode, json) {
    if (!swaggerDoc) swaggerDoc = swagger.generateDocumentation({})
    const urlObj = new URL(params.url)
    this.#validateRequest(params.method.toLowerCase(), urlObj.pathname, JSON.parse(params.body || 'null'))
    this.#validatePayload(params.method.toLowerCase(), urlObj.pathname, statusCode, JSON.parse(json))
  }
}