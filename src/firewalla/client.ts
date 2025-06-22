import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  FirewallaConfig,
  Alarm,
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
    const baseURL = config.mspBaseUrl || `https://${config.mspId}.firewalla.net`;
    
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
        result = response.data;
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
      status: 'active',
      limit,
    };
    
    if (severity) {
      params.severity = severity;
    }

    return this.request<Alarm[]>('GET', `/v2/gid/${this.config.boxId}/alarms`, params);
  }

  async getFlowData(
    startTime?: string,
    endTime?: string,
    limit = 50,
    page = 1
  ): Promise<FlowData> {
    const params: Record<string, unknown> = {
      limit,
      page,
    };
    
    if (startTime) {
      params.start_time = startTime;
    }
    
    if (endTime) {
      params.end_time = endTime;
    }

    return this.request<FlowData>('GET', `/v2/gid/${this.config.boxId}/flows`, params);
  }

  async getDeviceStatus(deviceId?: string, includeOffline = true): Promise<Device[]> {
    const params: Record<string, unknown> = {
      include_offline: includeOffline,
    };
    
    if (deviceId) {
      params.device_id = deviceId;
    }

    return this.request<Device[]>('GET', `/v2/gid/${this.config.boxId}/devices`, params);
  }

  async getBandwidthUsage(period: string, top = 10): Promise<BandwidthUsage[]> {
    const params = {
      period,
      top,
    };

    return this.request<BandwidthUsage[]>('GET', `/v2/gid/${this.config.boxId}/bandwidth`, params);
  }

  async getNetworkRules(ruleType?: string, activeOnly = true): Promise<NetworkRule[]> {
    const params: Record<string, unknown> = {
      active_only: activeOnly,
    };
    
    if (ruleType) {
      params.rule_type = ruleType;
    }

    const rawRules = await this.request<any[]>('GET', `/v2/gid/${this.config.boxId}/rules`, params);
    
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
      
      // Handle timestamp conversion with multiple formats
      const parseTimestamp = (ts: any): string => {
        if (!ts) return new Date().toISOString();
        
        if (typeof ts === 'number') {
          // Handle both seconds and milliseconds timestamps
          const timestamp = ts > 1000000000000 ? ts : ts * 1000;
          return new Date(timestamp).toISOString();
        }
        
        if (typeof ts === 'string') {
          // Try to parse ISO string or convert to number
          if (ts.includes('T') || ts.includes('-')) {
            return new Date(ts).toISOString();
          } else {
            const numTs = parseInt(ts, 10);
            if (!isNaN(numTs)) {
              const timestamp = numTs > 1000000000000 ? numTs : numTs * 1000;
              return new Date(timestamp).toISOString();
            }
          }
        }
        
        return new Date().toISOString();
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
        name: ruleName,
        type: ruleType,
        action,
        status,
        conditions,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    });
  }

  async pauseRule(ruleId: string, duration = 60): Promise<{ success: boolean; message: string }> {
    const params = {
      rule_id: ruleId,
      duration_minutes: duration,
    };

    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/v2/gid/${this.config.boxId}/rules/pause`,
      params,
      false
    );
  }

  async getTargetLists(listType?: string): Promise<TargetList[]> {
    const params: Record<string, unknown> = {};
    
    if (listType && listType !== 'all') {
      params.list_type = listType;
    }

    return this.request<TargetList[]>('GET', `/v2/gid/${this.config.boxId}/target_lists`, params);
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
    return this.request('GET', `/v2/gid/${this.config.boxId}/summary`, undefined, true);
  }

  async getSecurityMetrics(): Promise<{
    total_alarms: number;
    active_alarms: number;
    blocked_connections: number;
    suspicious_activities: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    last_threat_detected: string;
  }> {
    return this.request('GET', `/v2/gid/${this.config.boxId}/security_metrics`, undefined, true);
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
    return this.request('GET', `/v2/gid/${this.config.boxId}/topology`, undefined, true);
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
    return this.request('GET', `/v2/gid/${this.config.boxId}/threats/recent`, params, true);
  }

  async resumeRule(ruleId: string): Promise<{ success: boolean; message: string }> {
    const params = {
      rule_id: ruleId,
    };

    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/v2/gid/${this.config.boxId}/rules/resume`,
      params,
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
    return this.request('GET', `/v2/boxes`, undefined, true);
  }

  async getSpecificAlarm(alarmId: string): Promise<Alarm> {
    return this.request<Alarm>('GET', `/v2/gid/${this.config.boxId}/alarms/${alarmId}`);
  }

  async deleteAlarm(alarmId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'DELETE',
      `/v2/gid/${this.config.boxId}/alarms/${alarmId}`,
      undefined,
      false
    );
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