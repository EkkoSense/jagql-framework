const jsonApiConfig = require("./jsonApiConfig")
const tools = require("./tools")

/**
 *
 */
module.exports = class RequestUtilities {
    /**
     *
     * @param {import("express").Request} req
     * @returns {string | null} The inferred base URL, if present. Not suitable
     * for trust, but can be included in the return content.
     */
    static inferExternalBaseUrl(req) {
        if(jsonApiConfig.inferExternalUrlFromHeader) {
            // Since it's from a header, we don't actually trust it to be a
            // valid URL
            const normalisedHeader = jsonApiConfig.inferExternalUrlFromHeader.toLocaleLowerCase()
            const content = req.headers[normalisedHeader]
            if(!content) {
                return null
            }
            const serviceBaseUrl = tools.ensureArray(content)[0]
            return serviceBaseUrl.replace(/\/+$/, "") + jsonApiConfig.base
        }
        return null
    }
}