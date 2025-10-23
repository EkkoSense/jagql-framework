'use strict'
const Relation = require("./Relation")
const RemoteRelation = require("./RemoteRelation")

/**
 *
 */
module.exports = class schemaValidator {
  /**
   * This should be called once on startup.
   *
   * @param {Record<string, import("../types/ResourceConfig").ResourceConfig<any>>} resources
   * @throws
   */
  static validateAllResourceConfigs(resources) {
    for(const [resource, resourceConfig] of Object.entries(resources)) {
      for(const [attribute, rel] of Relation.getAllRelations(resourceConfig)) {

        const types = rel.resources
        for(const type of types) {
          if (!resources[type]) {
            throw new Error(`'${resource}'.'${attribute}' is defined to hold a relation with '${type}', but '${type}' is not a valid resource name!`)
          }
        }
        if(!RemoteRelation.isRemoteRelation(rel)) continue
        const foreignRelation = rel.remoteKey

        const backReference = resources[types[0]].attributes[foreignRelation]
        if (!backReference) {
          throw new Error(`'${resource}'.'${attribute}' is defined as being a foreign relation to the primary '${types[0]}'.'${foreignRelation}', but that primary relationship does not exist!`)
        }
      }
    }
  }
}