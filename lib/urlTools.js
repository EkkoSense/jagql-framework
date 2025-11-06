/**
 *
 */
module.exports = class urlTools {
    /**
     * Produces the full URL from the non-alias config
     *
     * @param {import("../types/jsonApi").ApiConfig} config
     * @param {boolean} [withPathname]
     * @returns
     */
    static concatenateUrlPrefix(config, withPathname = false) {
        const protocol = config.protocol || "http"
        const hostname = config.hostname || "localhost"
        const url = new URL(`${protocol}://${hostname}`)
        url.port = "" + config.port
        if(withPathname) {
            url.pathname = config.base
        }
        return url.toString()
    }
}