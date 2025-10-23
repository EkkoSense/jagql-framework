const BaseRelation = require("./BaseRelation")

/**
 *
 */
module.exports = class Attribute {
    /**
     *
     * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
     * @param {string} foreignKey
     * @returns
     */
    static getAttribute(resourceConfig, foreignKey) {
        const schemaOrRelation = resourceConfig.attributes[foreignKey]
        if(BaseRelation.isRelation(schemaOrRelation)) {
            return null
        } else {
            return schemaOrRelation
        }
    }
}