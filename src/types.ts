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
 * Network flow data representing a connection between two endpoints
 * @interface Flow
 */
export interface Flow {
  /** ISO 8601 timestamp when the flow started */
  timestamp: string;
  /** Source IP address */
  source_ip: string;
  /** Destination IP address */
  destination_ip: string;
  /** Source port number */
  source_port: number;
  /** Destination port number */
  destination_port: number;
  /** Protocol used (TCP, UDP, etc.) */
  protocol: string;
  /** Total bytes transferred */
  bytes: number;
  /** Total packets transferred */
  packets: number;
  /** Duration of the flow in seconds */
  duration: number;
  /** Bytes uploaded from source to destination */
  bytes_uploaded?: number;
  /** Bytes downloaded from destination to source */
  bytes_downloaded?: number;
  /** Source device information */
  source_device?: {
    /** Device ID/MAC address */
    id?: string;
    /** Device name */
    name?: string;
    /** Device type */
    type?: string;
  };
  /** Destination device information */
  destination_device?: {
    /** Device ID/MAC address */
    id?: string;
    /** Device name */
    name?: string;
    /** Service name (if known) */
    service?: string;
  };
  /** Traffic direction from perspective of monitored network */
  direction?: 'inbound' | 'outbound' | 'internal';
  /** Application or service identification */
  application?: string;
  /** Connection state (for TCP) */
  connection_state?: 'established' | 'syn' | 'fin' | 'reset' | 'closed';
  /** Geographic location of destination IP */
  geo_location?: {
    /** Country code */
    country?: string;
    /** City name */
    city?: string;
    /** ASN (Autonomous System Number) */
    asn?: string;
  };
  /** Security classification */
  threat_level?: 'safe' | 'suspicious' | 'malicious';
  /** Additional metadata from the API */
  metadata?: Record<string, unknown>;
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
 * Network device managed by Firewalla
 * @interface Device
 */
export interface Device {
  /** Unique identifier for the device */
  id: string;
  /** Human-readable name of the device */
  name: string;
  /** IP address assigned to the device */
  ip_address: string;
  /** MAC address of the device */
  mac_address: string;
  /** Current connectivity status */
  status: 'online' | 'offline';
  /** ISO 8601 timestamp when device was last seen */
  last_seen: string;
  /** Type of device (e.g., 'laptop', 'phone', 'iot') */
  device_type?: string;
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
 * Firewall rule configuration
 * @interface NetworkRule
 */
export interface NetworkRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name of the rule */
  name: string;
  /** Type of rule (e.g., 'firewall', 'family') */
  type: string;
  /** Action to take when rule matches */
  action: 'allow' | 'block' | 'redirect';
  /** Current status of the rule */
  status: 'active' | 'paused' | 'disabled';
  /** Rule conditions and parameters */
  conditions: Record<string, unknown>;
  /** ISO 8601 timestamp when rule was created */
  created_at: string;
  /** ISO 8601 timestamp when rule was last updated */
  updated_at: string;
}

/**
 * Security target list (blocklist/allowlist)
 * @interface TargetList
 */
export interface TargetList {
  /** Unique identifier for the target list */
  id: string;
  /** Human-readable name of the target list */
  name: string;
  /** Source/type of the target list */
  type: 'cloudflare' | 'crowdsec' | 'custom';
  /** Array of IP addresses, domains, or other identifiers */
  entries: string[];
  /** ISO 8601 timestamp when list was last updated */
  last_updated: string;
}