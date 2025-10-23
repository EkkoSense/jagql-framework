const BaseRelation = require("./BaseRelation")

/**
 * This is a relation which for the application's purposes exists on the local entity.
 */
module.exports = class LocalRelation extends BaseRelation {
    /**
     *
     * @param {*} rel
     * @returns {rel is LocalRelation}
     */
    static isLocalRelation(rel) {
        return rel instanceof LocalRelation || ("uidType" in rel)
    }

    /**
     * @readonly
     */
    required
    /**
     *
     */
    uidType

    /**
     *
     * @param {"many" | "one"} count
     * @param {string[]} resources
     * @param {boolean} required
     * @param {"string" | "uuid" | "autoincrement"} uidType
     */
    constructor(count, resources, required, uidType) {
        super(count, resources)
        this.required = required
        this.uidType = uidType
    }
}