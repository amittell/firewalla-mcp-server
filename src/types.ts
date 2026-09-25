/**
 * Transport configuration for MCP server
 * @interface TransportConfig
 */
export interface TransportConfig {
  /** Transport type: 'stdio' or 'http' (default: 'stdio') */
  type: 'stdio' | 'http';
  /** HTTP server port (default: 3000, only used when type is 'http') */
  port: number;
  /** HTTP server path (default: '/mcp', only used when type is 'http') */
  path: string;
}

/**
 * Configuration interface for Firewalla MSP API client
 * @interface FirewallaConfig
 */
export interface FirewallaConfig {
  /** MSP API access token for authentication */
  mspToken: string;
  /** MSP ID for constructing the API base URL */
  mspId: string;
  /** Full MSP base URL (alternative to mspId for direct URL specification) */
  mspBaseUrl?: string;
  /**
   * FIREWALLA_BOX_ID: scopes queries to this box and is the default box for
   * single-box operations. Optional; without it queries cover every box.
   */
  boxId?: string;
  /**
   * FIREWALLA_DEFAULT_BOX_ID: the default box for single-box operations
   * (create_rule, rename_device, get_specific_alarm, archive_alarm,
   * mute_alarm) without scoping queries
   */
  defaultBoxId?: string;
  /** API request timeout in milliseconds (default: 30000) */
  apiTimeout: number;
  /** Maximum number of API requests per minute (default: 100) */
  rateLimit: number;
  /** Cache time-to-live in seconds (default: 300) */
  cacheTtl: number;
  /** Default pagination page size (default: 100) */
  defaultPageSize: number;
  /** Maximum allowed pagination page size (default: 10000) */
  maxPageSize: number;
  /** Transport configuration for MCP server */
  transport: TransportConfig;
}

/**
 * Geographic data enrichment for IP addresses
 * @interface GeographicData
 */
export interface GeographicData {
  /** Country name (e.g., "United States") */
  country: string;
  /** Two-letter country code (e.g., "US") */
  country_code: string;
  /** Continent name (e.g., "North America") */
  continent: string;
  /** Region/state name (e.g., "California") */
  region: string;
  /** City name (e.g., "Mountain View") */
  city: string;
  /** Timezone (e.g., "America/New_York") */
  timezone: string;
  /** Autonomous System Number */
  asn?: number;
  /** Internet Service Provider name */
  isp?: string;
  /** Organization name */
  organization?: string;
  /** Hosting provider name */
  hosting_provider?: string;
  /** Whether this is a cloud provider IP */
  is_cloud_provider?: boolean;
  /** Whether this is a proxy IP */
  is_proxy?: boolean;
  /** Whether this is a VPN IP */
  is_vpn?: boolean;
  /** Geographic risk score (0-10, higher = more risk) */
  geographic_risk_score?: number;
}

/**
 * Alarm types, as the MSP API documents them (docs.firewalla.net, data
 * models, Alarm)
 * 1: Security Activity
 * 2: Abnormal Upload
 * 3: Large Bandwidth Usage
 * 4: Monthly Data Plan
 * 5: New Device
 * 6: Device Back Online
 * 7: Device Offline
 * 8: Video Activity
 * 9: Gaming Activity
 * 10: Porn Activity
 * 11: VPN Activity
 * 12: VPN Connection Restored
 * 13: VPN Connection Error
 * 14: Open Port
 * 15: Internet Connectivity Update
 * 16: Large Upload
 */
export type AlarmType =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16;

/**
 * Alarm status values
 * 1: active
 * 2: archived (see archive_alarm)
 */
export type AlarmStatus = 1 | 2;

/**
 * Common categories used across Firewalla data types
 * ad: Advertisement content
 * edu: Educational content
 * games: Gaming platforms and content
 * gamble: Gambling and betting sites
 * intel: Threat intelligence sources
 * p2p: Peer-to-peer networking
 * porn: Adult content
 * private: Private or internal traffic
 * social: Social media platforms
 * shopping: E-commerce and shopping
 * video: Video streaming services
 * vpn: Virtual private network traffic
 */
