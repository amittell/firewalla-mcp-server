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
  /** Unique identifier for the Firewalla box/device */
  boxId: string;
  /** API request timeout in milliseconds (default: 30000) */
  apiTimeout: number;
  /** Maximum number of API requests per minute (default: 100) */
  rateLimit: number;
  /** Cache time-to-live in seconds (default: 300) */
  cacheTtl: number;
}

/**
 * Security alarm/alert from Firewalla
 * @interface Alarm
 */
export interface Alarm {
  /** Unique identifier for the alarm */
  id: string;
  /** ISO 8601 timestamp when the alarm was triggered */
  timestamp: string;
  /** Severity level of the alarm */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Type/category of the alarm (e.g., 'intrusion', 'malware') */
  type: string;
  /** Human-readable description of the alarm */
  description: string;
  /** Source IP address (if applicable) */
  source_ip?: string;
  /** Destination IP address (if applicable) */
  destination_ip?: string;
  /** Current status of the alarm */
  status: 'active' | 'resolved';
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
  blockType?: string;
  /** Bytes downloaded */
  download?: number;
  /** Bytes uploaded */
  upload?: number;
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
  };
  /** Destination host information */
  destination?: {
    /** Host ID */
    id: string;
    /** Host name */
    name: string;
    /** Host IP */
    ip: string;
  };
  /** Remote IP region (ISO 3166 code) */
  region?: string;
  /** Remote host category */
  category?: 'ad' | 'edu' | 'games' | 'gamble' | 'intel' | 'p2p' | 'porn' | 'private' | 'social' | 'shopping' | 'video' | 'vpn';
}

/**
 * Paginated network flow data response
 * @interface FlowData
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
  /** MAC vendor registered to the MAC address */
  macVendor?: string;
  /** Current connectivity status */
  online: boolean;
  /** Unix timestamp when device was last seen */
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
  ip_address: string;
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
  /** Optional category */
  category?: 'ad' | 'edu' | 'games' | 'gamble' | 'intel' | 'p2p' | 'porn' | 'private' | 'social' | 'shopping' | 'video' | 'vpn';
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
  /** Unix timestamp of last online time */
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