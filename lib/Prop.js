const BaseRelation = require("./BaseRelation")

/**
 *
 */
module.exports = class Prop {
    /**
     *
     * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
     * @returns
     */
    static getAllSchemas(resourceConfig) {
        /**
         * @type {[string, import("joi").Schema][]}
         */
        const out = []
        for(const [k, v] of Object.entries(resourceConfig.attributes)) {
            if(BaseRelation.isRelation(v)) {
                out.push([k, v.schema])
            } else {
                out.push([k, v])
            }
        }
        return Object.fromEntries(out)
    }

    /**
     *
     * @param {import("../types/ResourceConfig").ResourceConfig} resourceConfig
     * @param {string} k
     * @returns
     */
    static hasProperty(resourceConfig, k) {
        return !!resourceConfig.attributes[k]
    }
}