/**
 * Rewrites field names the MSP API rejects into the qualifiers it documents,
 * so older queries keep working:
 *
 * - flows: `blocked:true` -> `status:blocked`, `blocked:false` ->
 *   `-status:blocked` (also `block:`, `=` and `1`/`0`), `bytes:` -> `total:`
 * - alarms: `source_ip:` -> `device.ip:`
 *
 * The API answers `blocked:` and `bytes:` on /v2/flows and `source_ip:` on
 * /v2/alarms with 400 "Invalid parameters", and `block:true` matches nothing.
 * Quoted values are left alone.
 */
/**
 * Translates legacy field names in a query into MSP qualifiers
 *
 * @param query - Query as the caller wrote it
 * @param entityType - `flows` or `alarms`; other types pass through unchanged
 * @returns The query with documented MSP qualifiers
 */
export declare function translateToMspQualifiers(query: string, entityType: string): string;
/**
 * Translates the fields of a `sortBy` value ("timestamp:desc", or a
 * comma-separated list such as "bytes:desc,ts:asc") into MSP sort fields
 *
 * @param sortBy - Sort value as the caller wrote it
 * @param entityType - `flows` or `alarms`; other types pass through unchanged
 * @returns The sort value with documented MSP fields
 */
export declare function translateSortBy(sortBy: string, entityType: string): string;
//# sourceMappingURL=msp-qualifiers.d.ts.map