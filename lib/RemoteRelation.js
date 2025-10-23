const BaseRelation = require("./BaseRelation")

/**
 * This is a relation which for the application's purposes exists only on the
 * remote entity(ies).
 */
module.exports = class RemoteRelation extends BaseRelation {
    /**
     *
     * @param {*} rel
     * @returns {rel is RemoteRelation}
     */
    static isRemoteRelation(rel) {
        if(rel instanceof RemoteRelation) return true
        if("remoteKey" in rel) {
            console.log("Property looks like a remote relation, but isn't. Please ensure you aren't using multiple versions of jagql-framework, as that will not work")
        }
        return false
    }

    /**
     *
     */
    remoteKey

    /**
     *
     * @param {"many" | "one"} count
     * @param {string[]} resources
     * @param {string} remoteKey Where this entity can be found on the remote one.
     */
    constructor(count, resources, remoteKey) {
        super(count, resources)
        this.remoteKey = remoteKey
    }
}