export type CategoryType =
  | 'ad'
  | 'edu'
  | 'games'
  | 'gamble'
  | 'intel'
  | 'p2p'
  | 'porn'
  | 'private'
  | 'social'
  | 'shopping'
  | 'video'
  | 'vpn';

/**
 * Security alarm/alert from Firewalla - API Compliant
 * @interface Alarm
 */
export interface Alarm {
  /** Unix timestamp of alarm generation */
  ts: number;
  /** Unique Firewalla box identifier */
  gid: string;
  /** Unique alarm identifier */
  aid: number;
  /** Alarm type (1-16) */
  type: AlarmType;
  /** Alarm status (1-2) */
  status: AlarmStatus;
  /** Readable alarm description */
  message: string;
  /** Traffic direction */
  direction: string;
  /** Transport protocol */
  protocol: string;
  /** Optional severity level */
  severity?: string;

  // Conditional properties based on alarm type
  /** Device details (when type != 4) */
  device?: {
    id: string;
    ip: string;
    name: string;
    network?: {
      id: string;
      name: string;
    };
  };
  /** Remote host details (when type in [1,2,8,9,10,16]) */
  remote?: {
    id: string;
    name: string;
    ip: string;
    /** Geographic data for remote IP (enriched) */
    geo?: GeographicData;
  };
  /** Data transfer details (when type in [2,3,4,16]) */
  transfer?: {
    download: number;
    upload: number;
    duration: number;
  };
  /** Data plan details (when type == 4) */
  dataPlan?: {
    quota: number;
    used: number;
  };
  /** VPN connection details (when type in [11,12,13]) */
  vpn?: {
    name: string;
    ip: string;
  };
  /** Port details (when type == 14) */
  port?: {
    number: number;
    protocol: 'tcp' | 'udp';
  };
  /** Internet connectivity details (when type == 15) */
  wan?: {
    status: 'connected' | 'disconnected';
    ip?: string;
  };
}

/**
 * Network flow data - Data Model Compliant
 * @interface Flow
 */
export interface Flow {
  /** Unix timestamp when flow ended */
  ts: number;
  /** Unique Firewalla box identifier */
  gid: string;
  /** Transport protocol (tcp or udp) */
  protocol: string;
  /** Traffic direction (inbound, outbound, local) */
  direction: 'inbound' | 'outbound' | 'local';
  /** Whether flow was blocked */
  block: boolean;
  /** Block type (ip or dns) */
  blockType?: 'ip' | 'dns';
  /** Bytes downloaded */
  download?: number;
  /** Bytes uploaded */
  upload?: number;
  /** Total bytes transferred (download + upload), the same as total */
  bytes?: number;
  /**
   * Total bytes transferred (download + upload). The MSP API sends it on
   * every flow; the official Flow Model does not list it (measured
   * 2026-09-25).
   */
  total?: number;
  /** Flow duration in seconds */
  duration?: number;
  /** TCP connections/UDP sessions or block count */
  count: number;
  /** Monitoring device details */
  device: {
    /** Device ID */
    id: string;
    /** Device IP */
    ip: string;
    /** Device name */
    name: string;
    /** Network information */
    network?: {
      /** Network ID */
      id: string;
      /** Network name */
      name: string;
    };
  };
  /** Source host information */
  source?: {
    /** Host ID */
    id: string;
    /** Host name */
    name: string;
    /** Host IP */
    ip: string;
    /** Geographic data for source IP (enriched) */
    geo?: GeographicData;
  };
  /** Destination host information */
  destination?: {
    /** Host ID */
    id: string;
    /** Host name */
    name: string;
    /** Host IP */
    ip: string;
    /** Geographic data for destination IP (enriched) */
    geo?: GeographicData;
  };
  /** Remote IP region (ISO 3166 code) */
  region?: string;
  /**
   * Remote IP country (ISO 3166 code). The MSP API sends it beside region;
   * the official Flow Model does not list it (measured 2026-09-25: equal to
   * region on 200 of 200 flows).
   */
  country?: string;
  /** Remote host category */
  category?: CategoryType;
  /**
   * Remote domain, e.g. "example.com" for a flow to "www.example.com". The
   * MSP API sends it on every flow, empty for a flow to a bare IP; the
   * official Flow Model does not list it (measured 2026-09-25).
   */
  domain?: string;
  /** The network the flow was on */
  network?: {
    /** Network ID */
    id: string;
    /** Network name */
    name: string;
  };
}

