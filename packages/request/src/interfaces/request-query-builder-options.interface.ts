export interface RequestQueryBuilderOptions {
  delim?: string;
  delimStr?: string;
  paramNamesMap?: {
    fields?: string | string[];
    search?: string | string[];
    filter?: string | string[];
    or?: string | string[];
    join?: string | string[];
    sort?: string | string[];
    limit?: string | string[];
    offset?: string | string[];
    page?: string | string[];
    cache?: string | string[];
    /** @since 2.2.0 */
    cursor?: string | string[];
    includeDeleted?: string | string[];
  };
}
