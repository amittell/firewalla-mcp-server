/**
 * Advanced search tool handlers
 */
import { BaseToolHandler, mspQueryErrorResponse, } from './base.js';
import { SafeAccess, QuerySanitizer, ParameterValidator, createErrorResponse, ErrorType, queryShapeRefusal, } from '../../validation/error-handler.js';
import { getLimitValidationConfig } from '../../config/limits.js';
import { validateFirewallaQuerySyntax, getExampleQueries, } from '../../utils/query-validator.js';
import { withToolTimeout, TimeoutError, createTimeoutErrorResponse, } from '../../utils/timeout-manager.js';
import { createSearchTools } from '../search.js';
import { unixToISOStringOrNow } from '../../utils/timestamp.js';
import { SEARCH_FIELDS } from '../../search/types.js';
// ResponseStandardizer import removed - using direct response creation
import { GeographicFilterError, geographicFiltersToMspQuery, } from '../../utils/geographic-filters.js';
import { targetListEntryCount } from '../../utils/target-lists.js';
import { mapContinent } from '../../utils/geographic.js';
import { bracketRangeError, findBracketRange } from '../../utils/msp-query.js';
import { translateToMspQualifiers } from '../../utils/msp-qualifiers.js';
import { commaListValues, ipv4InCidr } from '../../search/client-filter.js';
function validateCommonSearchParameters(args, toolName, entityType, 
// The default the tool's schema advertises for limit
defaultLimit = 200) {
    // Validate optional limit parameter with default
    const limitValidation = ParameterValidator.validateNumber(args.limit, 'limit', {
        required: false,
        defaultValue: defaultLimit,
        ...getLimitValidationConfig(toolName),
    });
    if (!limitValidation.isValid) {
        return {
            isValid: false,
            response: createErrorResponse(toolName, 'Parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, limitValidation.errors),
        };
    }
    // Validate required query parameter
    const queryValidation = ParameterValidator.validateRequiredString(args.query, 'query');
    if (!queryValidation.isValid) {
        return {
            isValid: false,
            response: createErrorResponse(toolName, 'Query parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, queryValidation.errors),
        };
    }
    // Balanced parentheses, brackets and quotes, the nesting and length
    // limits, no control characters, and the complexity limits, each message
    // naming the limit it hit, before any translation or request; every tool
    // that takes a query runs the same checks (queryShapeRefusal).
    // search_flows and search_alarms sent an unclosed [, a NUL and a
    // 2,001-character query to the API, and the complexity limits ran in the
    // field check, refusing as "Query contains invalid field names".
    const shapeRefusal = queryShapeRefusal(toolName, args.query);
    if (shapeRefusal) {
        return { isValid: false, response: shapeRefusal };
    }
    // [low TO high] ranges: the API's are field:low-high. The suggestion has
    // the qualifiers the client sends (bytes: goes out as total: on flows).
    const bracketRange = findBracketRange(args.query);
    if (bracketRange) {
        return {
            isValid: false,
            response: mspQueryErrorResponse(toolName, bracketRangeError(args.query, bracketRange, translateToMspQualifiers(bracketRange.query, entityType))),
        };
    }
    // Validate query syntax
    const querySyntaxValidation = validateFirewallaQuerySyntax(args.query);
    if (!querySyntaxValidation.isValid) {
        const examples = getExampleQueries(entityType);
        return {
            isValid: false,
            response: createErrorResponse(toolName, 'Invalid query syntax', ErrorType.VALIDATION_ERROR, {
                query: args.query,
                syntax_errors: querySyntaxValidation.errors,
                examples: examples.slice(0, 3),
                hint: 'Use field:value terms joined by spaces or AND; OR works between values of one field (type:1 OR type:10); NOT or a leading - excludes',
            }, querySyntaxValidation.errors),
        };
    }
    // Validate field names in the query
    const fieldValidation = QuerySanitizer.validateQueryFields(args.query, entityType);
    if (!fieldValidation.isValid) {
        // A bare MAC address reads as a field (`aa:` in aa:bb:cc:dd:ee:ff)
        const bareMac = /(?:^|[\s(])-?((?:[0-9a-f]{2}:){5}[0-9a-f]{2})(?=$|[\s)])/i.exec(args.query)?.[1];
        const macHint = bareMac
            ? entityType === 'devices'
                ? `To search by MAC address, write mac:${bareMac}`
                : `To search by MAC address, write device.id:"${bareMac}"`
            : undefined;
        return {
            isValid: false,
            response: createErrorResponse(toolName, 'Query contains invalid field names', ErrorType.VALIDATION_ERROR, {
                query: args.query,
                documentation: entityType === 'alarms'
                    ? 'See /docs/error-handling-guide.md for troubleshooting'
                    : 'See /docs/query-syntax-guide.md for valid field names',
                ...(macHint && { hint: macHint }),
            }, macHint ? [...fieldValidation.errors, macHint] : fieldValidation.errors),
        };
    }
    // Validate cursor format if provided
    if (args.cursor !== undefined) {
        const cursorValidation = ParameterValidator.validateCursor(args.cursor, 'cursor');
        if (!cursorValidation.isValid) {
            return {
                isValid: false,
                response: createErrorResponse(toolName, 'Invalid cursor format', ErrorType.VALIDATION_ERROR, undefined, cursorValidation.errors),
            };
        }
    }
    // Flows and alarms send group_by to the API as groupBy, which takes
    // comma-separated API fields (for flows e.g. device, category, domain,
    // box; for alarms type, box, device, status) and answers an unknown one
    // with 400 (measured 2026-09-25). Other entities group on the client by
    // one of their search fields.
    let groupBy = args.group_by;
    if (args.group_by !== undefined &&
        (entityType === 'flows' || entityType === 'alarms')) {
        // An empty group_by asks for no grouping
        groupBy =
            typeof args.group_by === 'string'
                ? args.group_by.replace(/\s+/g, '') || undefined
                : args.group_by;
        if (groupBy !== undefined &&
            (typeof groupBy !== 'string' ||
                !/^[A-Za-z_.]+(,[A-Za-z_.]+)*$/.test(groupBy))) {
            return {
                isValid: false,
                response: createErrorResponse(toolName, 'Invalid group_by field', ErrorType.VALIDATION_ERROR, { group_by: args.group_by }, [
                    'group_by must be one or more comma-separated API fields, e.g. "category" or "device,category"',
                ]),
            };
        }
    }
    else if (args.group_by !== undefined) {
        const groupByValidation = ParameterValidator.validateEnum(args.group_by, 'group_by', SEARCH_FIELDS[entityType], false);
        if (!groupByValidation.isValid) {
            return {
                isValid: false,
                response: createErrorResponse(toolName, 'Invalid group_by field', ErrorType.VALIDATION_ERROR, {
                    group_by: args.group_by,
                    valid_fields: SEARCH_FIELDS[entityType],
                    documentation: 'See /docs/query-syntax-guide.md for valid fields',
                }, groupByValidation.errors),
            };
        }
    }
    return {
        isValid: true,
        // The limit to use: the one given, else the default
        limit: limitValidation.sanitizedValue,
        query: args.query,
        cursor: args.cursor,
        groupBy,
    };
}
export class SearchFlowsHandler extends BaseToolHandler {
    constructor() {
        // Enable full standardization: geographic enrichment and field normalization for network flows
        super({
            enableGeoEnrichment: true, // Network flows have IP addresses that require geographic enrichment
            enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
            additionalMeta: {
                data_source: 'flows',
                entity_type: 'network_flows',
                supports_geographic_enrichment: true,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'search_flows';
        this.description = 'Search network flows with advanced query filters. Use this for: historical analysis, specific time ranges, complex filtering, or when you need more than 50 flows. Supports pagination, time-based queries (e.g., "ts:>1h" for the last hour, or Unix seconds such as "ts:1735689600-1735693200"), and all flow fields including geographic filtering. For quick "what\'s happening now" snapshots, use get_recent_flow_activity instead. Reads GET /v2/flows, 500 per request, following the cursor up to limit; coverage gives the oldest and newest ts returned and why paging stopped. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
        this.category = 'search';
    }
    async execute(args, firewalla) {
        // The tool schema names the grouping groupBy and the sort sortBy;
        // group_by and sort_by are read too
        const searchArgs = {
            ...args,
            group_by: args.group_by ?? args.groupBy,
            sort_by: args.sort_by ?? args.sortBy,
        };
        const startTime = Date.now();
        try {
            // Validate common search parameters
            const validation = validateCommonSearchParameters(searchArgs, this.name, 'flows');
            if (!validation.isValid) {
                return validation.response;
            }
            // Validate force_refresh parameter if provided
            const forceRefreshValidation = ParameterValidator.validateBoolean(searchArgs.force_refresh, 'force_refresh', false);
            if (!forceRefreshValidation.isValid) {
                return createErrorResponse(this.name, 'Force refresh parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, forceRefreshValidation.errors);
            }
            const finalQuery = searchArgs.query;
            // ------------------------------------------------------------
            // geographic_filters: countries go to the API as region:, the one
            // geographic flow qualifier it documents; any other filter is refused
            // here, before a request, as the API would match nothing
            // ------------------------------------------------------------
            let geographicTerm;
            try {
                geographicTerm = geographicFiltersToMspQuery(searchArgs.geographic_filters);
            }
            catch (error) {
                if (!(error instanceof GeographicFilterError)) {
                    throw error;
                }
                return createErrorResponse(this.name, error.message, ErrorType.VALIDATION_ERROR, {
                    geographic_filters: searchArgs.geographic_filters,
                    ...(error.unsupported.length > 0 && {
                        unsupported_filters: error.unsupported,
                    }),
                    ...(Object.keys(error.invalid).length > 0 && {
                        invalid_values: error.invalid,
                    }),
                    supported_filters: {
                        countries: 'ISO 3166-1 alpha-2 country codes, sent as region:US,CN (any of them)',
                        regions: "country codes too, merged with countries (the API's region is a country)",
                    },
                }, error.problems);
            }
            const searchTools = createSearchTools(firewalla);
            const searchParams = {
                query: finalQuery,
                limit: validation.limit,
                offset: searchArgs.offset,
                cursor: searchArgs.cursor,
                sort_by: searchArgs.sort_by,
                sort_order: searchArgs.sort_order,
                group_by: validation.groupBy,
                aggregate: searchArgs.aggregate,
                time_range: searchArgs.time_range,
                force_refresh: forceRefreshValidation.sanitizedValue,
                geographic_filters: searchArgs.geographic_filters,
            };
            // The read's requests, counted into coverage.api_requests, retries
            // included. The client sends a GET again once after a timeout, a
            // dropped connection or a 502, 503 or 504; this handler does not retry
            // on top of that.
            const trace = { sent: 0, cached: 0 };
            const result = await withToolTimeout(async () => searchTools.search_flows(searchParams, trace), this.name);
            const executionTime = Date.now() - startTime;
            // Grouped: the API returned one item per group, not flows
            if (result.groups) {
                return this.createUnifiedResponse({
                    group_by: result.group_by,
                    count: result.groups.length,
                    groups: result.groups,
                    next_cursor: result.next_cursor,
                    has_more: !!result.next_cursor,
                    query_executed: result.query,
                }, { executionTimeMs: executionTime });
            }
            // Process flow data with enhanced standardization
            let processedFlows = SafeAccess.safeArrayMap(result.results, (flow) => ({
                timestamp: unixToISOStringOrNow(flow.ts),
                source_ip: SafeAccess.getNestedValue(flow, 'source.ip', 'unknown'),
                source_country: SafeAccess.getNestedValue(flow, 'source.geo.country', 'unknown'),
                source_city: SafeAccess.getNestedValue(flow, 'source.geo.city', 'unknown'),
                source_continent: SafeAccess.getNestedValue(flow, 'source.geo.continent', 'unknown'),
                destination_ip: SafeAccess.getNestedValue(flow, 'destination.ip', 'unknown'),
                destination_country: SafeAccess.getNestedValue(flow, 'destination.geo.country', 'unknown'),
                destination_city: SafeAccess.getNestedValue(flow, 'destination.geo.city', 'unknown'),
                destination_continent: SafeAccess.getNestedValue(flow, 'destination.geo.continent', 'unknown'),
                domain: SafeAccess.getNestedValue(flow, 'domain', null),
                protocol: SafeAccess.getNestedValue(flow, 'protocol', 'unknown'),
                // bytes field is calculated as total traffic: download + upload
                bytes: SafeAccess.getNestedValue(flow, 'download', 0) +
                    SafeAccess.getNestedValue(flow, 'upload', 0),
                blocked: SafeAccess.getNestedValue(flow, 'block', false),
                direction: SafeAccess.getNestedValue(flow, 'direction', 'unknown'),
                device: SafeAccess.getNestedValue(flow, 'device', {}),
                network: SafeAccess.getNestedValue(flow, 'network', null),
            }));
            // Apply geographic enrichment pipeline for IP addresses
            processedFlows = await this.enrichGeoIfNeeded(processedFlows, [
                'source_ip',
                'destination_ip',
            ]);
            // Create metadata for standardized response
            const metadata = {
                query: SafeAccess.getNestedValue(result, 'query', searchArgs.query || ''),
                entityType: 'flows',
                executionTime: SafeAccess.getNestedValue(result, 'execution_time_ms', executionTime),
                cached: false,
                cursor: result.next_cursor,
                hasMore: !!result.next_cursor,
                limit: validation.limit,
                aggregations: SafeAccess.getNestedValue(result, 'aggregations', null),
            };
            // Create unified response with standardized metadata. coverage: the
            // oldest and newest ts the API returned, and why paging stopped
            const unifiedResponseData = {
                flows: processedFlows,
                metadata,
                coverage: result.coverage,
                query_info: {
                    original_query: searchArgs.query,
                    // The query sent to the API; final_query repeated original_query
                    final_query: metadata.query,
                    applied_filters: {
                        // only when the filters added a term to the query
                        geographic: !!geographicTerm,
                        time_range: !!searchArgs.time_range,
                    },
                },
            };
            // Return unified response
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            // A query the MSP API cannot run was refused before any request
            const queryError = mspQueryErrorResponse(this.name, error);
            if (queryError) {
                return queryError;
            }
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to search flows: ${errorMessage}`, ErrorType.SEARCH_ERROR);
        }
    }
}
/** A string that says something: not empty and not "unknown" */
function knownText(value) {
    return typeof value === 'string' &&
        value.trim() !== '' &&
        !/^unknown$/i.test(value.trim())
        ? value.trim()
        : null;
}
/**
 * An alarm's remote end and its geography, as search_alarms gives them:
 * remote as the API sent it, without the geo the client's lookup adds;
 * remote_country the API's remote.region, else the lookup's country;
 * remote_continent that country's continent; and remote_city the
 * lookup's, only when the lookup places the address in that country
 */
function remoteGeography(alarm) {
    const remote = alarm?.remote;
    if (!remote || typeof remote !== 'object') {
        return { remote_country: null, remote_city: null, remote_continent: null };
    }
    const { geo, ...sent } = remote;
    const lookupCountry = knownText(geo?.country_code)?.toUpperCase() ??
        knownText(geo?.country)?.toUpperCase() ??
        null;
    const country = knownText(sent.region)?.toUpperCase() ?? lookupCountry;
    return {
        remote: sent,
        remote_country: country,
        remote_city: country && lookupCountry === country ? knownText(geo?.city) : null,
        remote_continent: country ? knownText(mapContinent(country)) : null,
    };
}
export class SearchAlarmsHandler extends BaseToolHandler {
    constructor() {
        // Enable full standardization: geographic enrichment and field normalization for security alarms
        super({
            enableGeoEnrichment: true, // Security alarms often contain IP addresses that require geographic enrichment
            enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
            additionalMeta: {
                data_source: 'alarms',
                entity_type: 'security_alarms',
                supports_geographic_enrichment: true,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'search_alarms';
        this.description = 'Search alarms using full-text or field filters. Alarm types: 1=Security Activity, 2=Abnormal Upload, 3=Large Bandwidth Usage, 4=Monthly Data Plan, 5=New Device, 6=Device Back Online, 7=Device Offline, 8=Video Activity, 9=Gaming Activity, 10=Porn Activity, 11=VPN Activity, 12=VPN Connection Restored, 13=VPN Connection Error, 14=Open Port, 15=Internet Connectivity Update, 16=Large Upload. Reads GET /v2/alarms, 500 per request, following the cursor up to limit. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
        this.category = 'search';
    }
    async execute(args, firewalla) {
        // The tool schema names the grouping groupBy and the sort sortBy;
        // group_by and sort_by are read too
        const searchArgs = {
            ...args,
            group_by: args.group_by ?? args.groupBy,
            sort_by: args.sort_by ?? args.sortBy,
        };
        const startTime = Date.now();
        try {
            // Validate common search parameters
            const validation = validateCommonSearchParameters(searchArgs, this.name, 'alarms');
            if (!validation.isValid) {
                return validation.response;
            }
            // Validate force_refresh parameter if provided
            const forceRefreshValidation = ParameterValidator.validateBoolean(searchArgs.force_refresh, 'force_refresh', false);
            if (!forceRefreshValidation.isValid) {
                return createErrorResponse(this.name, 'Force refresh parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, forceRefreshValidation.errors);
            }
            // geographic_filters: countries go to the API as remote.region:, the
            // remote end's country, the one geographic alarm qualifier it
            // documents; any other filter is refused here, before a request. The
            // argument was read by no one: {countries: ["CN"]} sent the query
            // alone and answered as if every country matched
            let geographicTerm;
            try {
                geographicTerm = geographicFiltersToMspQuery(searchArgs.geographic_filters, 'alarms');
            }
            catch (error) {
                if (!(error instanceof GeographicFilterError)) {
                    throw error;
                }
                return createErrorResponse(this.name, error.message, ErrorType.VALIDATION_ERROR, {
                    geographic_filters: searchArgs.geographic_filters,
                    ...(error.unsupported.length > 0 && {
                        unsupported_filters: error.unsupported,
                    }),
                    ...(Object.keys(error.invalid).length > 0 && {
                        invalid_values: error.invalid,
                    }),
                    supported_filters: {
                        countries: 'ISO 3166-1 alpha-2 country codes of the remote end, sent as remote.region:US,CN (any of them)',
                        regions: "country codes too, merged with countries (the API's remote.region is a country)",
                    },
                }, error.problems);
            }
            const searchTools = createSearchTools(firewalla);
            const searchParams = {
                query: searchArgs.query,
                limit: validation.limit,
                offset: searchArgs.offset,
                cursor: searchArgs.cursor,
                sort_by: searchArgs.sort_by,
                sort_order: searchArgs.sort_order,
                group_by: validation.groupBy,
                aggregate: searchArgs.aggregate,
                time_range: searchArgs.time_range,
                force_refresh: forceRefreshValidation.sanitizedValue,
                geographic_filters: searchArgs.geographic_filters,
            };
            const result = await withToolTimeout(async () => searchTools.search_alarms(searchParams), this.name);
            const executionTime = Date.now() - startTime;
            // Grouped: the API returned one item per group, not alarms
            if (result.groups) {
                return this.createUnifiedResponse({
                    group_by: result.group_by,
                    count: result.groups.length,
                    groups: result.groups,
                    next_cursor: result.next_cursor,
                    has_more: !!result.next_cursor,
                    query_executed: result.query,
                }, { executionTimeMs: executionTime });
            }
            // Process alarm data with enhanced standardization and schema harmonization
            const processedAlarms = SafeAccess.safeArrayMap(result.results, (alarm) => {
                // Try to extract device information from various possible locations
                const deviceInfo = {
                    id: SafeAccess.getNestedValue(alarm, 'device.id', SafeAccess.getNestedValue(alarm, 'deviceId', SafeAccess.getNestedValue(alarm, 'mac', 'unknown'))),
                    name: SafeAccess.getNestedValue(alarm, 'device.name', SafeAccess.getNestedValue(alarm, 'deviceName', 'unknown')),
                    ip: SafeAccess.getNestedValue(alarm, 'device.ip', SafeAccess.getNestedValue(alarm, 'deviceIp', SafeAccess.getNestedValue(alarm, 'ip', 'unknown'))),
                    mac: SafeAccess.getNestedValue(alarm, 'device.mac', SafeAccess.getNestedValue(alarm, 'mac', 'unknown')),
                };
                const rawAid = SafeAccess.getNestedValue(alarm, 'aid', null);
                // Use the actual alarm ID directly, properly handling 0 as a valid ID
                const finalAid = rawAid !== null && rawAid !== undefined
                    ? String(rawAid)
                    : 'unknown';
                return {
                    aid: finalAid,
                    timestamp: unixToISOStringOrNow(alarm.ts),
                    type: SafeAccess.getNestedValue(alarm, 'type', 'unknown'),
                    message: SafeAccess.getNestedValue(alarm, 'message', 'No message'),
                    direction: SafeAccess.getNestedValue(alarm, 'direction', 'unknown'),
                    protocol: SafeAccess.getNestedValue(alarm, 'protocol', 'unknown'),
                    status: SafeAccess.getNestedValue(alarm, 'status', 'unknown'),
                    // Enhanced device information (only include if meaningful data found)
                    device: deviceInfo.id !== 'unknown' || deviceInfo.name !== 'unknown'
                        ? deviceInfo
                        : undefined,
                    // Extract IP addresses for potential geographic enrichment
                    source_ip: SafeAccess.getNestedValue(alarm, 'remote.ip', SafeAccess.getNestedValue(alarm, 'source_ip', SafeAccess.getNestedValue(alarm, 'src', 'unknown'))),
                    destination_ip: SafeAccess.getNestedValue(alarm, 'destination.ip', SafeAccess.getNestedValue(alarm, 'destination_ip', SafeAccess.getNestedValue(alarm, 'dst', 'unknown'))),
                    // The remote end and its geography (remoteGeography). The
                    // remote object was dropped, the country the API sends with it
                    // too, and the pipeline enrichment run here on the whole list
                    // found no address in it, so no alarm had any geography
                    ...remoteGeography(alarm),
                };
            });
            // Create metadata for standardized response
            const metadata = {
                query: SafeAccess.getNestedValue(result, 'query', searchArgs.query || ''),
                entityType: 'alarms',
                executionTime: SafeAccess.getNestedValue(result, 'execution_time_ms', executionTime),
                cached: false,
                cursor: result.next_cursor,
                hasMore: !!result.next_cursor,
                limit: validation.limit,
                aggregations: SafeAccess.getNestedValue(result, 'aggregations', null),
            };
            // Add schema harmonization warning for search vs active alarms
            const schemaNote = {
                warning: 'Search endpoint returns limited fields compared to get_active_alarms',
                recommendation: 'Use get_active_alarms for complete device and alarm information',
                differences: [
                    'Device objects may not be fully populated in search results',
                    "Some severity and status fields may show 'unknown' values",
                    "remote_country is the API's remote.region where it sends one; the geoip-lite lookup fills in the rest",
                ],
            };
            // Create unified response with standardized metadata
            const unifiedResponseData = {
                alarms: processedAlarms,
                metadata,
                schema_harmonization: schemaNote,
                query_info: {
                    original_query: searchArgs.query,
                    // The query sent to the API
                    final_query: metadata.query,
                    applied_filters: {
                        time_range: !!searchArgs.time_range,
                        force_refresh: !!searchArgs.force_refresh,
                        // The remote.region term sent for geographic_filters, if any
                        geographic: geographicTerm ?? false,
                    },
                },
            };
            // Return unified response
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            // A query the MSP API cannot run was refused before any request
            const queryError = mspQueryErrorResponse(this.name, error);
            if (queryError) {
                return queryError;
            }
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to search alarms: ${errorMessage}`, ErrorType.SEARCH_ERROR);
        }
    }
}
export class SearchRulesHandler extends BaseToolHandler {
    constructor() {
        // Enable field normalization for firewall rules (no geographic enrichment needed)
        super({
            enableGeoEnrichment: false, // Firewall rules don't typically contain IP addresses
            enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
            additionalMeta: {
                data_source: 'rules',
                entity_type: 'firewall_rules',
                supports_geographic_enrichment: false,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'search_rules';
        this.description = 'Search firewall rules by target, action or status; the MSP API applies the query (GET /v2/rules). Supports all rule fields. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
        this.category = 'search';
    }
    async execute(args, firewalla) {
        const searchArgs = args;
        const startTime = Date.now();
        try {
            // Validate common search parameters
            const validation = validateCommonSearchParameters(searchArgs, this.name, 'rules');
            if (!validation.isValid) {
                return validation.response;
            }
            const searchTools = createSearchTools(firewalla);
            const searchParams = {
                query: searchArgs.query,
                limit: searchArgs.limit,
                offset: searchArgs.offset,
                cursor: searchArgs.cursor,
                sort_by: searchArgs.sort_by,
                sort_order: searchArgs.sort_order,
                group_by: searchArgs.group_by,
                aggregate: searchArgs.aggregate,
            };
            const result = await withToolTimeout(async () => searchTools.search_rules(searchParams), this.name);
            const executionTime = Date.now() - startTime;
            // Process rule data
            const processedRules = SafeAccess.safeArrayMap(result.results, (rule) => ({
                id: SafeAccess.getNestedValue(rule, 'id', 'unknown'),
                action: SafeAccess.getNestedValue(rule, 'action', 'unknown'),
                target_type: SafeAccess.getNestedValue(rule, 'target.type', 'unknown'),
                target_value: SafeAccess.getNestedValue(rule, 'target.value', 'unknown'),
                direction: SafeAccess.getNestedValue(rule, 'direction', 'unknown'),
                status: SafeAccess.getNestedValue(rule, 'status', 'unknown'),
                hit_count: SafeAccess.getNestedValue(rule, 'hit.count', 0),
            }));
            // Create metadata for standardized response
            const metadata = {
                query: SafeAccess.getNestedValue(result, 'query', searchArgs.query || ''),
                entityType: 'rules',
                executionTime: SafeAccess.getNestedValue(result, 'execution_time_ms', executionTime),
                cached: false,
                cursor: result.next_cursor,
                hasMore: !!result.next_cursor,
                limit: searchArgs.limit,
                aggregations: SafeAccess.getNestedValue(result, 'aggregations', null),
            };
            // Create unified response with standardized metadata
            const unifiedResponseData = {
                rules: processedRules,
                metadata,
                // With free text: the rules checked for the words, and whether they
                // were every rule the other terms match
                ...(result.free_text_coverage && {
                    free_text_coverage: result.free_text_coverage,
                }),
                query_info: {
                    original_query: searchArgs.query,
                    // The terms sent to the API; free text is not sent (GET
                    // /v2/rules matches none) but matched here, and
                    // free_text_coverage says how many rules were checked
                    final_query: metadata.query,
                    applied_filters: {
                        grouping: !!searchArgs.group_by,
                        sorting: !!searchArgs.sort_by,
                        aggregation: !!searchArgs.aggregate,
                    },
                },
            };
            // Return unified response
            return this.createUnifiedResponse(unifiedResponseData, {
                executionTimeMs: executionTime,
            });
        }
        catch (error) {
            // A query the MSP API cannot run was refused before any request
            const queryError = mspQueryErrorResponse(this.name, error);
            if (queryError) {
                return queryError;
            }
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to search rules: ${errorMessage}`, ErrorType.SEARCH_ERROR);
        }
    }
}
/**
 * The `ip:` values of a search_devices query that have a `/` but are not an
 * IPv4 CIDR block (an IPv6 block, a prefix past 32, a typo)
 */
function invalidIpBlocks(query) {
    const values = [
        ...query.matchAll(/(?:^|[\s(])-?ip:("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s()]+)/gi),
    ].flatMap(match => commaListValues(match[1]));
    return values.filter(value => value.includes('/') && ipv4InCidr('0.0.0.0', value) === undefined);
}
export class SearchDevicesHandler extends BaseToolHandler {
    constructor() {
        super(...arguments);
        this.name = 'search_devices';
        this.description = 'Search devices by name, IP, MAC or status (convenience wrapper with client-side filtering): reads the device list from GET /v2/devices (box, else FIREWALLA_BOX_ID, else every box) and filters it locally.';
        this.category = 'search';
    }
    async execute(args, firewalla) {
        const searchArgs = args;
        try {
            // Validate common search parameters
            const validation = validateCommonSearchParameters(searchArgs, this.name, 'devices', 50);
            if (!validation.isValid) {
                return validation.response;
            }
            // ip: takes an IPv4 CIDR block (192.168.1.0/24); any other value with
            // a / would match no device
            const badBlocks = invalidIpBlocks(searchArgs.query);
            if (badBlocks.length > 0) {
                const problems = badBlocks.map(block => `ip:${block} is not an IPv4 CIDR block; ip: takes an address, a * wildcard (192.168.1.*) or an IPv4 block such as 192.168.1.0/24.`);
                return createErrorResponse(this.name, problems.join(' '), ErrorType.VALIDATION_ERROR, { query: searchArgs.query, invalid_ip_blocks: badBlocks }, problems);
            }
            // Validate that both cursor and offset are not provided simultaneously
            if (searchArgs.cursor !== undefined && searchArgs.offset !== undefined) {
                return createErrorResponse(this.name, 'Cannot provide both cursor and offset parameters simultaneously', ErrorType.VALIDATION_ERROR, {
                    provided_cursor: searchArgs.cursor,
                    provided_offset: searchArgs.offset,
                    documentation: 'Use either cursor-based pagination (cursor) or offset-based pagination (offset), but not both',
                }, ['cursor and offset parameters are mutually exclusive']);
            }
            // Validate force_refresh parameter if provided
            const forceRefreshValidation = ParameterValidator.validateBoolean(searchArgs.force_refresh, 'force_refresh', false);
            if (!forceRefreshValidation.isValid) {
                return createErrorResponse(this.name, 'Force refresh parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, forceRefreshValidation.errors);
            }
            // The box to search; searchDevices falls back to FIREWALLA_BOX_ID
            const boxValidation = ParameterValidator.validateOptionalString(searchArgs.box, 'box');
            if (!boxValidation.isValid) {
                return createErrorResponse(this.name, 'Box parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, boxValidation.errors);
            }
            const searchTools = createSearchTools(firewalla);
            const searchParams = {
                query: searchArgs.query,
                limit: validation.limit,
                offset: searchArgs.offset,
                cursor: searchArgs.cursor,
                sort_by: searchArgs.sort_by,
                sort_order: searchArgs.sort_order,
                group_by: searchArgs.group_by,
                aggregate: searchArgs.aggregate,
                time_range: searchArgs.time_range,
                force_refresh: forceRefreshValidation.sanitizedValue,
                box: boxValidation.sanitizedValue,
            };
            const result = await withToolTimeout(async () => searchTools.search_devices(searchParams), this.name);
            // Process and enrich device data with geographic information
            const deviceData = await this.enrichGeoIfNeeded(SafeAccess.safeArrayMap(result.results, (device) => ({
                id: SafeAccess.getNestedValue(device, 'id', 'unknown'),
                name: SafeAccess.getNestedValue(device, 'name', 'Unknown Device'),
                ip: SafeAccess.getNestedValue(device, 'ip', 'unknown'),
                online: SafeAccess.getNestedValue(device, 'online', false),
                macVendor: SafeAccess.getNestedValue(device, 'macVendor', 'unknown'),
                lastSeen: SafeAccess.getNestedValue(device, 'lastSeen', 0),
            })), ['ip'] // Enrich the device IP addresses
            );
            const unifiedResponseData = {
                devices: deviceData,
                count: deviceData.length,
                query_executed: SafeAccess.getNestedValue(result, 'query', ''),
                execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
                aggregations: SafeAccess.getNestedValue(result, 'aggregations', null),
                query_info: {
                    original_query: searchArgs.query,
                    // The query the devices were matched against, as query_executed
                    final_query: SafeAccess.getNestedValue(result, 'query', ''),
                    applied_filters: {
                        time_range: !!searchArgs.time_range,
                        force_refresh: !!searchArgs.force_refresh,
                        cursor_pagination: !!searchArgs.cursor,
                        offset_pagination: !!searchArgs.offset,
                    },
                },
            };
            // Return unified response
            return this.createUnifiedResponse(unifiedResponseData);
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to search devices: ${errorMessage}`, ErrorType.SEARCH_ERROR);
        }
    }
}
export class SearchTargetListsHandler extends BaseToolHandler {
    constructor() {
        // Enable field normalization for target lists (no geographic enrichment needed)
        super({
            enableGeoEnrichment: false, // Target lists don't typically contain IP addresses
            enableFieldNormalization: true, // Ensure consistent snake_case field naming across all responses
            additionalMeta: {
                data_source: 'target_lists',
                entity_type: 'target_lists',
                supports_geographic_enrichment: false,
                supports_field_normalization: true,
                standardization_version: '2.0.0',
            },
        });
        this.name = 'search_target_lists';
        this.description = 'Search target lists (convenience wrapper with client-side filtering): reads GET /v2/target-lists, sending owner if given (without it, the global and Firewalla-managed lists), and applies the query locally.';
        this.category = 'search';
    }
    async execute(args, firewalla) {
        const searchArgs = args;
        try {
            // Validate common search parameters
            const validation = validateCommonSearchParameters(searchArgs, this.name, 'target_lists', 100);
            if (!validation.isValid) {
                return validation.response;
            }
            // Sent to the API as its owner filter
            const ownerValidation = ParameterValidator.validateOptionalString(searchArgs.owner, 'owner');
            if (!ownerValidation.isValid) {
                return createErrorResponse(this.name, 'Owner parameter validation failed', ErrorType.VALIDATION_ERROR, undefined, ownerValidation.errors);
            }
            const searchTools = createSearchTools(firewalla);
            const searchParams = {
                query: searchArgs.query,
                limit: validation.limit,
                offset: searchArgs.offset,
                cursor: searchArgs.cursor,
                sort_by: searchArgs.sort_by,
                sort_order: searchArgs.sort_order,
                group_by: searchArgs.group_by,
                aggregate: searchArgs.aggregate,
                owner: ownerValidation.sanitizedValue,
            };
            const result = await withToolTimeout(async () => searchTools.search_target_lists(searchParams), this.name);
            // Create unified response with standardized target list data
            const unifiedResponseData = {
                target_lists: SafeAccess.safeArrayMap(result.results, (list) => ({
                    id: SafeAccess.getNestedValue(list, 'id', 'unknown'),
                    name: SafeAccess.getNestedValue(list, 'name', 'Unknown List'),
                    category: SafeAccess.getNestedValue(list, 'category', 'unknown'),
                    owner: SafeAccess.getNestedValue(list, 'owner', 'unknown'),
                    // The targets' length, else the API's count: it sends no
                    // targets for Firewalla-managed lists
                    entry_count: targetListEntryCount(list),
                })),
                count: SafeAccess.safeArrayAccess(result.results, arr => arr.length, 0),
                query_executed: SafeAccess.getNestedValue(result, 'query', ''),
                execution_time_ms: SafeAccess.getNestedValue(result, 'execution_time_ms', 0),
                aggregations: SafeAccess.getNestedValue(result, 'aggregations', null),
                query_info: {
                    original_query: searchArgs.query,
                    // The query the lists were matched against, as query_executed
                    final_query: SafeAccess.getNestedValue(result, 'query', ''),
                    applied_filters: {
                        grouping: !!searchArgs.group_by,
                        sorting: !!searchArgs.sort_by,
                        aggregation: !!searchArgs.aggregate,
                    },
                },
            };
            // Return unified response
            return this.createUnifiedResponse(unifiedResponseData);
        }
        catch (error) {
            if (error instanceof TimeoutError) {
                return createTimeoutErrorResponse(this.name, error.duration, error.timeoutMs);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return createErrorResponse(this.name, `Failed to search target lists: ${errorMessage}`, ErrorType.SEARCH_ERROR);
        }
    }
}
//# sourceMappingURL=search.js.map