/**
 * One group of a grouped GET /v2/flows response. With `groupBy` the API
 * returns one item per group instead of flows: the group's fields and its
 * totals, and no `ts` or `gid` (measured 2026-09-25).
 * @interface FlowGroup
 */
export interface FlowGroup {
  /**
   * The fields that identify the group, as the API returned them, e.g.
   * `{ category: 'social' }`, `{ domain, country, region }` for `domain`,
   * `{ device: { id, ip, name, ... } }` for `device` (only `{ id }` for
   * `device,category`), or `{ gid }` for `box`
   */
  key: Record<string, unknown>;
  /** TCP connections and UDP sessions, or blocks, summed over the group */
  count: number;
  /** Bytes downloaded */
  download: number;
  /** Bytes uploaded */
  upload: number;
  /** Bytes transferred (download + upload) */
  total: number;
}

/**
 * One group of a grouped GET /v2/alarms response: the group's fields and
 * its alarm count, with no `ts`, `aid` or `message` (measured 2026-09-25)
 * @interface AlarmGroup
 */
export interface AlarmGroup {
  /**
   * The fields that identify the group, as the API returned them, e.g.
   * `{ type: 8 }`, `{ type: 8, gid }` for `type,box`, or
   * `{ device: { id } }` for `device`
   */
  key: Record<string, unknown>;
  /** Alarms in the group */
  count: number;
}

/**
 * Paginated network flow data response
 * @interface FlowData
 * @deprecated Consider using StandardPaginatedResponse<Flow> for consistent pagination
 */
export interface FlowData {
  /** Array of network flows */
  flows: Flow[];
  /** Pagination information */
  pagination: {
    /** Cursor for next page of results */
    next_cursor?: string;
    /** Whether there are more pages */
    has_more: boolean;
  };
}

/**
 * Network device managed by Firewalla - Data Model Compliant
 * @interface Device
 */
export interface Device {
  /** Unique identifier for the device (MAC address, ovpn:, wg_peer:) */
  id: string;
  /** Firewalla box GID the device connects to */
  gid: string;
  /** Human-readable name of the device */
  name: string;
  /** IP address assigned to the device */
  ip: string;
  /** MAC address of the device */
  mac?: string;
  /** MAC vendor registered to the MAC address */
  macVendor?: string;
  /** Current connectivity status */
  online: boolean;
  /** Timestamp when device was last seen (unix timestamp) */
  lastSeen?: number;
  /** Whether IP is reserved on the box */
  ipReserved: boolean;
  /** Network where device flows were captured */
  network: {
    /** Unique network identifier */
    id: string;
    /** Network name */
    name: string;
  };
  /** Device group (optional) */
  group?: {
    /** Unique group identifier */
    id: string;
    /** Group name */
    name: string;
  };
  /** Total downloads in bytes (last 24 hours) */
  totalDownload: number;
  /** Total uploads in bytes (last 24 hours) */
  totalUpload: number;
}

/**
 * Bandwidth usage statistics for a device
 * @interface BandwidthUsage
 */
export interface BandwidthUsage {
  /** Unique identifier for the device */
  device_id: string;
  /** Human-readable name of the device */
  device_name: string;
  /** IP address of the device */
  ip: string;
  /** Total bytes uploaded by the device */
  bytes_uploaded: number;
  /** Total bytes downloaded by the device */
  bytes_downloaded: number;
  /** Total bytes transferred (upload + download) */
  total_bytes: number;
  /** Time period for this usage data (e.g., '24h', '7d') */
  period: string;
}

/**
 * Firewall rule configuration - Data Model Compliant
 * @interface NetworkRule
 */
