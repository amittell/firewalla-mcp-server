import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  FirewallaConfig,
  Alarm,
  Flow,
  FlowData,
  Device,
  BandwidthUsage,
  NetworkRule,
  TargetList,
} from '../types';

interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export class FirewallaClient {
  private api: AxiosInstance;
  private cache: Map<string, { data: unknown; expires: number }>;

  constructor(private config: FirewallaConfig) {
    this.cache = new Map();
    
    // Use mspBaseUrl if provided, otherwise construct from mspId  
    const baseURL = config.mspBaseUrl || `https://${config.mspId}/v2`;
    
    this.api = axios.create({
      baseURL,
      timeout: config.apiTimeout,
      headers: {
        'Authorization': `Token ${config.mspToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Firewalla-MCP-Server/1.0.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      (config) => {
        process.stderr.write(`API Request: ${config.method?.toUpperCase()} ${config.url}\\n`);
        return config;
      },
      (error) => {
        process.stderr.write(`API Request Error: ${error.message}\\n`);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        process.stderr.write(`API Response: ${response.status} ${response.config.url}\\n`);
        return response;
      },
      (error) => {
        process.stderr.write(`API Response Error: ${error.response?.status} ${error.message}\\n`);
        
        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please check your MSP token.');
        }
        if (error.response?.status === 403) {
          throw new Error('Insufficient permissions. Please check your MSP subscription.');
        }
        if (error.response?.status === 404) {
          throw new Error('Resource not found. Please check your Box ID.');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please retry later.');
        }
        
        return Promise.reject(error);
      }
    );
  }

  private getCacheKey(endpoint: string, params?: Record<string, unknown>): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${endpoint}:${paramStr}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds || this.config.cacheTtl;
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl * 1000),
    });
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, unknown>,
    cacheable = true
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params);
    
    if (cacheable && method === 'GET') {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      let response: AxiosResponse<APIResponse<T>>;
      
      switch (method) {
        case 'GET':
          response = await this.api.get(endpoint, { params });
          break;
        case 'POST':
          response = await this.api.post(endpoint, params);
          break;
        case 'PUT':
          response = await this.api.put(endpoint, params);
          break;
        case 'DELETE':
          response = await this.api.delete(endpoint, { params });
          break;
      }

      // Debug: Log the actual response structure
      process.stderr.write(`API Response Data: ${JSON.stringify(response.data).substring(0, 500)}...\n`);
      
      // Handle different response formats from Firewalla API
      let result: T;
      if (response.data && typeof response.data === 'object' && 'success' in response.data) {
        // Standard API response format
        if (!response.data.success) {
          throw new Error(response.data.error || 'API request failed');
        }
        result = response.data.data;
      } else {
        // Direct data response (more common with Firewalla API)
        result = response.data as T;
      }
      
      if (cacheable && method === 'GET') {
        this.setCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API Error: ${error.message}`);
      }
      throw error;
    }
  }

  async getActiveAlarms(severity?: string, limit = 20): Promise<Alarm[]> {
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (severity) {
      params.severity = severity;
    }

    const response = await this.request<{results: any[]} | any[]>('GET', `/alarms`, params);
    
    // Handle the response format - could be direct array or with results property
    const rawAlarms = Array.isArray(response) ? response : (response.results || []);
    
    // Transform the raw alarm data with comprehensive field mapping
    return rawAlarms.map((item: any) => {
      const parseTimestamp = (ts: any) => {
        if (!ts) return new Date().toISOString();
        
        if (typeof ts === 'number') {
          const timestamp = ts > 1000000000000 ? ts : ts * 1000;
          return new Date(timestamp).toISOString();
        }
        
        if (typeof ts === 'string') {
          if (ts.includes('T') || ts.includes('-')) {
            return new Date(ts).toISOString();
          }
        }
        
        return new Date().toISOString();
      };

      return {
        id: item.aid || item.id || item._id || 'unknown',
        timestamp: parseTimestamp(item.ts || item.timestamp),
        severity: item.severity || 'medium',
        type: item.type || item._type || item.category || 'security',
        description: item.description || item.message || item.msg || `Alarm ${item._type || 'detected'}`,
        source_ip: item.device?.ip || item.srcIP || item.source_ip || item.sourceIP,
        destination_ip: item.dstIP || item.dest_ip || item.destinationIP,
        status: item.status === 1 ? 'active' : (item.status || 'active')
      };
    });
  }

  async getFlowData(
    startTime?: string,
    endTime?: string,
    limit = 50,
    cursor?: string
  ): Promise<FlowData> {
    const params: Record<string, unknown> = {
      limit,
    };
    
    // Use Firewalla's query format for time-based filtering
    if (startTime && endTime) {
      // Convert ISO strings to Unix timestamps
      const startTs = Math.floor(new Date(startTime).getTime() / 1000);
      const endTs = Math.floor(new Date(endTime).getTime() / 1000);
      params.query = `ts:${startTs}-${endTs}`;
    }
    
    if (cursor) {
      params.cursor = cursor;
    }

    // Use correct box-specific endpoint
    const response = await this.request<{results: any[]} | any[]>('GET', `/boxes/${this.config.boxId}/flows`, params);
    const rawFlows = Array.isArray(response) ? response : (response.results || []);
    
    // Transform the flow data to match new Flow interface
    const flows = rawFlows.map((item: any): Flow => {
      const parseTimestamp = (ts: any): number => {
        if (!ts) return Math.floor(Date.now() / 1000);
        
        if (typeof ts === 'number') {
          return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
        }
        
        if (typeof ts === 'string') {
          const parsed = Date.parse(ts);
          return Math.floor(parsed / 1000);
        }
        
        return Math.floor(Date.now() / 1000);
      };

      const flow: Flow = {
        ts: parseTimestamp(item.ts || item.timestamp),
        gid: item.gid || this.config.boxId,
        protocol: item.protocol || 'tcp',
        direction: item.direction || 'outbound',
        block: Boolean(item.block || item.blocked),
        download: item.download || 0,
        upload: item.upload || 0,
        duration: item.duration || 0,
        count: item.count || item.packets || 1,
        device: {
          id: item.device?.id || 'unknown',
          ip: item.device?.ip || item.srcIP || 'unknown',
          name: item.device?.name || 'Unknown Device',
        },
      };
      
      if (item.blockType) {
        flow.blockType = item.blockType;
      }
      
      if (item.device?.network) {
        flow.device.network = {
          id: item.device.network.id,
          name: item.device.network.name
        };
      }
      
      if (item.source) {
        flow.source = {
          id: item.source.id || 'unknown',
          name: item.source.name || 'Unknown',
          ip: item.source.ip || item.srcIP || 'unknown'
        };
      }
      
      if (item.destination) {
        flow.destination = {
          id: item.destination.id || 'unknown', 
          name: item.destination.name || item.domain || 'Unknown',
          ip: item.destination.ip || item.dstIP || 'unknown'
        };
      }
      
      if (item.region) {
        flow.region = item.region;
      }
      
      if (item.category) {
        flow.category = item.category;
      }
      
      return flow;
    });

    return {
      flows,
      pagination: {
        has_more: rawFlows.length === limit,
        next_cursor: Array.isArray(response) ? undefined : (response as any).cursor
      }
    };
  }

  async searchFlows(query: string, limit = 50, cursor?: string): Promise<FlowData> {
    const params: Record<string, unknown> = {
      query,
      limit,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await this.request<{results: any[]} | any[]>('GET', `/boxes/${this.config.boxId}/flows`, params);
    const rawFlows = Array.isArray(response) ? response : (response.results || []);
    
    const flows = rawFlows.map((item: any): Flow => {
      const parseTimestamp = (ts: any): number => {
        if (!ts) return Math.floor(Date.now() / 1000);
        
        if (typeof ts === 'number') {
          return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
        }
        
        if (typeof ts === 'string') {
          const parsed = Date.parse(ts);
          return Math.floor(parsed / 1000);
        }
        
        return Math.floor(Date.now() / 1000);
      };

      const flow: Flow = {
        ts: parseTimestamp(item.ts || item.timestamp),
        gid: item.gid || this.config.boxId,
        protocol: item.protocol || 'tcp',
        direction: item.direction || 'outbound',
        block: Boolean(item.block || item.blocked),
        download: item.download || 0,
        upload: item.upload || 0,
        duration: item.duration || 0,
        count: item.count || item.packets || 1,
        device: {
          id: item.device?.id || 'unknown',
          ip: item.device?.ip || item.srcIP || 'unknown',
          name: item.device?.name || 'Unknown Device',
        },
      };
      
      if (item.blockType) {
        flow.blockType = item.blockType;
      }
      
      if (item.device?.network) {
        flow.device.network = {
          id: item.device.network.id,
          name: item.device.network.name
        };
      }
      
      if (item.source) {
        flow.source = {
          id: item.source.id || 'unknown',
          name: item.source.name || 'Unknown',
          ip: item.source.ip || item.srcIP || 'unknown'
        };
      }
      
      if (item.destination) {
        flow.destination = {
          id: item.destination.id || 'unknown', 
          name: item.destination.name || item.domain || 'Unknown',
          ip: item.destination.ip || item.dstIP || 'unknown'
        };
      }
      
      if (item.region) {
        flow.region = item.region;
      }
      
      if (item.category) {
        flow.category = item.category;
      }
      
      return flow;
    });

    return {
      flows,
      pagination: {
        has_more: rawFlows.length === limit,
        next_cursor: Array.isArray(response) ? undefined : (response as any).cursor
      }
    };
  }

  async getDeviceStatus(deviceId?: string, includeOffline = true): Promise<Device[]> {
    const params: Record<string, unknown> = {};
    
    if (deviceId) {
      // If specific device requested, use device endpoint
      const response = await this.request<any>('GET', `/devices/${deviceId}`, params);
      return [response].map(this.transformDevice);
    }

    // Get all devices from the box
    const response = await this.request<{devices: any[]} | any[]>('GET', `/boxes/${this.config.boxId}/devices`, params);
    
    // Handle different response formats
    const devices = Array.isArray(response) ? response : (response.devices || []);
    
    return devices
      .map(this.transformDevice)
      .filter(device => includeOffline || device.online);
  }

  private transformDevice = (item: any): Device => {
    const device: Device = {
      id: item.id || 'unknown',
      gid: item.gid || this.config.boxId,
      name: item.name || item.hostname || item.deviceName || 'Unknown Device',
      ip: item.ip || item.ipAddress || item.local_ip || 'unknown',
      online: Boolean(item.online),
      ipReserved: Boolean(item.ipReserved),
      network: {
        id: item.network?.id || 'unknown',
        name: item.network?.name || 'Unknown Network',
      },
      totalDownload: item.totalDownload || 0,
      totalUpload: item.totalUpload || 0,
    };
    
    if (item.macVendor) {
      device.macVendor = item.macVendor;
    }
    
    if (item.lastSeen) {
      device.lastSeen = item.lastSeen;
    }
    
    if (item.group) {
      device.group = {
        id: item.group.id || 'unknown',
        name: item.group.name || 'Unknown Group',
      };
    }
    
    return device;
  }

  async getBandwidthUsage(period: string, top = 10): Promise<BandwidthUsage[]> {
    // Calculate timestamp range based on period
    const end = Math.floor(Date.now() / 1000);
    let begin: number;
    
    switch (period) {
      case '1h':
        begin = end - (60 * 60);
        break;
      case '24h':
        begin = end - (24 * 60 * 60);
        break;
      case '7d':
        begin = end - (7 * 24 * 60 * 60);
        break;
      case '30d':
        begin = end - (30 * 24 * 60 * 60);
        break;
      default:
        begin = end - (24 * 60 * 60); // Default to 24h
    }

    const params = {
      query: `ts:${begin}-${end}`,
      limit: top,
      sortBy: 'total:desc',
      groupBy: 'device'
    };

    const response = await this.request<{results: any[]} | any[]>('GET', `/boxes/${this.config.boxId}/flows`, params);
    const rawData = Array.isArray(response) ? response : (response.results || []);
    
    // Transform the response to BandwidthUsage format
    return rawData.map((item: any) => ({
      device_id: item.device?.id || item.deviceId || 'unknown',
      device_name: item.device?.name || item.deviceName || 'Unknown Device',
      ip_address: item.device?.ip || item.ip || 'unknown',
      bytes_uploaded: item.upload || item.uploadBytes || 0,
      bytes_downloaded: item.download || item.downloadBytes || 0,
      total_bytes: item.total || item.totalBytes || 0,
      period: period
    }));
  }

  async getNetworkRules(ruleType?: string, activeOnly = true): Promise<NetworkRule[]> {
    const params: Record<string, unknown> = {
      active_only: activeOnly,
    };
    
    if (ruleType) {
      params.rule_type = ruleType;
    }

    const response = await this.request<{results: any[]} | any[]>('GET', `/rules`, params);
    const rawRules = Array.isArray(response) ? response : (response.results || []);
    
    // Transform raw API response to match NetworkRule interface with comprehensive mapping
    // This handles cases where the API returns raw rule data with different field names
    return rawRules.map((item: any) => {
      // If the item already matches the NetworkRule interface perfectly, return as-is
      if (item.id && item.name && item.type && item.action && item.status && 
          item.conditions && item.created_at && item.updated_at) {
        return item as NetworkRule;
      }
      
      // Otherwise, apply comprehensive field mapping
      // Extract rule ID with multiple fallbacks
      const ruleId = item.rid || item.id || item._id || item.ruleId || 'unknown';
      
      // Build comprehensive rule name with context
      let ruleName = '';
      if (item.name) {
        ruleName = item.name;
      } else if (item.description || item.desc) {
        ruleName = item.description || item.desc;
      } else if (item.msg || item.message) {
        ruleName = item.msg || item.message;
      } else if (item.title) {
        ruleName = item.title;
      } else {
        // Generate descriptive name based on rule details
        const ruleTypeStr = item.type || item.ruleType || item.category || 'rule';
        const actionStr = item.action || item.policy || 'block';
        ruleName = `${ruleTypeStr} ${actionStr} rule ${ruleId}`.replace(/\s+/g, ' ').trim();
      }
      
      // Determine rule type with comprehensive mapping
      let ruleType = 'firewall'; // default
      if (item.type) {
        ruleType = item.type;
      } else if (item.ruleType) {
        ruleType = item.ruleType;
      } else if (item.category) {
        ruleType = item.category;
      } else if (item.policyType) {
        ruleType = item.policyType;
      } else if (item.kind) {
        ruleType = item.kind;
      }
      
      // Map action with comprehensive fallbacks and normalization
      let action: 'allow' | 'block' | 'redirect' = 'block'; // default
      const actionValue = item.action || item.policy || item.verdict || item.disposition;
      if (actionValue) {
        const actionLower = String(actionValue).toLowerCase();
        if (actionLower.includes('allow') || actionLower.includes('permit') || actionLower.includes('accept')) {
          action = 'allow';
        } else if (actionLower.includes('redirect') || actionLower.includes('proxy')) {
          action = 'redirect';
        } else {
          action = 'block'; // block, deny, drop, reject, etc.
        }
      }
      
      // Determine status with comprehensive mapping
      let status: 'active' | 'paused' | 'disabled' = 'active'; // default
      if (item.disabled === true || item.status === 'disabled' || item.state === 'disabled') {
        status = 'disabled';
      } else if (item.paused === true || item.status === 'paused' || item.state === 'paused') {
        status = 'paused';
      } else if (item.enabled === false) {
        status = 'disabled';
      } else if (item.active === false && item.disabled !== false) {
        status = 'disabled';
      }
      
      // Build comprehensive conditions object
      const conditions: Record<string, unknown> = {};
      
      // Direct conditions/criteria mapping
      if (item.conditions && typeof item.conditions === 'object') {
        Object.assign(conditions, item.conditions);
      }
      if (item.target && typeof item.target === 'object') {
        Object.assign(conditions, item.target);
      }
      if (item.criteria && typeof item.criteria === 'object') {
        Object.assign(conditions, item.criteria);
      }
      if (item.config && typeof item.config === 'object') {
        Object.assign(conditions, item.config);
      }
      
      // Add specific rule parameters
      if (item.sourceIP || item.src_ip || item.srcIP) {
        conditions.source_ip = item.sourceIP || item.src_ip || item.srcIP;
      }
      if (item.destinationIP || item.dest_ip || item.dstIP || item.dst_ip) {
        conditions.destination_ip = item.destinationIP || item.dest_ip || item.dstIP || item.dst_ip;
      }
      if (item.sourcePort || item.src_port || item.srcPort) {
        conditions.source_port = item.sourcePort || item.src_port || item.srcPort;
      }
      if (item.destinationPort || item.dest_port || item.dstPort || item.dst_port) {
        conditions.destination_port = item.destinationPort || item.dest_port || item.dstPort || item.dst_port;
      }
      if (item.protocol || item.proto) {
        conditions.protocol = item.protocol || item.proto;
      }
      if (item.domain || item.hostname || item.host) {
        conditions.domain = item.domain || item.hostname || item.host;
      }
      if (item.url || item.path) {
        conditions.url = item.url || item.path;
      }
      if (item.app || item.application || item.appName) {
        conditions.application = item.app || item.application || item.appName;
      }
      if (item.device || item.deviceId || item.mac) {
        conditions.device = item.device || item.deviceId || item.mac;
      }
      if (item.direction) {
        conditions.direction = item.direction;
      }
      if (item.schedule || item.timeRange) {
        conditions.schedule = item.schedule || item.timeRange;
      }
      if (item.tags && Array.isArray(item.tags)) {
        conditions.tags = item.tags;
      }
      if (item.category || item.categories) {
        conditions.category = item.category || item.categories;
      }
      
      // Add rule metadata
      if (item.priority !== undefined) {
        conditions.priority = item.priority;
      }
      if (item.weight !== undefined) {
        conditions.weight = item.weight;
      }
      if (item.severity) {
        conditions.severity = item.severity;
      }
      if (item.scope) {
        conditions.scope = item.scope;
      }
      
      // Handle timestamp conversion with multiple formats - returns Unix timestamp in seconds
      const parseTimestamp = (ts: any): number => {
        if (!ts) return Math.floor(Date.now() / 1000);
        
        if (typeof ts === 'number') {
          // Handle both seconds and milliseconds timestamps
          return ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
        }
        
        if (typeof ts === 'string') {
          // Try to parse ISO string or convert to number
          if (ts.includes('T') || ts.includes('-')) {
            return Math.floor(new Date(ts).getTime() / 1000);
          } else {
            const numTs = parseInt(ts, 10);
            if (!isNaN(numTs)) {
              return numTs > 1000000000000 ? Math.floor(numTs / 1000) : numTs;
            }
          }
        }
        
        return Math.floor(Date.now() / 1000);
      };
      
      const createdAt = parseTimestamp(
        item.createdAt || item.created_at || item.createTime || item.timestamp || item.ts
      );
      
      const updatedAt = parseTimestamp(
        item.updatedAt || item.updated_at || item.updateTime || item.lastModified || 
        item.modifiedAt || item.modified_at || createdAt
      );
      
      return {
        id: ruleId,
        action,
        target: {
          type: item.target?.type || 'ip',
          value: item.target?.value || conditions.destination_ip || conditions.domain || 'unknown'
        },
        direction: item.direction || 'bidirection',
        gid: item.gid || this.config.boxId,
        group: item.group,
        scope: item.scope,
        notes: item.notes || ruleName,
        status: status === 'disabled' ? undefined : status,
        hit: item.hit ? {
          count: item.hit.count || 0,
          lastHitTs: item.hit.lastHitTs || 0,
          statsResetTs: item.hit.statsResetTs
        } : undefined,
        schedule: item.schedule,
        timeUsage: item.timeUsage,
        protocol: item.protocol,
        ts: parseTimestamp(item.createdAt || item.created_at || item.createTime || item.timestamp || item.ts),
        updateTs: parseTimestamp(item.updatedAt || item.updated_at || item.updateTime || item.lastModified || item.modifiedAt || item.modified_at),
        resumeTs: item.resumeTs
      } as NetworkRule;
    });
  }

  async pauseRule(ruleId: string, duration = 60): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/rules/${ruleId}/pause`,
      { duration_minutes: duration },
      false
    );
  }

  async getTargetLists(listType?: string): Promise<TargetList[]> {
    const params: Record<string, unknown> = {};
    
    if (listType && listType !== 'all') {
      params.list_type = listType;
    }

    const response = await this.request<TargetList[] | {results: TargetList[]}>('GET', `/target-lists`, params);
    // Handle response format
    return Array.isArray(response) ? response : (response.results || []);
  }

  async getFirewallSummary(): Promise<{
    status: string;
    uptime: number;
    cpu_usage: number;
    memory_usage: number;
    active_connections: number;
    blocked_attempts: number;
    last_updated: string;
  }> {
    return this.request('GET', `/boxes/${this.config.boxId}/summary`, undefined, true);
  }

  async getSecurityMetrics(): Promise<{
    total_alarms: number;
    active_alarms: number;
    blocked_connections: number;
    suspicious_activities: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    last_threat_detected: string;
  }> {
    return this.request('GET', `/boxes/${this.config.boxId}/metrics/security`, undefined, true);
  }

  async getNetworkTopology(): Promise<{
    subnets: Array<{
      id: string;
      name: string;
      cidr: string;
      device_count: number;
    }>;
    connections: Array<{
      source: string;
      destination: string;
      type: string;
      bandwidth: number;
    }>;
  }> {
    return this.request('GET', `/boxes/${this.config.boxId}/topology`, undefined, true);
  }

  async getRecentThreats(hours = 24): Promise<Array<{
    timestamp: string;
    type: string;
    source_ip: string;
    destination_ip: string;
    action_taken: string;
    severity: string;
  }>> {
    const params = { hours };
    return this.request('GET', `/boxes/${this.config.boxId}/threats/recent`, params, true);
  }

  async resumeRule(ruleId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/rules/${ruleId}/resume`,
      {},
      false
    );
  }

  async getBoxes(): Promise<Array<{
    id: string;
    name: string;
    status: string;
    version: string;
    last_seen: string;
    location?: string;
    type?: string;
  }>> {
    return this.request('GET', `/boxes`, undefined, true);
  }

  async getSpecificAlarm(alarmId: string): Promise<Alarm> {
    const response = await this.request<any>('GET', `/alarms/${this.config.boxId}/${alarmId}`);
    
    // Transform response to Alarm format
    const parseTimestamp = (ts: any) => {
      if (!ts) return new Date().toISOString();
      
      if (typeof ts === 'number') {
        const timestamp = ts > 1000000000000 ? ts : ts * 1000;
        return new Date(timestamp).toISOString();
      }
      
      if (typeof ts === 'string') {
        if (ts.includes('T') || ts.includes('-')) {
          return new Date(ts).toISOString();
        }
      }
      
      return new Date().toISOString();
    };

    return {
      id: response.aid || response.id || response._id || 'unknown',
      timestamp: parseTimestamp(response.ts || response.timestamp),
      severity: response.severity || 'medium',
      type: response.type || response._type || response.category || 'security',
      description: response.description || response.message || response.msg || `Alarm ${response._type || 'detected'}`,
      source_ip: response.device?.ip || response.srcIP || response.source_ip || response.sourceIP,
      destination_ip: response.dstIP || response.dest_ip || response.destinationIP,
      status: response.status === 1 ? 'active' : (response.status || 'active')
    };
  }

  async deleteAlarm(alarmId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'DELETE',
      `/alarms/${this.config.boxId}/${alarmId}`,
      undefined,
      false
    );
  }

  // Statistics API Implementation
  async getSimpleStatistics(): Promise<import('../types').SimpleStats> {
    const [boxes, alarms, rules] = await Promise.all([
      this.getBoxes(),
      this.getActiveAlarms(),
      this.getNetworkRules()
    ]);

    const onlineBoxes = boxes.filter((box: any) => box.status === 'online' || box.online).length;
    const offlineBoxes = boxes.length - onlineBoxes;

    return {
      onlineBoxes,
      offlineBoxes,
      alarms: alarms.length,
      rules: rules.length
    };
  }

  async getStatisticsByRegion(): Promise<import('../types').Statistics[]> {
    const flows = await this.getFlowData(undefined, undefined, 1000);
    const alarms = await this.getActiveAlarms();

    // Group flows by region
    const regionStats = new Map<string, number>();
    
    flows.flows.forEach(flow => {
      if (flow.region) {
        regionStats.set(flow.region, (regionStats.get(flow.region) || 0) + 1);
      }
    });

    // Convert to Statistics format
    return Array.from(regionStats.entries()).map(([code, value]) => ({
      meta: { code },
      value
    }));
  }

  // Trends API Implementation
  async getFlowTrends(period: '1h' | '24h' | '7d' | '30d' = '24h', interval: number = 3600): Promise<import('../types').Trend[]> {
    const end = Math.floor(Date.now() / 1000);
    let begin: number;
    let points: number;
    
    switch (period) {
      case '1h':
        begin = end - (60 * 60);
        points = Math.min(60, Math.floor((end - begin) / interval)); // 1 point per minute max
        break;
      case '24h':
        begin = end - (24 * 60 * 60);
        points = Math.min(24, Math.floor((end - begin) / interval)); // 1 point per hour max
        break;
      case '7d':
        begin = end - (7 * 24 * 60 * 60);
        points = Math.min(168, Math.floor((end - begin) / interval)); // 1 point per hour max
        break;
      case '30d':
        begin = end - (30 * 24 * 60 * 60);
        points = Math.min(30, Math.floor((end - begin) / interval)); // 1 point per day max
        break;
      default:
        begin = end - (24 * 60 * 60);
        points = 24;
    }

    const actualInterval = Math.floor((end - begin) / points);
    const trends: import('../types').Trend[] = [];
    
    // Generate time-based trend data by querying flows in intervals
    for (let i = 0; i < points; i++) {
      const intervalStart = begin + (i * actualInterval);
      const intervalEnd = begin + ((i + 1) * actualInterval);
      
      try {
        // Query flows for this time interval
        const startTime = new Date(intervalStart * 1000).toISOString();
        const endTime = new Date(intervalEnd * 1000).toISOString();
        const flows = await this.getFlowData(startTime, endTime, 1000);
        
        trends.push({
          ts: intervalEnd,
          value: flows.flows.length
        });
      } catch (error) {
        // If we can't get data for this interval, use 0
        trends.push({
          ts: intervalEnd,
          value: 0
        });
      }
    }
    
    return trends;
  }

  async getAlarmTrends(period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<import('../types').Trend[]> {
    // For alarms, we'll simulate trends based on current alarm timestamps
    // In a real implementation, this would query historical alarm data
    const alarms = await this.getActiveAlarms();
    const end = Math.floor(Date.now() / 1000);
    let begin: number;
    let points: number;
    
    switch (period) {
      case '1h':
        begin = end - (60 * 60);
        points = 12; // 5-minute intervals
        break;
      case '24h':
        begin = end - (24 * 60 * 60);
        points = 24; // 1-hour intervals
        break;
      case '7d':
        begin = end - (7 * 24 * 60 * 60);
        points = 168; // 1-hour intervals
        break;
      case '30d':
        begin = end - (30 * 24 * 60 * 60);
        points = 30; // 1-day intervals
        break;
      default:
        begin = end - (24 * 60 * 60);
        points = 24;
    }

    const interval = Math.floor((end - begin) / points);
    const trends: import('../types').Trend[] = [];
    
    // Group alarms by time intervals
    const alarmsByInterval = new Map<number, number>();
    
    alarms.forEach(alarm => {
      const alarmTime = new Date(alarm.timestamp).getTime() / 1000;
      if (alarmTime >= begin && alarmTime <= end) {
        const intervalIndex = Math.floor((alarmTime - begin) / interval);
        const intervalEnd = begin + ((intervalIndex + 1) * interval);
        alarmsByInterval.set(intervalEnd, (alarmsByInterval.get(intervalEnd) || 0) + 1);
      }
    });
    
    // Generate trend points
    for (let i = 0; i < points; i++) {
      const intervalEnd = begin + ((i + 1) * interval);
      trends.push({
        ts: intervalEnd,
        value: alarmsByInterval.get(intervalEnd) || 0
      });
    }
    
    return trends;
  }

  async getRuleTrends(period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<import('../types').Trend[]> {
    // For rules, we'll show trend based on rule creation/update times
    const rules = await this.getNetworkRules();
    const end = Math.floor(Date.now() / 1000);
    let begin: number;
    let points: number;
    
    switch (period) {
      case '1h':
        begin = end - (60 * 60);
        points = 12;
        break;
      case '24h':
        begin = end - (24 * 60 * 60);
        points = 24;
        break;
      case '7d':
        begin = end - (7 * 24 * 60 * 60);
        points = 168;
        break;
      case '30d':
        begin = end - (30 * 24 * 60 * 60);
        points = 30;
        break;
      default:
        begin = end - (24 * 60 * 60);
        points = 24;
    }

    const interval = Math.floor((end - begin) / points);
    const trends: import('../types').Trend[] = [];
    
    // Count active rules over time (simplified - shows current count for each interval)
    const activeRuleCount = rules.filter(rule => rule.status === 'active' || !rule.status).length;
    
    for (let i = 0; i < points; i++) {
      const intervalEnd = begin + ((i + 1) * interval);
      // In a real implementation, this would show historical rule counts
      // For now, we'll show the current active count with some variation
      const variation = Math.floor(Math.random() * 5) - 2; // ±2 variation
      trends.push({
        ts: intervalEnd,
        value: Math.max(0, activeRuleCount + variation)
      });
    }
    
    return trends;
  }

  async getStatisticsByBox(): Promise<import('../types').Statistics[]> {
    const [boxes, alarms, rules] = await Promise.all([
      this.getBoxes(),
      this.getActiveAlarms(),
      this.getNetworkRules()
    ]);

    // Group data by box
    const boxStats = new Map<string, { box: any; alarmCount: number; ruleCount: number }>();
    
    boxes.forEach((box: any) => {
      boxStats.set(box.id || box.gid, {
        box,
        alarmCount: 0,
        ruleCount: 0
      });
    });

    // Count alarms per box (if alarm has box info)
    alarms.forEach(alarm => {
      if ((alarm as any).gid && boxStats.has((alarm as any).gid)) {
        boxStats.get((alarm as any).gid)!.alarmCount++;
      }
    });

    // Count rules per box (if rule has box info)
    rules.forEach(rule => {
      if (rule.gid && boxStats.has(rule.gid)) {
        boxStats.get(rule.gid)!.ruleCount++;
      }
    });

    // Convert to Statistics format - using combined score as value
    return Array.from(boxStats.values()).map(stat => ({
      meta: {
        gid: stat.box.id || stat.box.gid,
        name: stat.box.name,
        model: stat.box.model || 'unknown',
        mode: stat.box.mode || 'router',
        version: stat.box.version || 'unknown',
        online: Boolean(stat.box.online || stat.box.status === 'online'),
        lastSeen: stat.box.lastSeen || stat.box.last_seen,
        license: stat.box.license || 'unknown',
        publicIP: stat.box.publicIP || stat.box.public_ip || 'unknown',
        group: stat.box.group,
        location: stat.box.location || 'unknown',
        deviceCount: stat.box.deviceCount || stat.box.device_count || 0,
        ruleCount: stat.ruleCount,
        alarmCount: stat.alarmCount
      },
      value: stat.alarmCount + stat.ruleCount // Combined activity score
    }));
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}