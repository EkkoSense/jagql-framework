'use strict'
const ourJoi = require("./ourJoi")
const schemaValidator = module.exports = { }

schemaValidator.validate = function (resources) {
  Object.keys(resources).forEach(resource => {
    Object.keys(resources[resource].attributes).forEach(attribute => {
      const joiSchema = resources[resource].attributes[attribute]
      const settings = ourJoi.getSettings(joiSchema)
      if (!settings) return

      const types = settings.__one || settings.__many
      types.forEach(type => {
        if (!resources[type]) {
          throw new Error(`'${resource}'.'${attribute}' is defined to hold a relation with '${type}', but '${type}' is not a valid resource name!`)
        }
      })
      const foreignRelation = settings.__as
      if (!foreignRelation) return

      const backReference = resources[types[0]].attributes[foreignRelation]
      if (!backReference) {
        throw new Error(`'${resource}'.'${attribute}' is defined as being a foreign relation to the primary '${types[0]}'.'${foreignRelation}', but that primary relationship does not exist!`)
      }
    })
  })
}