export interface NetworkRule {
  /** Unique identifier for the rule */
  id: string;
  /** Action to take when rule matches */
  action: 'allow' | 'block' | 'timelimit';
  /** Target configuration */
  target: {
    /** Target type */
    type: string;
    /** Target descriptor */
    value: string;
    /** Optional DNS-only blocking */
    dnsOnly?: boolean;
    /** Optional port specification */
    port?: string;
  };
  /** Traffic direction */
  direction: 'bidirection' | 'inbound' | 'outbound';
  /** Optional Firewalla box ID */
  gid?: string;
  /** Optional box group ID */
  group?: string;
  /** Scope configuration */
  scope?: {
    /** Scope type */
    type: string;
    /** Scope descriptor */
    value: string;
    /** Optional port specification */
    port?: string;
  };
  /** Optional readable notes */
  notes?: string;
  /** Optional rule status */
  status?: 'active' | 'paused';
  /** Rule hit statistics */
  hit?: {
    /** Number of rule hits */
    count: number;
    /** Timestamp of last hit */
    lastHitTs: number;
    /** Optional reset timestamp */
    statsResetTs?: number;
  };
  /** Schedule configuration */
  schedule?: {
    /** Activation time in seconds */
    duration: number;
    /** Optional cron-style activation time */
    cronTime?: string;
  };
  /** Time usage configuration */
  timeUsage?: {
    /** Time usage quota in minutes */
    quota: number;
    /** Time used in minutes */
    used: number;
  };
  /** Optional protocol specification */
  protocol?: 'tcp' | 'udp';
  /** Rule creation timestamp */
  ts: number;
  /** Last update timestamp */
  updateTs: number;
  /** Optional auto-resume timestamp */
  resumeTs?: number;
}

/**
 * Security target list - Data Model Compliant
 * @interface TargetList
 */
export interface TargetList {
  /** Unique identifier for the target list (immutable, system-generated) */
  id: string;
  /** Target list name (required, max 24 characters) */
  name: string;
  /** Owner (required, immutable, either 'global' or box gid) */
  owner: string;
  /** List of domains, IPs, IP ranges */
  targets: string[];
  /**
   * Number of entries. GET /v2/target-lists returns it on every list, and
   * returns no `targets` for Firewalla-managed lists (measured 2026-09-25).
   */
  count?: number;
  /** Optional category */
  category?: CategoryType;
  /** Optional additional description */
  notes?: string;
  /** Unix timestamp (immutable) */
  lastUpdated: number;
}

/**
 * Trend data point - Data Model Compliant
 * @interface Trend
 */
export interface Trend {
  /** Unix timestamp associated with the data point */
  ts: number;
  /** The actual data point in the time series */
  value: number;
}

/** Periods the trend tools accept */
export type TrendPeriod = '1h' | '24h' | '7d' | '30d';

/** The box types of GET /v2/stats/{type} */
export type BoxStatisticType =
  'topBoxesByBlockedFlows' | 'topBoxesBySecurityAlarms';

/**
 * A daily series from /v2/trends/{flows,alarms,rules}, cut to the days that
 * overlap the requested period. The API has one point per day for the last
 * 30 days; each point's ts is the start of its day.
 * @interface TrendSeries
 */
export interface TrendSeries {
  count: number;
  results: Trend[];
  next_cursor?: string;
  /** Where the points came from, e.g. "GET /v2/trends/alarms" */
  source: string;
  /** What the counts cover: "all boxes", "box group <id>" or "box <gid>" */
  scope: string;
  /** Always "day": the trends API has no finer resolution */
  interval: 'day';
  /** Start of the first returned day (Unix seconds), if any */
  window_start?: number;
  /** When the series was read (Unix seconds); the last day runs to here */
  window_end: number;
  /** True when the last point is a day still in progress */
  last_point_partial: boolean;
  /** How the numbers were produced, when that is not obvious */
  note?: string;
}

/**
 * Security counts for the prompts and the security metrics resource. Each
 * count covers the window named in `windows`; a count named in
 * `lower_bounds` is only a floor.
 * @interface SecurityMetricsSummary
 */
