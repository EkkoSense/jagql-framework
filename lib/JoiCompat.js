const BaseRelation = require('./BaseRelation')

module.exports = class JoiCompat {
    /**
     * Caches.
     *
     * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
     * @returns {[string, import('../types/ourJoi').OurJoiSettings][]}
     */
    static getAllAttributeSettings(resourceConfig) {
        resourceConfig.attributeSettings ??= {}
        /**
         * @type {[string, import('../types/ourJoi').OurJoiSettings][]}
         */
        const out = []
        for(const [key, schema] of Object.entries(resourceConfig.attributes)) {
            if(BaseRelation.isRelation(schema)) {
                continue
            }
            if (!(key in resourceConfig.attributeSettings)) {
                resourceConfig.attributeSettings[key] = this.getSettings(schema)
            }
            out.push([key, resourceConfig.attributeSettings[key]])
        }
        return out
    }
    /**
     * Caches.
     *
     * @param {import('../types/ResourceConfig').ResourceConfig} resourceConfig
     * @param {string} foreignKey
     * @returns
     */
    static getAttributeSettings(resourceConfig, foreignKey) {
        resourceConfig.attributeSettings ??= {}
        if (!(foreignKey in resourceConfig.attributeSettings)) {
            resourceConfig.attributeSettings[foreignKey] = this.getSettings(resourceConfig.attributes[foreignKey])
        }
        return resourceConfig.attributeSettings[foreignKey]
    }
    /**
     * This is often called once per request; or as exported via getSchemaSettings
     * (perhaps for debugging); or many times on startup; or once per
     * filter-value; or once per request-item-attribute; or at other times
     *
     * @param {import('joi').Schema} schema
     * @returns {import('../types/ourJoi').OurJoiSettings}
     */
    static getSettings(schema) {
        return this.getSettingsFromDescription(schema?.describe())
    }

    /**
     * This is often called once per request; or as exported via getSchemaSettings
     * (perhaps for debugging); or many times on startup; or once per
     * filter-value; or once per request-item-attribute; or at other times
     *
     * @param {import('joi').Description} description
     * @returns {import('../types/ourJoi').OurJoiSettings}
     */
    static getSettingsFromDescription(description) {
        if (!description) {
            return undefined
        }
        return description.metas?.find(
            m => (typeof m == "object") && m._jagql)
    }
}