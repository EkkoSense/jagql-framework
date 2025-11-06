const jsonApiConfig = require("./jsonApiConfig")

/**
 *
 */
module.exports = class RequestUtilities {
    /**
     *
     * @param {import("express").Request} req
     * @returns The inferred base URL, if present. Not suitable for trust, but
     * can be included in the return content.
     */
    static inferExternalBaseUrl(req) {
        if(jsonApiConfig.inferExternalUrlFromHeader) {
            // Since it's from a header, we don't actually trust it to be a
            // valid URL
            return req.headers[jsonApiConfig.inferExternalUrlFromHeader.toLocaleLowerCase()] ?? null
        }
        return null
    }
}