export interface SecurityMetricsSummary {
  /** Alarms in the API's default alarm window (the last 30 days) */
  total_alarms: number;
  /** Of those, alarms with status 1 (active) */
  active_alarms: number;
  /** Blocked flows in the API's default flow window (the last 24 hours) */
  blocked_connections: number;
  /** Alarms of any type in the last 24 hours */
  suspicious_activities: number;
  /** Security Activity (type 1) alarms in the last 24 hours */
  security_alarms: number;
  /** From security_alarms: low 0-1, medium 2-5, high 6-10, critical 11+ */
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  /** Time of the newest Security Activity alarm in the last 30 days */
  last_threat_detected: string | null;
  /** The window each count covers */
  windows: Record<
    | 'total_alarms'
    | 'active_alarms'
    | 'blocked_connections'
    | 'suspicious_activities'
    | 'security_alarms',
    string
  >;
  /** Counts the API did not total, so the client counted one page of rows */
  lower_bounds: string[];
}

/**
 * Statistics data - Data Model Compliant
 * @interface Statistics
 */
export interface Statistics {
  /** Region or Box metadata */
  meta: Region | Box;
  /** Statistic's numeric value */
  value: number;
}

/**
 * Region object for statistics
 * @interface Region
 */
export interface Region {
  /** 2-letter ISO 3166 country code */
  code: string;
}

/**
 * Box object for statistics and general use - Data Model Compliant
 * @interface Box
 */
export interface Box {
  /** Unique box identifier */
  gid: string;
  /** Box display name */
  name: string;
  /** Box model */
  model: string;
  /** Monitoring mode */
  mode: 'router' | 'bridge' | 'dhcp' | 'simple';
  /** Firewalla software version */
  version: string;
  /** Box online status */
  online: boolean;
  /** Timestamp of last online time (Unix timestamp) */
  lastSeen?: number;
  /** Box license code */
  license: string;
  /** Public IP address */
  publicIP: string;
  /** Group ID (nullable) */
  group?: string;
  /** Geographical location based on public IP */
  location: string;
  /** Number of devices on box */
  deviceCount: number;
  /** Number of rules on box */
  ruleCount: number;
  /** Number of alarms on box */
  alarmCount: number;
}

/**
 * One box in the firewall summary, from the MSP /v2/boxes endpoint
 * @interface BoxSummary
 */
export interface BoxSummary {
  gid: string;
  name: string;
  model: string;
  online: boolean;
  /** Unix seconds when the box was last seen online, when the API reports it */
  last_seen?: number;
  device_count: number;
  alarm_count: number;
  rule_count: number;
}

/**
 * Firewall status built from /v2/boxes and a sample of recent flows. The MSP
 * API reports no CPU, memory or uptime figures, so the summary has none.
 * @interface FirewallSummary
 */
export interface FirewallSummary {
  /**
   * online: every box in scope is online; partial: some are; offline: none
   * are; unknown: no boxes are visible to the token
   */
  status: 'online' | 'partial' | 'offline' | 'unknown';
  /** The FIREWALLA_BOX_ID box, or every box on the account */
  boxes: BoxSummary[];
  boxes_online: number;
  boxes_total: number;
  /** Number of recent flows the blocked count was taken from */
  recent_flows_sampled: number;
  /** Blocked flows among the sampled recent flows */
  blocked_in_sample: number;
  last_updated: string;
}

/**
 * Simple statistics interface
 * @interface SimpleStats
 */
export interface SimpleStats {
  /** Count of currently online Firewalla boxes */
  onlineBoxes: number;
  /** Count of currently offline Firewalla boxes */
  offlineBoxes: number;
  /** Total number of generated alarms */
  alarms: number;
  /** Total number of created rules */
  rules: number;
}

/**
 * Advanced search query interface for complex filtering
 * @interface SearchQuery
 */
export interface SearchQuery {
  /** Raw query string using advanced syntax */
  query: string;
  /** Optional field to group results by */
  group_by?: string;
  /** Sort field and direction (e.g., "ts:desc", "severity:asc") */
  sort_by?: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Pagination cursor for next page */
  cursor?: string;
  /** Whether to include aggregation statistics */
  aggregate?: boolean;
}

/**
 * Search filter for specific field filtering
 * @interface SearchFilter
 */
