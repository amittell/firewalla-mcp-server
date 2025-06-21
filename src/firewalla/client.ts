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
    
    this.api = axios.create({
      baseURL: config.mspBaseUrl,
      timeout: config.apiTimeout,
      headers: {
        'Authorization': `Bearer ${config.mspToken}`,
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

      if (!response.data.success) {
        throw new Error(response.data.error || 'API request failed');
      }

      const result = response.data.data;
      
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

    return this.request<Alarm[]>('GET', `/api/v1/alarms/${this.config.boxId}`, params);
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

    return this.request<FlowData>('GET', `/api/v1/flow/${this.config.boxId}`, params);
  }

  async getDeviceStatus(deviceId?: string, includeOffline = true): Promise<Device[]> {
    const params: Record<string, unknown> = {
      include_offline: includeOffline,
    };
    
    if (deviceId) {
      params.device_id = deviceId;
    }

    return this.request<Device[]>('GET', `/api/v1/devices/${this.config.boxId}`, params);
  }

  async getBandwidthUsage(period: string, top = 10): Promise<BandwidthUsage[]> {
    const params = {
      period,
      top,
    };

    return this.request<BandwidthUsage[]>('GET', `/api/v1/bandwidth/${this.config.boxId}`, params);
  }

  async getNetworkRules(ruleType?: string, activeOnly = true): Promise<NetworkRule[]> {
    const params: Record<string, unknown> = {
      active_only: activeOnly,
    };
    
    if (ruleType) {
      params.rule_type = ruleType;
    }

    return this.request<NetworkRule[]>('GET', `/api/v1/rules/${this.config.boxId}`, params);
  }

  async pauseRule(ruleId: string, duration = 60): Promise<{ success: boolean; message: string }> {
    const params = {
      rule_id: ruleId,
      duration_minutes: duration,
    };

    return this.request<{ success: boolean; message: string }>(
      'POST',
      `/api/v1/rules/${this.config.boxId}/pause`,
      params,
      false
    );
  }

  async getTargetLists(listType?: string): Promise<TargetList[]> {
    const params: Record<string, unknown> = {};
    
    if (listType && listType !== 'all') {
      params.list_type = listType;
    }

    return this.request<TargetList[]>('GET', `/api/v1/target-lists/${this.config.boxId}`, params);
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
    return this.request('GET', `/api/v1/summary/${this.config.boxId}`, undefined, true);
  }

  async getSecurityMetrics(): Promise<{
    total_alarms: number;
    active_alarms: number;
    blocked_connections: number;
    suspicious_activities: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    last_threat_detected: string;
  }> {
    return this.request('GET', `/api/v1/metrics/security/${this.config.boxId}`, undefined, true);
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
    return this.request('GET', `/api/v1/topology/${this.config.boxId}`, undefined, true);
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
    return this.request('GET', `/api/v1/threats/recent/${this.config.boxId}`, params, true);
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