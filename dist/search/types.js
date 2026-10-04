/**
 * Search API type definitions for Firewalla MCP Server
 * Defines query AST nodes, search parameters, and result structures
 */
export const TokenType = {
    FIELD: 'FIELD',
    VALUE: 'VALUE',
    QUOTED_VALUE: 'QUOTED_VALUE',
    OPERATOR: 'OPERATOR',
    LOGICAL: 'LOGICAL',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    COLON: 'COLON',
    WILDCARD: 'WILDCARD',
    TO: 'TO',
    EOF: 'EOF',
};
/**
 * Supported search fields by entity type
 */
export const SEARCH_FIELDS = {
    flows: [
        'ts', // MSP API timestamp qualifier: ts:<epoch>, ts:>=<epoch>, ts:<start>-<end>
        'source_ip',
        'destination_ip',
        'protocol',
        'port',
        'direction',
        'blocked',
        'bytes',
        'download',
        'upload',
        'duration',
        'timestamp',
        'device_ip',
        'device_id',
        'region',
        'category',
        'domain', // MSP flow qualifier: the root domain, domain:example.com (*.example.com matches nothing)
        'status', // MSP flow qualifier: status:blocked, status:ok
        'total', // MSP flow qualifier: total:>1MB (download + upload)
        'sport', // MSP flow qualifiers: source and destination port
        'dport',
        'block', // block:true and block:false are sent as status:blocked
        // Enhanced geographic fields
        'country',
        'country_code',
        'continent',
        'city',
        'timezone',
        'isp',
        'organization',
        'hosting_provider',
        'asn',
        'is_cloud_provider',
        'is_cloud',
        'is_proxy',
        'is_vpn',
        'geographic_risk_score',
        'geo_location',
        // Application-level fields
        'user_agent',
        'application',
        'application_category',
        'domain_category',
        'ssl_subject',
        'ssl_issuer',
        // Behavioral pattern fields
        'session_duration',
        'frequency_score',
        'bytes_per_session',
        'connection_pattern',
        'activity_level',
    ],
    alarms: [
        'ts',
        'severity',
        'type',
        'source_ip',
        'destination_ip',
        'remote_ip',
        'device_ip',
        'protocol',
        'port',
        'timestamp',
        'status',
        'direction',
        'description',
        'message',
        'region', // MSP alarm alias for remote.region
        // Enhanced geographic fields
        'country',
        'country_code',
        'continent',
        'city',
        'remote_country',
        'remote_continent',
        'timezone',
        'isp',
        'organization',
        'hosting_provider',
        'asn',
        'is_cloud_provider',
        'is_proxy',
        'is_vpn',
        'geographic_risk_score',
        'geo_risk_score',
        'geo_location',
        // Application-level fields
        'user_agent',
        'application',
        'application_category',
        'domain_category',
        'ssl_subject',
        'ssl_issuer',
        // Behavioral pattern fields
        'session_duration',
        'frequency_score',
        'bytes_per_session',
        'connection_pattern',
        'activity_level',
    ],
    rules: [
        'id',
        'name',
        'description',
        'action',
        'target_type',
        'target.type', // User-friendly alias for target_type
        'target_value',
        'target.value', // User-friendly alias for target_value
        'direction',
        'status',
        'category',
        'hit_count',
        'last_hit',
        'enabled',
        'created_at',
        'updated_at',
        // MSP rule qualifiers and Rule model property paths
        'box.id',
        'box.group.id',
        'device.id',
        'protocol',
        'notes',
        'scope.type',
    ],
    // The fields search_devices matches (client.searchDevices), and no
    // others. The matcher reads none of device_type, os, last_seen,
    // bandwidth_usage, connection_count, total_download and total_upload, and
    // searched such a term as literal text, so os:linux matched no device and
    // NOT os:linux every one; total_download:>1000 was refused for its '>'
    // on a "non-numeric field", not as a field the search does not read
    devices: [
        'id',
        'gid', // Device model box ID, filtered client-side like network.name and group.name
        'name',
        'ip',
        'mac',
        'mac_vendor',
        'online',
        'network_name', // network.name
        'network.name',
        'group_name', // group.name
        'group.name',
    ],
    // targets and notes: the query fields the search_target_lists schema lists
    target_lists: [
        'name',
        'owner',
        'category',
        'targets',
        'notes',
        'target_count',
        'last_updated',
    ],
};
//# sourceMappingURL=types.js.map