export interface SearchFilter {
  /** Field name to filter on */
  field: string;
  /** Operator for comparison */
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'nin'
    | 'contains'
    | 'startswith'
    | 'endswith'
    | 'regex'
    | 'range';
  /** Value(s) to filter against */
  value: string | number | boolean | Array<string | number | boolean>;
}

/**
 * Search options for advanced search operations
 * @interface SearchOptions
 */
export interface SearchOptions {
  /** Array of filters to apply */
  filters?: SearchFilter[];
  /** Time range for search */
  time_range?: {
    /** Start time (ISO 8601 or Unix timestamp) */
    start: string | number;
    /** End time (ISO 8601 or Unix timestamp) */
    end: string | number;
  };
  /** Fields to include in results (for projection) */
  include_fields?: string[];
  /** Fields to exclude from results */
  exclude_fields?: string[];
  /** Whether to include resolved/inactive items */
  include_resolved?: boolean;
  /** Minimum hit count for rules */
  min_hits?: number;
  /** Minimum number of targets in list (for target lists) */
  min_targets?: number;
  /** Filter by categories (for target lists) */
  categories?: string[];
  /** Filter by owners (for target lists) */
  owners?: string[];
  /** Box gid to search the devices of (for devices; default FIREWALLA_BOX_ID) */
  box?: string;
}

/**
 * Search result wrapper with metadata
 * @interface SearchResult
 */
export interface SearchResult<T> {
  /** Total count of matching items */
  count: number;
  /** Array of result items */
  results: T[];
  /** Pagination cursor for next page */
  next_cursor?: string;
  /** Aggregation results if requested */
  aggregations?: Record<
    string,
    number | string | boolean | Record<string, unknown>
  >;
  /** Search metadata */
  metadata?: {
    /** Query execution time in milliseconds */
    execution_time?: number;
    /** Whether results are from cache */
    cached?: boolean;
    /** Applied filters summary */
    filters_applied?: string[];
  };
}

/**
 * Cross-reference search result for correlation queries
 * @interface CrossReferenceResult
 */
export interface CrossReferenceResult {
  /** Primary search results */
  primary: SearchResult<any>;
  /** Secondary search results correlated with primary */
  secondary: Record<string, SearchResult<any>>;
  /** Correlation statistics */
  correlations: {
    /** Field used for correlation */
    correlation_field: string;
    /** Number of correlated items */
    correlated_count: number;
    /** Correlation strength (0-1) */
    correlation_strength?: number;
  };
}

/**
 * Standard response type definitions for response format standardization
 *
 * Defines consistent response structures across all MCP tools with enhanced
 * metadata and backward compatibility support.
 */

/**
 * Category of response indicating the type of operation
 */
export type ResponseCategory =
  | 'search'
  | 'paginated'
  | 'statistical'
  | 'correlation'
  | 'status';

/**
 * Base metadata included in all standardized responses
 */
export interface BaseResponseMetadata {
  /** Query execution time in milliseconds */
  execution_time_ms: number;

  /** Whether the response was served from cache */
  cached: boolean;

  /** Entity type being returned (flows, alarms, devices, etc.) */
  entity_type: string;

  /** Response category */
  category: ResponseCategory;

  /** Timestamp when response was generated */
  generated_at: string;
}

/**
 * Search-specific metadata for search operations
 */
export interface SearchMetadata {
  /** Original query that was executed */
  query: string;

  /** Entity type being searched */
  entityType: string;

  /** Query execution time in milliseconds */
  executionTime: number;

  /** Whether the response was served from cache */
  cached: boolean;

  /** Pagination cursor for next page */
  cursor?: string;

  /** Whether there are more results available */
  hasMore?: boolean;

  /** Limit applied to the search */
  limit?: number;

  /** Aggregation results */
  aggregations?: Record<string, any>;

  /** Total number of possible results (before limit applied) */
  totalPossible?: number;

  /** Search strategy used (optimized, full_scan, cached) */
  strategy?: 'optimized' | 'full_scan' | 'cached';

  /** Applied optimizations */
  optimizations?: string[];
}

/**
 * Pagination metadata for paginated responses
 */
