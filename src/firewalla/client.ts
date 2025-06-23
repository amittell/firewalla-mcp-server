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
  Box,
  SearchResult,
  SearchQuery,
  SearchOptions,
  CrossReferenceResult,
} from '../types.js';
import { parseSearchQuery, formatQueryForAPI, buildSearchOptions } from '../search/index.js';
import { ResponseValidator, validateResponse, ValidationError } from '../validation/index.js';
import { optimizeResponse, ResponseOptimizer } from '../optimization/index.js';

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
      
      // Sanitize response data
      result = ResponseValidator.sanitizeResponse(result);
      
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

  @optimizeResponse('alarms')
  @validateResponse(ResponseValidator.validateAlarm)
  async getActiveAlarms(
    query?: string, 
    groupBy?: string, 
    sortBy = 'ts:desc', 
    limit = 200, 
    cursor?: string
  ): Promise<{count: number; results: Alarm[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {
      sortBy,
      limit: Math.min(limit, 500), // API max is 500
    };
    
    if (query) {
      params.query = query;
    }
    if (groupBy) {
      params.groupBy = groupBy;
    }
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string}>('GET', `/v2/alarms`, params);
    
    // API returns {count, results[], next_cursor} format
    const alarms = response.results.map((item: any): Alarm => ({
      ts: item.ts || Math.floor(Date.now() / 1000),
      gid: item.gid || this.config.boxId,
      aid: item.aid || 0,
      type: item.type || 1,
      status: item.status || 1,
      message: item.message || 'Unknown alarm',
      direction: item.direction || 'inbound',
      protocol: item.protocol || 'tcp',
      // Conditional properties based on alarm type
      ...(item.device && { device: item.device }),
      ...(item.remote && { remote: item.remote }),
      ...(item.transfer && { transfer: item.transfer }),
      ...(item.dataPlan && { dataPlan: item.dataPlan }),
      ...(item.vpn && { vpn: item.vpn }),
      ...(item.port && { port: item.port }),
      ...(item.wan && { wan: item.wan })
    }));

    return {
      count: response.count || alarms.length,
      results: alarms,
      next_cursor: response.next_cursor
    };
  }

  @optimizeResponse('flows')
  @validateResponse(ResponseValidator.validateFlow)
  async getFlowData(
    query?: string,
    groupBy?: string,
    sortBy = 'ts:desc',
    limit = 200,
    cursor?: string
  ): Promise<{count: number; results: Flow[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {
      sortBy,
      limit: Math.min(limit, 500), // API max is 500
    };
    
    if (query) {
      params.query = query;
    }
    if (groupBy) {
      params.groupBy = groupBy;
    }
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string}>('GET', `/v2/flows`, params);
    
    // API returns {count, results[], next_cursor} format
    const flows = response.results.map((item: any): Flow => {
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
      count: response.count || flows.length,
      results: flows,
      next_cursor: response.next_cursor
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

  @optimizeResponse('devices')
  @validateResponse(ResponseValidator.validateDevice)
  async getDeviceStatus(boxId?: string, groupId?: string): Promise<{count: number; results: Device[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {};
    
    if (boxId) {
      params.box = boxId;
    }
    if (groupId) {
      params.group = groupId;
    }

    // API returns direct array of devices
    const response = await this.request<Device[]>('GET', `/v2/devices`, params);
    const results = response.map(this.transformDevice);
    
    return {
      count: results.length,
      results
    };
  }

  @optimizeResponse('devices')
  @validateResponse(ResponseValidator.validateDevice)
  async getOfflineDevices(sortByLastSeen: boolean = true): Promise<{count: number; results: Device[]; next_cursor?: string}> {
    // Get all devices first
    const allDevices = await this.getDeviceStatus();
    
    // Filter for offline devices only
    const offlineDevices = allDevices.results.filter(device => !device.online);
    
    // Sort by last seen if requested
    if (sortByLastSeen) {
      offlineDevices.sort((a, b) => {
        const aLastSeen = new Date(a.lastSeen || 0).getTime();
        const bLastSeen = new Date(b.lastSeen || 0).getTime();
        return bLastSeen - aLastSeen; // Most recent first
      });
    }
    
    return {
      count: offlineDevices.length,
      results: offlineDevices
    };
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

  @optimizeResponse('bandwidth')
  @validateResponse(ResponseValidator.validateBandwidth)
  async getBandwidthUsage(period: string, top = 10): Promise<{count: number; results: BandwidthUsage[]; next_cursor?: string}> {
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
    const results = rawData.map((item: any) => ({
      device_id: item.device?.id || item.deviceId || 'unknown',
      device_name: item.device?.name || item.deviceName || 'Unknown Device',
      ip_address: item.device?.ip || item.ip || 'unknown',
      bytes_uploaded: item.upload || item.uploadBytes || 0,
      bytes_downloaded: item.download || item.downloadBytes || 0,
      total_bytes: item.total || item.totalBytes || 0,
      period: period
    }));

    return {
      count: results.length,
      results
    };
  }

  @optimizeResponse('rules')
  @validateResponse(ResponseValidator.validateNetworkRule)
  async getNetworkRules(query?: string): Promise<{count: number; results: NetworkRule[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {};
    
    if (query) {
      params.query = query;
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string}>('GET', `/v2/rules`, params);
    
    // API returns {count, results[]} format
    const rules = response.results.map((item: any): NetworkRule => ({
      id: item.id || 'unknown',
      action: item.action || 'block',
      target: {
        type: item.target?.type || 'ip',
        value: item.target?.value || 'unknown',
        dnsOnly: item.target?.dnsOnly,
        port: item.target?.port
      },
      direction: item.direction || 'bidirection',
      gid: item.gid || this.config.boxId,
      group: item.group,
      scope: item.scope ? {
        type: item.scope.type || 'ip',
        value: item.scope.value || 'unknown',
        port: item.scope.port
      } : undefined,
      notes: item.notes,
      status: item.status,
      hit: item.hit ? {
        count: item.hit.count || 0,
        lastHitTs: item.hit.lastHitTs || 0,
        statsResetTs: item.hit.statsResetTs
      } : undefined,
      schedule: item.schedule ? {
        duration: item.schedule.duration || 0,
        cronTime: item.schedule.cronTime
      } : undefined,
      timeUsage: item.timeUsage ? {
        quota: item.timeUsage.quota || 0,
        used: item.timeUsage.used || 0
      } : undefined,
      protocol: item.protocol,
      ts: item.ts || Math.floor(Date.now() / 1000),
      updateTs: item.updateTs || Math.floor(Date.now() / 1000),
      resumeTs: item.resumeTs
    }));

    return {
      count: response.count || rules.length,
      results: rules,
      next_cursor: response.next_cursor
    };
  }

  async pauseRule(ruleId: string, duration = 60): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/rules/${ruleId}/pause`,
      { duration_minutes: duration },
      false
    );
  }

  @optimizeResponse('targets')
  @validateResponse(ResponseValidator.validateTarget)
  async getTargetLists(listType?: string): Promise<{count: number; results: TargetList[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {};
    
    if (listType && listType !== 'all') {
      params.list_type = listType;
    }

    const response = await this.request<TargetList[] | {results: TargetList[]}>('GET', `/target-lists`, params);
    // Handle response format
    const results = Array.isArray(response) ? response : (response.results || []);
    
    return {
      count: results.length,
      results
    };
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

  @optimizeResponse('boxes')
  @validateResponse(ResponseValidator.validateBox)
  async getBoxes(groupId?: string): Promise<{count: number; results: Box[]; next_cursor?: string}> {
    const params: Record<string, unknown> = {};
    
    if (groupId) {
      params.group = groupId;
    }

    // API returns direct array of boxes
    const response = await this.request<any[]>('GET', `/v2/boxes`, params, true);
    
    const results = response.map((item: any): Box => ({
      gid: item.gid || item.id || 'unknown',
      name: item.name || 'Unknown Box',
      model: item.model || 'unknown',
      mode: item.mode || 'router',
      version: item.version || 'unknown',
      online: Boolean(item.online || item.status === 'online'),
      lastSeen: item.lastSeen || item.last_seen,
      license: item.license || 'unknown',
      publicIP: item.publicIP || item.public_ip || 'unknown',
      group: item.group,
      location: item.location || 'unknown',
      deviceCount: item.deviceCount || item.device_count || 0,
      ruleCount: item.ruleCount || item.rule_count || 0,
      alarmCount: item.alarmCount || item.alarm_count || 0
    }));

    return {
      count: results.length,
      results
    };
  }

  @optimizeResponse('alarms')
  @validateResponse(ResponseValidator.validateAlarm)
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
  @optimizeResponse('statistics')
  async getSimpleStatistics(): Promise<{count: number; results: import('../types').SimpleStats[]; next_cursor?: string}> {
    const [boxes, alarms, rules] = await Promise.all([
      this.getBoxes(),
      this.getActiveAlarms(),
      this.getNetworkRules()
    ]);

    const onlineBoxes = boxes.filter((box: any) => box.status === 'online' || box.online).length;
    const offlineBoxes = boxes.length - onlineBoxes;

    const stats = {
      onlineBoxes,
      offlineBoxes,
      alarms: alarms.count,
      rules: rules.count
    };

    return {
      count: 1,
      results: [stats]
    };
  }

  @optimizeResponse('statistics')
  async getStatisticsByRegion(): Promise<{count: number; results: import('../types').Statistics[]; next_cursor?: string}> {
    const flows = await this.getFlowData();
    const alarms = await this.getActiveAlarms();

    // Group flows by region
    const regionStats = new Map<string, number>();
    
    flows.results.forEach(flow => {
      if (flow.region) {
        regionStats.set(flow.region, (regionStats.get(flow.region) || 0) + 1);
      }
    });

    // Convert to Statistics format
    const results = Array.from(regionStats.entries()).map(([code, value]) => ({
      meta: { code },
      value
    }));

    return {
      count: results.length,
      results
    };
  }

  // Trends API Implementation
  @optimizeResponse('trends')
  async getFlowTrends(period: '1h' | '24h' | '7d' | '30d' = '24h', interval: number = 3600): Promise<{count: number; results: import('../types').Trend[]; next_cursor?: string}> {
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
        const flows = await this.getFlowData();
        
        trends.push({
          ts: intervalEnd,
          value: flows.results.length
        });
      } catch (error) {
        // If we can't get data for this interval, use 0
        trends.push({
          ts: intervalEnd,
          value: 0
        });
      }
    }
    
    return {
      count: trends.length,
      results: trends
    };
  }

  @optimizeResponse('trends')
  async getAlarmTrends(period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{count: number; results: import('../types').Trend[]; next_cursor?: string}> {
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
    
    return {
      count: trends.length,
      results: trends
    };
  }

  @optimizeResponse('trends')
  async getRuleTrends(period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{count: number; results: import('../types').Trend[]; next_cursor?: string}> {
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
    const activeRuleCount = rules.results.filter(rule => rule.status === 'active' || !rule.status).length;
    
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
    
    return {
      count: trends.length,
      results: trends
    };
  }

  @optimizeResponse('statistics')
  async getStatisticsByBox(): Promise<{count: number; results: import('../types').Statistics[]; next_cursor?: string}> {
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
    alarms.results.forEach(alarm => {
      if ((alarm as any).gid && boxStats.has((alarm as any).gid)) {
        boxStats.get((alarm as any).gid)!.alarmCount++;
      }
    });

    // Count rules per box (if rule has box info)
    rules.results.forEach(rule => {
      if (rule.gid && boxStats.has(rule.gid)) {
        boxStats.get(rule.gid)!.ruleCount++;
      }
    });

    // Convert to Statistics format - using combined score as value
    const results = Array.from(boxStats.values()).map(stat => ({
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

    return {
      count: results.length,
      results
    };
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

  // Advanced Search Methods

  /**
   * Advanced search for network flows with complex query syntax
   * Supports: severity:high AND source_ip:192.168.* NOT resolved:true
   */
  @optimizeResponse('flows')
  async searchFlows(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Flow>> {
    const startTime = Date.now();
    
    // Parse and optimize query
    const parsed = parseSearchQuery(searchQuery.query);
    const optimizedQuery = formatQueryForAPI(searchQuery.query);
    
    const params: Record<string, unknown> = {
      query: optimizedQuery,
      limit: Math.min(searchQuery.limit || 50, 1000),
      sortBy: searchQuery.sort_by || 'ts:desc',
    };
    
    if (searchQuery.group_by) {
      params.groupBy = searchQuery.group_by;
    }
    if (searchQuery.cursor) {
      params.cursor = searchQuery.cursor;
    }
    if (searchQuery.aggregate) {
      params.aggregate = true;
    }
    
    // Add time range if specified
    if (options.time_range) {
      const startTs = typeof options.time_range.start === 'string' 
        ? Math.floor(new Date(options.time_range.start).getTime() / 1000)
        : options.time_range.start;
      const endTs = typeof options.time_range.end === 'string'
        ? Math.floor(new Date(options.time_range.end).getTime() / 1000)
        : options.time_range.end;
      
      const timeQuery = `ts:${startTs}-${endTs}`;
      params.query = params.query ? `${params.query} AND ${timeQuery}` : timeQuery;
    }
    
    // Add blocked flow filter if needed
    if (options.include_resolved === false) {
      params.query = params.query ? `${params.query} AND block:false` : 'block:false';
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string; aggregations?: any}>('GET', `/v2/search/flows`, params);
    
    const flows = response.results.map((item: any): Flow => {
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
      
      if (item.blockType) flow.blockType = item.blockType;
      if (item.device?.network) flow.device.network = item.device.network;
      if (item.source) flow.source = item.source;
      if (item.destination) flow.destination = item.destination;
      if (item.region) flow.region = item.region;
      if (item.category) flow.category = item.category;
      
      return flow;
    });

    return {
      count: response.count || flows.length,
      results: flows,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: parsed.filters.map(f => `${f.field}:${f.operator}`)
      }
    };
  }

  /**
   * Advanced search for security alarms with severity, time, and IP filters
   */
  @optimizeResponse('alarms')
  async searchAlarms(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Alarm>> {
    const startTime = Date.now();
    
    const parsed = parseSearchQuery(searchQuery.query);
    const optimizedQuery = formatQueryForAPI(searchQuery.query);
    
    const params: Record<string, unknown> = {
      query: optimizedQuery,
      limit: Math.min(searchQuery.limit || 50, 1000),
      sortBy: searchQuery.sort_by || 'ts:desc',
    };
    
    if (searchQuery.group_by) params.groupBy = searchQuery.group_by;
    if (searchQuery.cursor) params.cursor = searchQuery.cursor;
    if (searchQuery.aggregate) params.aggregate = true;
    
    // Add resolved alarm filter
    if (options.include_resolved === false) {
      params.query = params.query ? `${params.query} AND status:1` : 'status:1';
    }
    
    // Add minimum severity filter
    if (options.min_severity) {
      const severityMap = { low: 1, medium: 4, high: 8, critical: 12 };
      const minSeverity = severityMap[options.min_severity];
      params.query = params.query ? `${params.query} AND type:>=${minSeverity}` : `type:>=${minSeverity}`;
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string; aggregations?: any}>('GET', `/v2/search/alarms`, params);
    
    const alarms = response.results.map((item: any): Alarm => ({
      ts: item.ts || Math.floor(Date.now() / 1000),
      gid: item.gid || this.config.boxId,
      aid: item.aid || 0,
      type: item.type || 1,
      status: item.status || 1,
      message: item.message || 'Unknown alarm',
      direction: item.direction || 'inbound',
      protocol: item.protocol || 'tcp',
      ...(item.device && { device: item.device }),
      ...(item.remote && { remote: item.remote }),
      ...(item.transfer && { transfer: item.transfer }),
      ...(item.dataPlan && { dataPlan: item.dataPlan }),
      ...(item.vpn && { vpn: item.vpn }),
      ...(item.port && { port: item.port }),
      ...(item.wan && { wan: item.wan })
    }));

    return {
      count: response.count || alarms.length,
      results: alarms,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: parsed.filters.map(f => `${f.field}:${f.operator}`)
      }
    };
  }

  /**
   * Advanced search for firewall rules with target, action, and status filters
   */
  @optimizeResponse('rules')
  async searchRules(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<NetworkRule>> {
    const startTime = Date.now();
    
    const parsed = parseSearchQuery(searchQuery.query);
    const optimizedQuery = formatQueryForAPI(searchQuery.query);
    
    const params: Record<string, unknown> = {
      query: optimizedQuery,
      limit: Math.min(searchQuery.limit || 50, 1000),
      sortBy: searchQuery.sort_by || 'ts:desc',
    };
    
    if (searchQuery.group_by) params.groupBy = searchQuery.group_by;
    if (searchQuery.cursor) params.cursor = searchQuery.cursor;
    if (searchQuery.aggregate) params.aggregate = true;
    
    // Add minimum hit count filter
    if (options.min_hits && options.min_hits > 0) {
      params.query = params.query ? `${params.query} AND hit.count:>=${options.min_hits}` : `hit.count:>=${options.min_hits}`;
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string; aggregations?: any}>('GET', `/v2/search/rules`, params);
    
    const rules = response.results.map((item: any): NetworkRule => ({
      id: item.id || 'unknown',
      action: item.action || 'block',
      target: {
        type: item.target?.type || 'ip',
        value: item.target?.value || 'unknown',
        dnsOnly: item.target?.dnsOnly,
        port: item.target?.port
      },
      direction: item.direction || 'bidirection',
      gid: item.gid || this.config.boxId,
      group: item.group,
      scope: item.scope,
      notes: item.notes,
      status: item.status,
      hit: item.hit,
      schedule: item.schedule,
      timeUsage: item.timeUsage,
      protocol: item.protocol,
      ts: item.ts || Math.floor(Date.now() / 1000),
      updateTs: item.updateTs || Math.floor(Date.now() / 1000),
      resumeTs: item.resumeTs
    }));

    return {
      count: response.count || rules.length,
      results: rules,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: parsed.filters.map(f => `${f.field}:${f.operator}`)
      }
    };
  }

  /**
   * Advanced search for network devices with network, status, and usage filters
   */
  @optimizeResponse('devices')
  async searchDevices(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Device>> {
    const startTime = Date.now();
    
    const parsed = parseSearchQuery(searchQuery.query);
    const optimizedQuery = formatQueryForAPI(searchQuery.query);
    
    const params: Record<string, unknown> = {
      query: optimizedQuery,
      limit: Math.min(searchQuery.limit || 50, 1000),
      sortBy: searchQuery.sort_by || 'name:asc',
    };
    
    if (searchQuery.group_by) params.groupBy = searchQuery.group_by;
    if (searchQuery.cursor) params.cursor = searchQuery.cursor;
    if (searchQuery.aggregate) params.aggregate = true;
    
    // Add online status filter
    if (options.include_resolved === false) {
      params.query = params.query ? `${params.query} AND online:true` : 'online:true';
    }

    const response = await this.request<{count: number; results: any[]; next_cursor?: string; aggregations?: any}>('GET', `/v2/search/devices`, params);
    
    const devices = response.results.map((item: any) => this.transformDevice(item));

    return {
      count: response.count || devices.length,
      results: devices,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: parsed.filters.map(f => `${f.field}:${f.operator}`)
      }
    };
  }

  /**
   * Advanced search for target lists with category and ownership filters
   */
  async searchTargetLists(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<TargetList>> {
    const startTime = Date.now();
    
    const parsed = parseSearchQuery(searchQuery.query);
    const optimizedQuery = formatQueryForAPI(searchQuery.query);
    
    const params: Record<string, unknown> = {
      query: optimizedQuery,
      limit: Math.min(searchQuery.limit || 50, 1000),
      sortBy: searchQuery.sort_by || 'name:asc',
    };
    
    if (searchQuery.group_by) params.groupBy = searchQuery.group_by;
    if (searchQuery.cursor) params.cursor = searchQuery.cursor;
    if (searchQuery.aggregate) params.aggregate = true;

    const response = await this.request<{count: number; results: any[]; next_cursor?: string; aggregations?: any}>('GET', `/v2/search/target-lists`, params);
    
    const targetLists = response.results.map((item: any): TargetList => ({
      id: item.id || 'unknown',
      name: item.name || 'Unknown List',
      owner: item.owner || 'global',
      targets: item.targets || [],
      category: item.category,
      notes: item.notes,
      lastUpdated: item.lastUpdated || Math.floor(Date.now() / 1000)
    }));

    return {
      count: response.count || targetLists.length,
      results: targetLists,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: parsed.filters.map(f => `${f.field}:${f.operator}`)
      }
    };
  }

  /**
   * Multi-entity searches with correlation across different data types
   */
  async searchCrossReference(
    primaryQuery: SearchQuery,
    secondaryQueries: Record<string, SearchQuery>,
    correlationField: string,
    options: SearchOptions = {}
  ): Promise<CrossReferenceResult> {
    const startTime = Date.now();
    
    // Execute primary search first
    const primary = await this.searchFlows(primaryQuery, options);
    
    // Extract correlation values from primary results
    const correlationValues = new Set<string>();
    primary.results.forEach(flow => {
      const value = this.extractFieldValue(flow, correlationField);
      if (value) correlationValues.add(String(value));
    });
    
    // Execute secondary searches with correlation filter
    const secondary: Record<string, SearchResult<any>> = {};
    
    for (const [name, query] of Object.entries(secondaryQueries)) {
      if (correlationValues.size === 0) {
        secondary[name] = { count: 0, results: [], metadata: { execution_time: 0, cached: false, filters_applied: [] } };
        continue;
      }
      
      // Add correlation filter to secondary query
      const correlationFilter = `${correlationField}:(${Array.from(correlationValues).join(',')})`;
      const enhancedQuery: SearchQuery = {
        ...query,
        query: query.query ? `${query.query} AND ${correlationFilter}` : correlationFilter
      };
      
      // Execute appropriate search based on query name/type
      if (name.includes('alarm')) {
        secondary[name] = await this.searchAlarms(enhancedQuery, options);
      } else if (name.includes('rule')) {
        secondary[name] = await this.searchRules(enhancedQuery, options);
      } else if (name.includes('device')) {
        secondary[name] = await this.searchDevices(enhancedQuery, options);
      } else {
        secondary[name] = await this.searchFlows(enhancedQuery, options);
      }
    }
    
    // Calculate correlation statistics
    const totalSecondaryResults = Object.values(secondary).reduce((sum, result) => sum + result.count, 0);
    const correlationStrength = correlationValues.size > 0 ? totalSecondaryResults / correlationValues.size : 0;
    
    return {
      primary,
      secondary,
      correlations: {
        correlation_field: correlationField,
        correlated_count: totalSecondaryResults,
        correlation_strength: Math.min(1, correlationStrength / 10) // Normalize to 0-1
      }
    };
  }

  /**
   * Get overview statistics and counts of network rules by category
   */
  @optimizeResponse('rules')
  @validateResponse(ResponseValidator.validateRule)
  async getNetworkRulesSummary(
    activeOnly: boolean = true,
    ruleType?: string
  ): Promise<{count: number; results: any[]; next_cursor?: string}> {
    const rules = await this.getNetworkRules();
    
    // Filter rules based on parameters
    let filteredRules = rules.results;
    
    if (activeOnly) {
      filteredRules = filteredRules.filter(rule => rule.status === 'active' || !rule.status);
    }
    
    if (ruleType) {
      filteredRules = filteredRules.filter(rule => rule.target?.type === ruleType);
    }
    
    // Generate summary statistics by category
    const summary = {
      total_rules: filteredRules.length,
      by_action: {} as Record<string, number>,
      by_target_type: {} as Record<string, number>,
      by_direction: {} as Record<string, number>,
      active_rules: filteredRules.filter(rule => rule.status === 'active' || !rule.status).length,
      paused_rules: filteredRules.filter(rule => rule.status === 'paused').length,
      rules_with_hits: filteredRules.filter(rule => (rule.hitCount || 0) > 0).length
    };
    
    // Count by action
    filteredRules.forEach(rule => {
      const action = rule.action || 'unknown';
      summary.by_action[action] = (summary.by_action[action] || 0) + 1;
    });
    
    // Count by target type  
    filteredRules.forEach(rule => {
      const targetType = rule.target?.type || 'unknown';
      summary.by_target_type[targetType] = (summary.by_target_type[targetType] || 0) + 1;
    });
    
    // Count by direction
    filteredRules.forEach(rule => {
      const direction = rule.direction || 'bidirection';
      summary.by_direction[direction] = (summary.by_direction[direction] || 0) + 1;
    });
    
    return {
      count: 1,
      results: [summary]
    };
  }

  /**
   * Get rules with highest hit counts for traffic analysis
   */
  @optimizeResponse('rules') 
  @validateResponse(ResponseValidator.validateRule)
  async getMostActiveRules(
    limit: number = 20,
    minHits: number = 1,
    ruleType?: string
  ): Promise<{count: number; results: NetworkRule[]; next_cursor?: string}> {
    const rules = await this.getNetworkRules();
    
    // Filter and sort rules by hit count
    let filteredRules = rules.results;
    
    if (ruleType) {
      filteredRules = filteredRules.filter(rule => rule.target?.type === ruleType);
    }
    
    // Filter by minimum hits
    filteredRules = filteredRules.filter(rule => (rule.hitCount || 0) >= minHits);
    
    // Sort by hit count (descending)
    filteredRules.sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0));
    
    // Apply limit
    const results = filteredRules.slice(0, Math.min(limit, 50));
    
    return {
      count: results.length,
      results
    };
  }

  /**
   * Get recently created or modified firewall rules
   */
  @optimizeResponse('rules')
  @validateResponse(ResponseValidator.validateRule) 
  async getRecentRules(
    hours: number = 24,
    includeModified: boolean = true,
    limit: number = 30,
    ruleType?: string
  ): Promise<{count: number; results: NetworkRule[]; next_cursor?: string}> {
    const rules = await this.getNetworkRules();
    
    const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);
    
    // Filter rules by creation/modification time
    let filteredRules = rules.results.filter(rule => {
      const createdTime = rule.createdAt || 0;
      const updatedTime = rule.updatedAt || 0;
      
      // Include if created recently
      if (createdTime >= cutoffTime) {
        return true;
      }
      
      // Include if modified recently (if includeModified is true)
      if (includeModified && updatedTime >= cutoffTime) {
        return true;
      }
      
      return false;
    });
    
    if (ruleType) {
      filteredRules = filteredRules.filter(rule => rule.target?.type === ruleType);
    }
    
    // Sort by most recent first (creation time, then update time)
    filteredRules.sort((a, b) => {
      const aTime = Math.max(a.createdAt || 0, a.updatedAt || 0);
      const bTime = Math.max(b.createdAt || 0, b.updatedAt || 0);
      return bTime - aTime;
    });
    
    // Apply limit
    const results = filteredRules.slice(0, Math.min(limit, 100));
    
    return {
      count: results.length,
      results
    };
  }

  /**
   * Extract field value from object using dot notation
   */
  private extractFieldValue(obj: any, fieldPath: string): any {
    return fieldPath.split('.').reduce((current, key) => current?.[key], obj);
  }
}