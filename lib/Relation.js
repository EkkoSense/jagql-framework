const tools = require("./tools")
const RemoteRelation = require("./RemoteRelation")
const LocalRelation = require("./LocalRelation")
const BaseRelation = require("./BaseRelation")
const JoiCompat = require("./JoiCompat")
const RelationStore = require("./RelationStore")

/**
 * @abstract
 */
module.exports = class Relation {
    /**
     *
     * @param {import("../types/ourJoi").ModelOptions} config
     */
    static #validateForeignRelation(config) {
      if (!config.as) throw new Error("Missing 'as' property when defining a foreign relation")
      if (!config.resource) throw new Error("Missing 'resource' property when defining a foreign relation")
    }
    /**
     *
     * @param {import("../types/ourJoi").ModelOptions} config
     * @returns
     */
    static belongsToOneOf(config) {
      this.#validateForeignRelation(config)

      return new RemoteRelation("one", [ config.resource ], config.as)
    }
    /**
     *
     * @param {import("../types/ourJoi").ModelOptions} config
     * @returns
     */
    static belongsToManyOf(config) {
      this.#validateForeignRelation(config)

      return new RemoteRelation("many", [ config.resource ], config.as)
    }

    /**
     *
     * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
     * @returns
     */
    static getAllRelations(resourceConfig) {
        const settings = Object.fromEntries(JoiCompat.getAllAttributeSettings(resourceConfig))
        /**
         * @type {[string, BaseRelation][]}
         */
        const out = []
        for(const [k, v] of Object.entries(resourceConfig.attributes)) {
            if(BaseRelation.isRelation(v)) {
                out.push([k, v])
            } else if(settings[k]) {
                out.push([k, RelationStore.getRelation(settings[k].__relation)])
            }
        }
        return out
    }

    /**
     *
     * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
     * @param {string} foreignKey
     * @returns
     */
    static getRelation(resourceConfig, foreignKey) {
        const schemaOrRelation = resourceConfig.attributes[foreignKey]
        if(schemaOrRelation instanceof BaseRelation) {
            return schemaOrRelation
        } else {
            const settings = JoiCompat.getAttributeSettings(resourceConfig, foreignKey)
            return settings ? RelationStore.getRelation(settings.__relation) : undefined
        }
    }

    /**
     *
     * @param {string | string[]} resourceOrResources
     * @param {boolean} [required]
     * @param {"string" | "uuid" | "autoincrement"} [uidType]
     * @returns
     */
    static manyOf(resourceOrResources, required = false, uidType) {
        return new LocalRelation("many", tools.ensureArray(resourceOrResources), required, uidType)
    }
    /**
     *
     * @param {string | string[]} resourceOrResources
     * @param {boolean} [required]
     * @param {"string" | "uuid" | "autoincrement"} [uidType]
     * @returns
     */
    static oneOf(resourceOrResources, required = false, uidType) {
        return new LocalRelation("one", tools.ensureArray(resourceOrResources), required, uidType)
    }
}