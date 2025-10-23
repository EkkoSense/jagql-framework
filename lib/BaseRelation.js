const Joi = require("joi")

/**
 * @abstract
 */
module.exports = class BaseRelation {
    /**
     *
     * @param {*} rel
     * @returns {rel is BaseRelation}
     */
    static isRelation(rel) {
        return rel instanceof BaseRelation || ("resources" in rel)
    }

    /**
     *
     * @param {string} resourceName
     * @returns
     */
    #joiBase(resourceName) {
        const relationType = Joi.object().keys({
            id: Joi.string().required(),
            type: Joi.any().required().valid(resourceName),
            meta: Joi.object().optional()
        })
        return relationType
    }

    /**
     * @readonly
     */
    count
    /**
     * @readonly
     */
    resources
    /**
     * @readonly
     * @type {import("joi").Schema}
     */
    schema

    /**
     *
     * @param {"many" | "one"} count
     * @param {string[]} resources
     */
    constructor(count, resources) {
        this.count = count
        this.resources = resources

        switch (count) {
            case "many": {
                this.schema = Joi.array().items(
                    ...resources.map(resourceName => this.#joiBase(resourceName)))
                break
            }
            case "one": {
                this.schema = Joi.alternatives().try(
                    Joi.any().valid(null), // null
                    ...resources.map(resourceName => this.#joiBase(resourceName)),
                )
                break
            }
        }
    }
}