export interface PaginationMetadata {
  /** Cursor for next page of results */
  cursor?: string;

  /** Whether there are more results available */
  hasMore?: boolean;

  /** Number of results requested (limit parameter) */
  limit?: number;

  /** Query execution time in milliseconds */
  executionTime?: number;

  /** Whether the response was served from cache */
  cached?: boolean;

  /** Source of the data */
  source?: string;

  /** Query parameters used */
  queryParams?: Record<string, any>;

  /** Offset for pagination */
  offset?: number;

  /** Total count of items available */
  totalCount?: number;

  /** Actual number of results returned */
  results_returned?: number;

  /** Total number of pages (if calculable) */
  total_pages?: number;

  /** Current page number (if applicable) */
  current_page?: number;
}

/**
 * Statistical metadata for analytics responses
 */
export interface StatisticalMetadata {
  /** Analysis period */
  period?: string;

  /** Start time for analysis */
  startTime?: string;

  /** End time for analysis */
  endTime?: string;

  /** Total items analyzed */
  totalAnalyzed?: number;

  /** Analysis criteria */
  criteria?: Record<string, any>;

  /** Query execution time in milliseconds */
  executionTime?: number;

  /** Whether the response was served from cache */
  cached?: boolean;

  /** Statistical results */
  statistics?: Record<string, any>;
}

/**
 * Standard response format for search operations
 */
export interface StandardSearchResponse<T> {
  /** Array of search results */
  results: T[];

  /** Total count of results returned */
  count: number;

  /** Query that was executed */
  query_executed?: string;

  /** Entity type being returned */
  entity_type?: string;

  /** Execution time in milliseconds */
  execution_time_ms?: number;

  /** Whether response was cached */
  cached?: boolean;

  /** Pagination information (if applicable) */
  pagination?: {
    cursor?: string;
    has_more?: boolean;
    limit_applied?: number;
    offset?: number;
  };

  /** Search metadata with enhanced information */
  search_metadata?: {
    total_possible_results?: number;
    search_strategy?: 'optimized' | 'full_scan' | 'cached';
    optimizations_applied?: string[];
    query_complexity?: 'simple' | 'medium' | 'complex';
  };

  /** Aggregation results */
  aggregations?: Record<string, any>;
}

/**
 * Standard response format for paginated data retrieval
 */
export interface StandardPaginatedResponse<T> {
  /** Array of paginated results */
  results: T[];

  /** Total count of results returned */
  count: number;

  /** Pagination information */
  pagination?: {
    cursor?: string;
    has_more?: boolean;
    limit_applied?: number;
    offset?: number;
  };

  /** Optional query parameters that were used */
  query_parameters?: Record<string, any>;

  /** Execution time in milliseconds */
  execution_time_ms?: number;

  /** Whether response was cached */
  cached?: boolean;

  /** Data source identifier */
  data_source?: string;

  /** Total count of items available */
  total_count?: number;
}

/**
 * Standard response format for statistical/analytics operations
 */
export interface StandardStatisticalResponse<T> {
  /** Statistical results or aggregated data */
  results: T[];

  /** Total count of results */
  count: number;

  /** Analysis configuration */
  analysis?: {
    period?: string;
    start_time?: string;
    end_time?: string;
    total_analyzed?: number;
    criteria?: Record<string, any>;
  };

  /** Execution time in milliseconds */
  execution_time_ms?: number;

  /** Whether response was cached */
  cached?: boolean;

  /** Statistical results */
  statistics?: Record<string, any>;

  /** Summary statistics */
  summary?: {
    /** Total value across all results */
    total?: number;

    /** Average value */
    average?: number;

    /** Minimum value */
    min?: number;

    /** Maximum value */
    max?: number;

    /** Standard deviation */
    std_dev?: number;
  };
}

/**
 * Correlation-specific metadata for cross-reference operations
 */
export interface CorrelationMetadata extends BaseResponseMetadata {
  /** Fields used for correlation */
  correlation_fields: string[];

  /** Type of correlation performed */
  correlation_type: 'AND' | 'OR';

  /** Number of entities correlated */
  correlated_entities: number;

