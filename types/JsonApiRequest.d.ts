import { Request, Response } from "express"
import { FilterSpec, FilterSpecByAttrIn } from "./Filter"
import { ResourceConfig } from "./ResourceConfig"

/**
 *
 */
export type HttpVerbs = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'

interface JsonApiRequestParams {
  fields?: any
  filter?: FilterSpecByAttrIn
  include?: string | string[]
  page?: any
  sort?: any
}
interface JsonApiInternalParams extends JsonApiRequestParams {
  data?: any
  id?: any
  relation?: any
  relationships?: any
  type?: any
}

export interface JsonApiRequest {
  inferredBaseUrl: string | null
  params: JsonApiInternalParams
  processedFilter?: Record<string, FilterSpec[]>
  headers: any
  safeHeaders: any
  cookies: any
  originalUrl: string
  express: {
    req: Request
    res: Response
  }
  route: {
    verb: HttpVerbs
    host: string
    base: string
    path: string
    query: string
    combined: string
  }
  resourceConfig?: ResourceConfig | ResourceConfig[]
}
