export interface FirewallaConfig {
  mspToken: string;
  mspBaseUrl: string;
  boxId: string;
  apiTimeout: number;
  rateLimit: number;
  cacheTtl: number;
}

export interface Alarm {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  source_ip?: string;
  destination_ip?: string;
  status: 'active' | 'resolved';
}

export interface Flow {
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  bytes: number;
  packets: number;
  duration: number;
}

export interface FlowData {
  flows: Flow[];
  pagination: {
    page: number;
    total_pages: number;
    total_count: number;
  };
}

export interface Device {
  id: string;
  name: string;
  ip_address: string;
  mac_address: string;
  status: 'online' | 'offline';
  last_seen: string;
  device_type?: string;
}

export interface BandwidthUsage {
  device_id: string;
  device_name: string;
  ip_address: string;
  bytes_uploaded: number;
  bytes_downloaded: number;
  total_bytes: number;
  period: string;
}

export interface NetworkRule {
  id: string;
  name: string;
  type: string;
  action: 'allow' | 'block' | 'redirect';
  status: 'active' | 'paused' | 'disabled';
  conditions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TargetList {
  id: string;
  name: string;
  type: 'cloudflare' | 'crowdsec' | 'custom';
  entries: string[];
  last_updated: string;
}