  /** Correlation strength (0.0 - 1.0) */
  correlation_strength?: number;

  /** Minimum confidence score applied */
  minimum_confidence?: number;

  /** Whether fuzzy matching was enabled */
  fuzzy_matching_enabled?: boolean;
}

/**
 * Standard response format for correlation operations
 */
export interface StandardCorrelationResponse {
  /** Primary search results */
  primary_results: any[];

  /** Secondary correlated results */
  secondary_results: Record<string, any[]>;

  /** Correlation metadata */
  correlation_metadata: CorrelationMetadata;

  /** Correlation statistics */
  correlation_stats: {
    /** Total correlations found */
    total_correlations: number;

    /** High confidence correlations (≥0.8) */
    high_confidence_correlations: number;

    /** Medium confidence correlations (≥0.5) */
    medium_confidence_correlations: number;

    /** Low confidence correlations (<0.5) */
    low_confidence_correlations: number;
  };
}

/**
 * Union type for all standard response formats
 */
export type StandardResponse<T> =
  | StandardSearchResponse<T>
  | StandardPaginatedResponse<T>
  | StandardStatisticalResponse<T>
  | StandardCorrelationResponse;

/**
 * Legacy response format mapping for backward compatibility
 */
export interface LegacyResponseMapping {
  /** Map standard field names to legacy field names */
  fieldMapping: Record<string, string>;

  /** Fields to exclude from legacy response */
  excludeFields: string[];

  /** Additional legacy fields to include */
  additionalFields: Record<string, any>;
}

/**
 * Configuration for response format transformation
 */
export interface ResponseTransformConfig {
  /** Whether to use standard format */
  useStandardFormat: boolean;

  /** Legacy mapping configuration */
  legacyMapping?: LegacyResponseMapping;

  /** Whether to include metadata in legacy format */
  includeMetadataInLegacy: boolean;

  /** Metadata fields to include in legacy format */
  legacyMetadataFields?: string[];
}

/**
 * Data Validation and Normalization Types
 * Re-exported from data validation utilities for convenience
 */

// Re-export validation types from data-validator module
export type {
  TypeValidationResult,
  ValidationResult,
} from './utils/data-validator.js';

/**
 * Configuration for data normalization behavior
 */
export interface NormalizationConfig {
  /** Default value to use when normalizing unknown fields */
  defaultUnknownValue: string;
  /** Whether to preserve null values or convert them */
  preserveNull: boolean;
  /** Whether to convert empty strings to null */
  emptyStringToNull: boolean;
  /** Whether to trim whitespace from string values */
  trimStrings: boolean;
}

/**
 * Result of field value sanitization
 */
export interface SanitizationResult {
  /** The sanitized value */
  value: any;
  /** Whether the value was modified during sanitization */
  wasModified: boolean;
  /** Description of what was modified, if any */
  modifications: string[];
}

/**
 * UNIFIED RESPONSE FORMAT FOR MCP TOOLS
 *
 * Enforces extreme consistency across all MCP tool responses with:
 * - Consistent success/error structure
 * - Automatic snake_case field normalization
 * - Geographic enrichment metadata
 * - Execution tracking and request identification
 */

/**
 * Unified response interface for all MCP tools
 * Replaces ad-hoc response formats with consistent structure
 */
export interface ToolResponseUnified<T = any> {
  /** Whether the operation was successful */
  success: true;

  /** The actual data payload (automatically normalized to snake_case) */
  data: T;

  /** Standardized metadata for all responses */
  meta: {
    /** Unique request identifier for tracking */
    request_id: string;

    /** Execution time in milliseconds */
    execution_time_ms: number;

    /** Handler name that generated this response */
    handler: string;

    /** Timestamp when response was generated (ISO 8601) */
    timestamp: string;

    /** Number of results returned (for arrays) */
    count?: number;

    /** Whether geographic enrichment was applied */
    geo_enriched?: boolean;

    /** Whether field normalization was applied */
    field_normalized?: boolean;

    /** Cache status */
    cached?: boolean;

    /** Data source identifier */
    data_source?: string;

    /** Additional handler-specific metadata */
    [key: string]: any;
  };
}
