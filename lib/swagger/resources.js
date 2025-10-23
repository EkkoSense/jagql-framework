'use strict'
const jsonApiResources = require('../jsonApiResources')
const Relation = require('../Relation')
const RemoteRelation = require('../RemoteRelation')
const LocalRelation = require('../LocalRelation')

/**
 * Compat: Joi 17
 */
module.exports = class swaggerResources {
  /**
   * This should be called only once per service instance.
   *
   * @returns The OpenAPI spec for resources
   */
  static getResourceDefinitions() {
    const resourceDefinitions = { }

    for (const resource in jsonApiResources) {
      resourceDefinitions[resource] = this.#getResourceDefinition(jsonApiResources[resource])
    }
    resourceDefinitions.error = this.#getErrorDefinition()

    return resourceDefinitions
  }

  /**
   * This should be called only once per resource, once per service instance.
   *
   * @param {import('../../types/ResourceConfig').ResourceConfig} resourceConfig
   * @returns
   */
  static #getResourceDefinition(resourceConfig) {
    if (Object.keys(resourceConfig.handlers || { }).length === 0) return undefined

    const resourceDefinition = {
      description: resourceConfig.description,
      type: 'object',
      // required: [ "id", "type", "attributes", "relationships", "links" ],
      properties: {
        'id': {
          type: 'string'
        },
        'type': {
          type: 'string'
        },
        'attributes': {
          type: 'object',
          properties: { }
        },
        'relationships': {
          type: 'object',
          properties: { }
        },
        'links': {
          type: 'object',
          properties: {
            self: {
              type: 'string'
            }
          }
        },
        'meta': {
          type: 'object'
        }
      }
    }
    const attributeShortcut = resourceDefinition.properties.attributes.properties
    const relationshipsShortcut = resourceDefinition.properties.relationships.properties

    for (const [attribute, attrSchemaOrRel] of Object.entries(resourceConfig.attributes)) {
      if ((attribute === 'id') || (attribute === 'type') || (attribute === 'meta')) continue
      const rel = Relation.getRelation(resourceConfig, attribute)

      if(rel) {
        // This related to a broken line // if(RemoteRelation.isRemoteRelation(rel)) continue

        relationshipsShortcut[attribute] = swaggerResources.#getRelationshipSchema(rel)
      } else {
        const describe = attrSchemaOrRel.describe()
        attributeShortcut[attribute] =
          swaggerResources.#getAttributeSchema(attrSchemaOrRel)

        if (describe.flags?.presence === 'required') {
          resourceDefinition.properties.attributes.required ||= [ ]
          resourceDefinition.properties.attributes.required.push(attribute)
        }
      }
    }

    return resourceDefinition
  }

  /**
   * This should be called only once per resource-attribute, once per service instance.
   *
   * @param {import('joi').Schema} attrSchema
   * @returns
   */
  static #getAttributeSchema(attrSchema) {
    const describe = attrSchema.describe()
    const swaggerSchema = this.#getInnerSchema(describe)
    if (describe.description) {
      swaggerSchema.description = describe.description
    }

    return swaggerSchema
  }

  /**
   * This should be called a few times per resource, once per service instance.
   *
   * @param {Joi.Description} describe
   * @returns
   */
  static #getInnerSchema(describe) {
    switch(describe.type) {
      case "date":
        return {
          type: "string",
          format: "date",
        }
      case "array": {
        const itemsIn = describe.items
        const items = { type: 'object' }
        if (itemsIn[0]?.keys) {
          items.properties = Object.fromEntries(
            Object.entries(itemsIn[0].keys).map(([iKey, iSchemaDesc]) => [iKey, { type: iSchemaDesc.type }])
          )
        }

        return {
          type: "array",
          items,
        }
      }
      case "boolean": // Fall through
      case "object": // Fall through
      case "number": // Fall through
      case "string": {
        return {type: describe.type}
      }
      case "alternatives": {
        return {
          oneOf: describe.matches.map(m => this.#getInnerSchema(m.schema))
        }
      }
      case "any": {
        return {}
      }
      default:
        throw new Error(`Cannot interpret Joi type '${describe.type}' as a JSON-Schema type`)
    }
  }

  /**
   * This should be called only once per resource-relation, once per service instance.
   *
   * @param {BaseRelation} rel
   * @returns
   */
  static #getRelationshipSchema(rel) {
    const itemSchema = {
      type: 'object',
      required: ['type', 'id'],
      properties: {
        type: {
          type: 'string'
        },
        id: {
          type: 'string'
        },
        meta: {
          type: 'object'
        }
      }
    }
    const dataProperty = rel.count == "many" ? {
        type: 'array',
        items: itemSchema,
      } : itemSchema
    const swaggerSchema = {
      type: 'object',
      properties: {
        meta: {
          type: 'object'
        },
        links: {
          type: 'object',
          properties: {
            self: {
              type: 'string'
            },
            related: {
              type: 'string'
            }
          }
        },
        data: dataProperty,
      }
    }

    if (LocalRelation.isLocalRelation(rel) && rel.required) {
      if (rel.count == "many") {
        swaggerSchema.required = true
      } else {
        swaggerSchema.required = ['type', 'id']
      }
    }
    return swaggerSchema
  }

  static #getErrorDefinition() {
    return {
      type: 'object',
      required: [ 'jsonapi', 'meta', 'links', 'errors' ],

      properties: {
        jsonapi: {
          type: 'object',
          required: [ 'version' ],
          properties: {
            version: {
              type: 'string'
            }
          }
        },
        meta: {
          type: 'object'
        },
        links: {
          type: 'object',
          properties: {
            self: {
              type: 'string'
            }
          }
        },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'status', 'code', 'title', 'detail'
            ],
            properties: {
              status: {
                type: 'string'
              },
              code: {
                type: 'string'
              },
              title: {
                type: 'string'
              },
              detail: {
                type: 'object'
              }
            }
          }
        }
      }
    }
  }
}
