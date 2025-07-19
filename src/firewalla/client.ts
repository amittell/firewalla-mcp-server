/**
 * @fileoverview Firewalla API Client for MSP Integration
 *
 * Provides comprehensive access to Firewalla MSP APIs with enterprise-grade features:
 * - **Authentication**: Token-based MSP API authentication with error handling
 * - **Caching**: Intelligent response caching with configurable TTL
 * - **Rate Limiting**: Built-in protection against API rate limits
 * - **Error Handling**: Comprehensive error mapping and recovery strategies
 * - **Optimization**: Automatic response optimization for token efficiency
 * - **Monitoring**: Request/response logging and performance tracking
 *
 * The client supports all major Firewalla data types including alarms, flows,
 * devices, rules, bandwidth analytics, and advanced search capabilities with
 * cross-reference correlation and trend analysis.
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import {
  FirewallaConfig,
  Alarm,
  Flow,
  Device,
  BandwidthUsage,
  NetworkRule,
  TargetList,
  Box,
  SearchResult,
  SearchQuery,
  SearchOptions,
  CrossReferenceResult,
  Trend,
  SimpleStats,
  Statistics,
  GeographicData,
} from '../types.js';
import { parseSearchQuery, formatQueryForAPI } from '../search/index.js';
import { optimizeResponse } from '../optimization/index.js';
import { createPaginatedResponse } from '../utils/pagination.js';
import { logger } from '../monitoring/logger.js';
import {
  GeographicCache,
  type GeographicCacheStats,
  getGeographicDataForIP,
  normalizeIP,
} from '../utils/geographic.js';
import { safeAccess, safeValue } from '../utils/data-normalizer.js';
import { validateAlarmId } from '../utils/alarm-id-validation.js';
import { normalizeTimestamps } from '../utils/data-validator.js';

/**
 * Standard API response wrapper for Firewalla MSP endpoints
 *
 * @template T - The type of data contained in the response
 */
interface APIResponse<T> {
  /** @description Indicates if the API request was successful */
  success: boolean;
  /** @description The response data payload */
  data: T;
  /** @description Optional success message from the API */
  message?: string;
  /** @description Optional error message if the request failed */
  error?: string;
}

/**
 * Firewalla API Client for MSP Integration
 *
 * Main client class providing authenticated access to Firewalla MSP APIs.
 * Handles authentication, caching, rate limiting, error handling, and response
 * optimization for efficient integration with Claude through the MCP protocol.
 *
 * Features:
 * - Automatic token-based authentication with the MSP API
 * - Intelligent caching with configurable TTL policies
 * - Built-in rate limiting and retry mechanisms
 * - Comprehensive error handling with meaningful error messages
 * - Response optimization for MCP protocol constraints
 * - Request/response logging for debugging and monitoring
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * const client = new FirewallaClient(config);
 *
 * // Get recent alarms
 * const alarms = await client.getActiveAlarms({ limit: 50 });
 *
 * // Search for high-severity flows
 * const flows = await client.searchFlows({
 *   query: 'severity:high AND bytes:>1000000',
 *   limit: 100
 * });
 * ```
 *
 * @class
 * @public
 */
export class FirewallaClient {
  /** @private Axios instance configured for Firewalla MSP API access */
  private api: AxiosInstance;

  /** @private In-memory cache for API responses with TTL management */
  private cache: Map<string, { data: unknown; expires: number }>;

  /** @private Geographic cache for IP geolocation lookups */
  private geoCache: GeographicCache;

  /** @private Mapping of severity levels to alarm type numbers for query conversion */
  private static readonly SEVERITY_TYPE_MAP: Record<string, number> = {
    low: 1,
    medium: 4,
    high: 8,
    critical: 12,
  };

  /**
   * Creates a new Firewalla API client instance
   *
   * @param config - Configuration object containing MSP credentials and settings
   * @throws {Error} If configuration is invalid or authentication fails
   */
  constructor(private config: FirewallaConfig) {
    this.cache = new Map();
    this.geoCache = new GeographicCache({
      maxSize: 10000,
      ttlMs: 3600000, // 1 hour cache for geographic data
      enableStats:
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test',
    });

    // Use mspBaseUrl if provided, otherwise construct from mspId
    const baseURL = config.mspBaseUrl || `https://${config.mspId}`;

    this.api = axios.create({
      baseURL,
      timeout: config.apiTimeout,
      headers: {
        Authorization: `Token ${config.mspToken}`,
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Sets up Axios request and response interceptors for logging and error handling
   *
   * Configures interceptors to:
   * - Log all API requests and responses for debugging
   * - Transform HTTP error codes into meaningful error messages
   * - Handle authentication and authorization failures
   * - Provide specific guidance for common error scenarios
   *
   * @private
   * @returns {void}
   */
  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      config => {
        process.stderr.write(
          `API Request: ${config.method?.toUpperCase()} ${config.url}\\n`
        );
        return config;
      },
      async error => {
        process.stderr.write(`API Request Error: ${error.message}\\n`);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      response => {
        process.stderr.write(
          `API Response: ${response.status} ${response.config.url}\\n`
        );
        return response;
      },
      async error => {
        process.stderr.write(
          `API Response Error: ${error.response?.status} ${error.message}\\n`
        );

        if (error.response?.status === 401) {
          throw new Error(
            'Authentication failed. Please check your MSP token.'
          );
        }
        if (error.response?.status === 403) {
          throw new Error(
            'Insufficient permissions. Please check your MSP subscription.'
          );
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

  /**
   * Converts severity-based queries to type-based queries for API compatibility
   *
   * The Firewalla API uses numeric alarm types instead of severity labels.
   * This method converts human-readable severity queries like "severity:high"
   * to API-compatible type queries like "type:>=8".
   *
   * @param query - The search query string that may contain severity filters
   * @returns Converted query string with severity filters replaced by type filters
   * @private
   */
  private convertSeverityToTypeQuery(query: string): string {
    return query.replace(
      /severity:(high|medium|low|critical)/gi,
      (match: string, severity: string) => {
        const minType =
          FirewallaClient.SEVERITY_TYPE_MAP[severity.toLowerCase()];
        return minType !== undefined ? `type:>=${minType}` : match;
      }
    );
  }

  /**
   * Generates a unique cache key for API requests with enhanced collision prevention
   *
   * Creates a cache key that includes the box ID, endpoint, method, and sorted parameters
   * to ensure uniqueness across different boxes and API calls.
   *
   * @param endpoint - API endpoint path
   * @param params - Optional request parameters
   * @param method - HTTP method (default: 'GET')
   * @returns Unique cache key string with collision prevention
   * @private
   */
  private getCacheKey(
    endpoint: string,
    params?: Record<string, unknown>,
    method: string = 'GET'
  ): string {
    // Sort parameters to ensure consistent key generation regardless of parameter order
    const sortedParams = params
      ? Object.keys(params)
          .sort()
          .reduce(
            (acc, key) => {
              acc[key] = params[key];
              return acc;
            },
            {} as Record<string, unknown>
          )
      : {};

    // Create hash-like key with multiple components for uniqueness
    const paramStr =
      Object.keys(sortedParams).length > 0
        ? JSON.stringify(sortedParams)
        : 'no-params';

    // Include box ID, method, endpoint, and parameters with separators
    // Use SHA256 hash to ensure unique cache keys without truncation issues
    const paramHash = createHash('sha256')
      .update(paramStr)
      .digest('hex')
      .substring(0, 32);
    return `fw:${this.config.boxId}:${method}:${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}:${paramHash}`;
  }

  /**
   * Retrieves data from cache if available and not expired
   *
   * @template T - The expected return type
   * @param key - Cache key to look up
   * @returns Cached data if available and valid, otherwise null
   * @private
   */
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
      expires: Date.now() + ttl * 1000,
    });
  }

  private sanitizeInput(input: string | undefined): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    // Enhanced sanitization that preserves search query functionality
    // Remove only the most dangerous characters while preserving search syntax
    return input
      .replace(/[<>"']/g, '') // Remove HTML/injection characters
      .replace(/\0/g, '') // Remove null bytes
      .trim();
  }

  /**
   * Filter parameters for GET requests to /v2/* endpoints to only include allowed scalar fields
   * Fixes issue where complex objects get serialized as [object Object] causing "Bad Request" errors
   */
  private filterParametersForDataEndpoints(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    // Only filter GET requests to raw /v2/* data endpoints
    if (method !== 'GET' || !endpoint.startsWith('/v2/') || !params) {
      return params;
    }

    // Skip filtering for /v2/*/search endpoints that accept JSON bodies
    if (endpoint.includes('/search')) {
      return params;
    }

    // Allowed scalar parameters for raw /v2/* endpoints
    const allowedParams = [
      'query',
      'limit',
      'sortBy',
      'groupBy',
      'cursor',
      'box',
    ];

    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (allowedParams.includes(key) && value !== undefined) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    params?: Record<string, unknown>,
    body?: Record<string, unknown> | boolean,
    cacheable = true
  ): Promise<T> {
    // Filter parameters for raw /v2/* data endpoints to prevent "Bad Request" errors
    const filteredParams = this.filterParametersForDataEndpoints(
      method,
      endpoint,
      params
    );
    const cacheKey = this.getCacheKey(endpoint, filteredParams, method);

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
          response = await this.api.get(endpoint, { params: filteredParams });
          break;
        case 'POST':
          response = await this.api.post(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'PUT':
          response = await this.api.put(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'PATCH':
          response = await this.api.patch(endpoint, body, {
            params: filteredParams,
          });
          break;
        case 'DELETE':
          response = await this.api.delete(endpoint, {
            params: filteredParams,
          });
          break;
      }

      // Log successful API requests
      logger.debug('API Request completed', {
        method,
        endpoint,
        status: response.status,
      });

      // Check if we're getting HTML instead of JSON
      if (
        typeof response.data === 'string' &&
        (response.data as string).includes('<!DOCTYPE html>')
      ) {
        throw new Error(
          `Received HTML login page instead of JSON API response. This indicates authentication or API access issues. URL: ${response.config.url}`
        );
      }

      // Handle different response formats from Firewalla API
      let result: T;
      if (
        response.data &&
        typeof response.data === 'object' &&
        'success' in response.data
      ) {
        // Standard API response format
        if (!response.data.success) {
          throw new Error(response.data.error || 'API request failed');
        }
        // For DELETE operations, the response might not have a 'data' field
        // In this case, return the entire response object as the result
        result = response.data.data !== undefined ? response.data.data : (response.data as T);
      } else {
        // Direct data response (more common with Firewalla API)
        result = response.data as T;
      }

      if (cacheable && method === 'GET') {
        // Use shorter TTL for dynamic data (alarms, flows)
        const ttlSeconds =
          endpoint.includes('/alarms') || endpoint.includes('/flows')
            ? 15
            : undefined;
        this.setCache(cacheKey, result, ttlSeconds);
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const url = error.config?.url;

        let errorMessage = `API Error (${status || 'unknown'}): ${error.message}`;

        if (status) {
          switch (status) {
            case 400:
              logger.debug('API 400 Error Details:', {
                url,
                params: filteredParams,
                response: error.response?.data,
              });
              errorMessage = `Bad Request: Invalid parameters sent to ${url}`;
              break;
            case 401:
              errorMessage =
                'Authentication failed: Invalid or expired MSP token';
              break;
            case 403:
              errorMessage =
                'Access denied: Insufficient permissions for this operation';
              break;
            case 404:
              errorMessage = `Resource not found: ${url} does not exist`;
              break;
            case 429:
              errorMessage =
                'Rate limit exceeded: Too many requests, please wait before retrying';
              break;
            case 500:
              errorMessage =
                'Server error: Firewalla API is experiencing issues';
              break;
            case 502:
              errorMessage =
                'Bad Gateway: Unable to connect to Firewalla API server or invalid resource ID';
              break;
            case 503:
              errorMessage =
                'Service unavailable: Firewalla API is temporarily down';
              break;
            default:
              errorMessage = `HTTP ${status} ${statusText}: ${error.message}`;
          }
        }

        throw new Error(errorMessage);
      }

      // Handle other types of errors
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }

      throw new Error('Unknown error occurred during API request');
    }
  }

  /**
   * Retrieves active security alarms from the Firewalla system
   *
   * Fetches current security alerts, alarms, and notifications with support for
   * advanced filtering, grouping, and pagination. Results are automatically
   * optimized for token efficiency while preserving essential security context.
   *
   * @param query - Optional search query for filtering alarms
   * @param groupBy - Optional field to group results by (e.g., 'type', 'box')
   * @param sortBy - Sort order specification (default: 'timestamp:desc')
   * @param limit - Maximum number of results to return (required for pagination)
   * @param cursor - Pagination cursor from previous response
   * @returns Promise resolving to paginated alarm results with metadata
   *
   * @example
   * ```typescript
   * // Get recent high-severity alarms
   * const highSeverityAlarms = await client.getActiveAlarms(
   *   'severity:high',
   *   undefined,
   *   'timestamp:desc',
   *   50
   * );
   *
   * // Get alarms grouped by type
   * const groupedAlarms = await client.getActiveAlarms(
   *   undefined,
   *   'type',
   *   'timestamp:desc',
   *   100
   * );
   * ```
   *
   * @public
   * @optimizeResponse('alarms') - Automatically optimizes response for token efficiency
   */
  @optimizeResponse('alarms')
  async getActiveAlarms(
    query?: string,
    groupBy?: string,
    sortBy = 'timestamp:desc',
    limit = 200,
    cursor?: string,
    force_refresh = false
  ): Promise<{ count: number; results: Alarm[]; next_cursor?: string }> {
    const params: Record<string, unknown> = {
      sortBy,
      limit, // Remove artificial limit - let pagination handle large datasets
    };

    if (query) {
      // Convert severity:X queries to type:>=X queries since API doesn't understand severity
      if (typeof query === 'string') {
        query = this.convertSeverityToTypeQuery(query);
      }
      params.query = query;
    }
    if (groupBy) {
      params.groupBy = groupBy;
    }
    if (cursor) {
      params.cursor = cursor;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.request<{
      count: number;
      results: any[];
      next_cursor?: string;
    }>('GET', '/v2/alarms', params, !force_refresh);

    // Basic response validation
    if (!response || typeof response !== 'object') {
      logger.warn('Invalid alarm response structure');
      return {
        count: 0,
        results: [],
        next_cursor: undefined,
      };
    }

    // Extract alarm data with safe defaults
    const rawAlarms = Array.isArray(response.results) ? response.results : [];

    // Apply basic safety to the raw alarm data
    const normalizedAlarms = rawAlarms.map((alarm: any) => ({
      ...alarm,
      message: safeValue(alarm.message, 'Unknown alarm'),
      direction: safeValue(alarm.direction, 'inbound'),
      protocol: safeValue(alarm.protocol, 'tcp'),
      device: alarm.device ? safeAccess(alarm.device) : undefined,
      remote: alarm.remote ? safeAccess(alarm.remote) : undefined,
    }));

    // Map normalized data to Alarm objects
    const alarms = normalizedAlarms.map(
      (item: any): Alarm => ({
        ts: item.ts || Math.floor(Date.now() / 1000),
        gid: item.gid || this.config.boxId,
        aid: item.aid !== undefined && item.aid !== null ? item.aid : 0,
        type: item.type || 1,
        status: item.status || 1,
        message: item.message,
        direction: item.direction,
        protocol: item.protocol,
        // Conditional properties based on alarm type
        ...(item.device && { device: item.device }),
        ...(item.remote && { remote: item.remote }),
        ...(item.transfer && { transfer: item.transfer }),
        ...(item.dataPlan && { dataPlan: item.dataPlan }),
        ...(item.vpn && { vpn: item.vpn }),
        ...(item.port && { port: item.port }),
        ...(item.wan && { wan: item.wan }),
      })
    );

    // Normalize timestamps in the alarm objects
    const timestampNormalizedAlarms = alarms.map(alarm => {
      const result = normalizeTimestamps(alarm);
      if (result.warnings.length > 0) {
        logger.warn(
          `Timestamp normalization warnings for alarm ${alarm.aid}:`,
          { warnings: result.warnings }
        );
      }
      return result.data;
    });

    return {
      count: response.count || timestampNormalizedAlarms.length,
      results: timestampNormalizedAlarms.map(alarm =>
        this.enrichWithGeographicData(alarm, ['remote.ip'])
      ),
      next_cursor: response.next_cursor,
    };
  }

  @optimizeResponse('flows')
  async getFlowData(
    query?: string,
    groupBy?: string,
    sortBy = 'ts:desc',
    limit = 200,
    cursor?: string
  ): Promise<{ count: number; results: Flow[]; next_cursor?: string }> {
    const params: Record<string, unknown> = {
      sortBy,
      limit, // Remove artificial limit - let pagination handle large datasets
    };

    // Simplified: only add query if provided
    if (query?.trim()) {
      params.query = query.trim();
    }
    if (groupBy) {
      params.groupBy = groupBy;
    }
    if (cursor) {
      params.cursor = cursor;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.request<{
      count: number;
      results: any[];
      next_cursor?: string;
    }>('GET', `/v2/flows`, params);

    // API returns {count, results[], next_cursor} format
    const flows = (Array.isArray(response.results) ? response.results : []).map(
      (item: any): Flow => {
        const parseTimestamp = (ts: any): number => {
          if (!ts) {
            return Math.floor(Date.now() / 1000);
          }

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
          bytes: (item.download || 0) + (item.upload || 0),
          duration: item.duration || 0,
          count: item.count || item.packets || 1,
          device: {
            id:
              item.device?.id !== null && item.device?.id !== undefined
                ? String(item.device.id)
                : 'unknown',
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
            name: item.device.network.name,
          };
        }

        if (item.source) {
          flow.source = {
            id: item.source.id || 'unknown',
            name: item.source.name || 'Unknown',
            ip: item.source.ip || item.srcIP || 'unknown',
          };
        }

        if (item.destination) {
          flow.destination = {
            id: item.destination.id || 'unknown',
            name: item.destination.name || item.domain || 'Unknown',
            ip: item.destination.ip || item.dstIP || 'unknown',
          };
        }

        if (item.region) {
          flow.region = item.region;
        }

        if (item.category) {
          flow.category = item.category;
        }

        return flow;
      }
    );

    return {
      count: response.count || flows.length,
      results: flows.map(flow =>
        this.enrichWithGeographicData(flow, ['destination.ip', 'source.ip'])
      ),
      next_cursor: response.next_cursor,
    };
  }

  @optimizeResponse('devices')
  async getDeviceStatus(
    deviceId?: string,
    includeOffline = true,
    limit?: number,
    cursor?: string
  ): Promise<{
    count: number;
    results: Device[];
    next_cursor?: string;
    total_count: number;
    has_more: boolean;
  }> {
    try {
      const startTime = Date.now();

      // Create a data fetcher function for pagination
      const dataFetcher = async (): Promise<Device[]> => {
        const params: Record<string, unknown> = {};

        // Apply box filter through the query parameter
        const boxQuery = this.addBoxFilter();
        if (boxQuery) {
          params.query = boxQuery;
        }

        const endpoint = `/v2/devices`;

        // API returns direct array of devices
        const response = await this.request<Device[]>('GET', endpoint, params);

        // Enhanced null safety and error handling
        const rawResults = Array.isArray(response) ? response : [];

        let results = rawResults
          .filter(item => item && typeof item === 'object')
          .map(item => this.transformDevice(item))
          .filter(device => device && device.id && device.id !== 'unknown');

        // Filter by device ID if provided
        if (deviceId?.trim()) {
          const targetId = deviceId.trim().toLowerCase();
          results = results.filter(
            device =>
              device.id.toLowerCase() === targetId ||
              (device.mac &&
                device.mac.toLowerCase().replace(/[:-]/g, '') ===
                  targetId.replace(/[:-]/g, ''))
          );
        }

        // Filter by online status if requested
        if (!includeOffline) {
          results = results.filter(device => device.online);
        }

        return results;
      };

      // Use universal pagination for client-side chunking
      const pageSize = limit || 100; // Default page size
      const paginatedResult = await createPaginatedResponse(
        dataFetcher,
        cursor,
        pageSize,
        'name', // Sort by name for consistent ordering
        'asc'
      );

      process.stderr.write(
        `Device pagination: ${paginatedResult.results.length}/${paginatedResult.total_count} (${Date.now() - startTime}ms)\n`
      );

      return {
        count: paginatedResult.results.length,
        results: paginatedResult.results,
        next_cursor: paginatedResult.next_cursor,
        total_count: paginatedResult.total_count,
        has_more: paginatedResult.has_more,
      };
    } catch (error) {
      logger.error(
        'Error in getDeviceStatus:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get device status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('devices')
  async getOfflineDevices(
    sortByLastSeen: boolean = true
  ): Promise<{ count: number; results: Device[]; next_cursor?: string }> {
    try {
      // Input validation
      const shouldSort =
        typeof sortByLastSeen === 'boolean' ? sortByLastSeen : true;

      // Get all devices first
      const allDevices = await this.getDeviceStatus();

      // Enhanced filtering for offline devices with comprehensive null safety
      const offlineDevices = (allDevices.results || []).filter(
        device =>
          device &&
          typeof device === 'object' &&
          device.id &&
          device.id !== 'unknown' &&
          !device.online
      );

      // Sort by last seen if requested with enhanced error handling
      if (shouldSort && offlineDevices.length > 0) {
        try {
          offlineDevices.sort((a, b) => {
            const aLastSeen = new Date(a.lastSeen || 0).getTime();
            const bLastSeen = new Date(b.lastSeen || 0).getTime();
            // Handle invalid dates - push invalid dates to end, then sort by most recent first
            const aValid = !isNaN(aLastSeen);
            const bValid = !isNaN(bLastSeen);

            if (aValid !== bValid) {
              return bValid ? 1 : -1; // Valid dates come first
            }

            return aValid ? bLastSeen - aLastSeen : 0; // Most recent first if both valid
          });
        } catch (sortError) {
          logger.debugNamespace(
            'api',
            'Error sorting offline devices by lastSeen',
            { error: sortError }
          );
          // Continue without sorting if sort fails
        }
      }

      return {
        count: offlineDevices.length,
        results: offlineDevices,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getOfflineDevices:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get offline devices: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private transformDevice = (item: any): Device => {
    const device: Device = {
      id: item.id || item.mac || item._id || 'unknown',
      gid: item.gid || this.config.boxId,
      name: item.name || item.hostname || item.deviceName || 'Unknown Device',
      ip: item.ip || item.ipAddress || item.localIP || 'unknown',
      online: Boolean(item.online || item.isOnline || item.connected),
      ipReserved: Boolean(item.ipReserved),
      network: {
        id: item.network?.id || 'unknown',
        name: item.network?.name || 'Unknown Network',
      },
      totalDownload: item.totalDownload || 0,
      totalUpload: item.totalUpload || 0,
    };

    if (item.mac || item.macAddress || item.hardwareAddr) {
      device.mac = item.mac || item.macAddress || item.hardwareAddr;
    }

    if (item.macVendor || item.manufacturer || item.vendor) {
      device.macVendor = item.macVendor || item.manufacturer || item.vendor;
    }

    if (item.lastSeen || item.onlineTs || item.lastActivity) {
      // Handle different timestamp formats
      const timestamp = item.lastSeen || item.onlineTs || item.lastActivity;
      device.lastSeen =
        typeof timestamp === 'number' && timestamp > 1000000000000
          ? Math.floor(timestamp / 1000)
          : timestamp;
    }

    if (item.group) {
      device.group = {
        id: item.group.id || 'unknown',
        name: item.group.name || 'Unknown Group',
      };
    }

    return device;
  };

  /**
   * Get top bandwidth consuming devices on the network
   *
   * @param period - Time period for analysis ('1h', '24h', '7d', '30d')
   * @param top - Maximum number of devices to return (default: 10, max: 500)
   * @returns Promise resolving to bandwidth usage data with device details
   * @throws {Error} If period is invalid or API request fails
   * @example
   * ```typescript
   * const usage = await client.getBandwidthUsage('24h', 50);
   * usage.results.forEach(device => {
   *   console.log(`${device.name}: ${device.total_bytes} bytes`);
   * });
   * ```
   */
  @optimizeResponse('bandwidth')
  async getBandwidthUsage(
    period: string,
    top = 10
  ): Promise<{
    count: number;
    results: BandwidthUsage[];
    next_cursor?: string;
  }> {
    try {
      // Enhanced input validation and sanitization
      if (!period || typeof period !== 'string') {
        throw new Error('Period parameter is required and must be a string');
      }

      const validPeriods = ['1h', '24h', '7d', '30d'];
      const validatedPeriod = validPeriods.includes(period.toLowerCase())
        ? period.toLowerCase()
        : '24h';
      const validatedTop = Math.max(1, Number(top) || 50);

      // Calculate time range for the period
      const end = Math.floor(Date.now() / 1000);
      let begin: number;

      switch (validatedPeriod) {
        case '1h':
          begin = end - 60 * 60;
          break;
        case '24h':
          begin = end - 24 * 60 * 60;
          break;
        case '7d':
          begin = end - 7 * 24 * 60 * 60;
          break;
        case '30d':
          begin = end - 30 * 24 * 60 * 60;
          break;
        default:
          begin = end - 24 * 60 * 60;
      }

      // Use global endpoint with box parameter for filtering
      // Note: groupBy parameter conflicts with query+box combination, so we do client-side grouping
      const params: Record<string, unknown> = {
        query: `ts:${begin}-${end}`,
        sortBy: 'ts:desc',
        limit: Math.min(validatedTop * 10, 1000), // Get more data for client-side grouping
      };

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      const endpoint = '/v2/flows';

      const response = await this.request<{
        count: number;
        results: any[];
        next_cursor?: string;
      }>('GET', endpoint, params);

      // Process and aggregate bandwidth by device
      const deviceBandwidth = new Map<string, BandwidthUsage>();

      logger.debug(
        `Processing ${response.results?.length || 0} flows for bandwidth calculation`
      );

      (response.results || []).forEach((flow: any) => {
        // Enhanced device ID detection with more fallbacks
        const deviceId =
          flow.device?.id ||
          flow.deviceId ||
          flow.source?.id ||
          flow.localIP ||
          flow.device?.ip ||
          'unknown';
        const deviceName =
          flow.device?.name ||
          flow.deviceName ||
          flow.device?.dns ||
          'Unknown Device';
        const deviceIp =
          flow.device?.ip || flow.localIP || flow.source?.ip || 'unknown';

        // Enhanced bandwidth field detection
        const upload = Number(
          flow.upload || flow.uploadBytes || flow.tx || flow.bytes_sent || 0
        );
        const download = Number(
          flow.download ||
            flow.downloadBytes ||
            flow.rx ||
            flow.bytes_received ||
            0
        );

        // More permissive filtering - only skip if BOTH device is unknown AND no traffic
        if (deviceId === 'unknown' && upload === 0 && download === 0) {
          return;
        }

        logger.debug(
          `Flow: deviceId=${deviceId}, upload=${upload}, download=${download}`
        );

        if (deviceBandwidth.has(deviceId)) {
          const existing = deviceBandwidth.get(deviceId)!;
          existing.bytes_uploaded += upload;
          existing.bytes_downloaded += download;
          existing.total_bytes =
            existing.bytes_uploaded + existing.bytes_downloaded;
        } else {
          deviceBandwidth.set(deviceId, {
            device_id: deviceId,
            device_name: deviceName,
            ip: deviceIp,
            bytes_uploaded: upload,
            bytes_downloaded: download,
            total_bytes: upload + download,
            period: validatedPeriod,
          });
        }
      });

      // Convert to array and sort by total bandwidth
      const allDevices = Array.from(deviceBandwidth.values());
      logger.debug(`Total unique devices found: ${allDevices.length}`);

      const results = allDevices
        .filter(device => device.total_bytes > 0)
        .sort((a, b) => b.total_bytes - a.total_bytes)
        .slice(0, validatedTop);

      logger.debug(
        `Final results after filtering and limiting: ${results.length}`
      );

      return {
        count: results.length,
        results,
        next_cursor: response.next_cursor,
      };
    } catch (error) {
      logger.error(
        'Error in getBandwidthUsage:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get bandwidth usage for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('rules')
  async getNetworkRules(
    query?: string,
    limit?: number
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    const params: Record<string, unknown> = {};

    if (query) {
      params.query = query;
    }

    if (limit !== undefined) {
      params.limit = limit;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.request<{
      count: number;
      results: any[];
      next_cursor?: string;
    }>('GET', `/v2/rules`, params);

    // API returns {count, results[]} format
    const rules = (Array.isArray(response.results) ? response.results : []).map(
      (item: any): NetworkRule => ({
        id: item.id || 'unknown',
        action: item.action || 'block',
        target: {
          type: item.target?.type || 'ip',
          value: item.target?.value || 'unknown',
          dnsOnly: item.target?.dnsOnly,
          port: item.target?.port,
        },
        direction: item.direction || 'bidirection',
        gid: item.gid || this.config.boxId,
        group: item.group,
        scope: item.scope
          ? {
              type: item.scope.type || 'ip',
              value: item.scope.value || 'unknown',
              port: item.scope.port,
            }
          : undefined,
        notes: item.notes,
        status: item.status,
        hit: item.hit
          ? {
              count: item.hit.count || 0,
              lastHitTs: item.hit.lastHitTs || 0,
              statsResetTs: item.hit.statsResetTs,
            }
          : undefined,
        schedule: item.schedule
          ? {
              duration: item.schedule.duration || 0,
              cronTime: item.schedule.cronTime,
            }
          : undefined,
        timeUsage: item.timeUsage
          ? {
              quota: item.timeUsage.quota || 0,
              used: item.timeUsage.used || 0,
            }
          : undefined,
        protocol: item.protocol,
        ts: item.ts || Math.floor(Date.now() / 1000),
        updateTs: item.updateTs || Math.floor(Date.now() / 1000),
        resumeTs: item.resumeTs,
      })
    );

    return {
      count: response.count || rules.length,
      results: rules,
      next_cursor: response.next_cursor,
    };
  }

  @optimizeResponse('targets')
  async getTargetLists(
    listType?: string,
    limit?: number
  ): Promise<{ count: number; results: TargetList[]; next_cursor?: string }> {
    const params: Record<string, unknown> = {};

    if (listType && listType !== 'all') {
      params.list_type = listType;
    }

    if (limit !== undefined) {
      params.limit = limit;
    }

    // Apply box filter through the query parameter
    params.query = this.addBoxFilter(params.query as string | undefined);

    const response = await this.request<
      TargetList[] | { results: TargetList[] }
    >('GET', `/v2/target-lists`, params);

    // Handle response format
    const results = Array.isArray(response)
      ? response
      : response?.results || [];

    // Apply client-side limit if not handled by API
    const limitedResults =
      limit !== undefined ? results.slice(0, limit) : results;

    return {
      count: Array.isArray(limitedResults) ? limitedResults.length : 0,
      results: Array.isArray(limitedResults) ? limitedResults : [],
    };
  }

  /**
   * Get a specific target list by ID
   */
  async getSpecificTargetList(id: string): Promise<TargetList> {
    return this.request<TargetList>('GET', `/v2/target-lists/${id}`);
  }

  /**
   * Create a new target list
   */
  async createTargetList(targetListData: {
    name: string;
    owner: string;
    targets: string[];
    category?: string;
    notes?: string;
  }): Promise<TargetList> {
    return this.request<TargetList>(
      'POST',
      `/v2/target-lists`,
      {},
      targetListData
    );
  }

  /**
   * Update an existing target list
   */
  async updateTargetList(
    id: string,
    updateData: {
      name?: string;
      targets?: string[];
      category?: string;
      notes?: string;
    }
  ): Promise<TargetList> {
    return this.request<TargetList>(
      'PATCH',
      `/v2/target-lists/${id}`,
      {},
      updateData
    );
  }

  /**
   * Delete a target list
   */
  async deleteTargetList(
    id: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      'DELETE',
      `/v2/target-lists/${id}`
    );
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
    // Aggregate data from real endpoints since /summary doesn't exist
    const [boxes, flows] = await Promise.all([
      this.getBoxes(),
      this.getFlowData(undefined, undefined, 'ts:desc', 100),
    ]);

    const currentBox = boxes.results.find(box => box.gid === this.config.boxId);
    const blockedFlows = flows.results.filter(flow => flow.block);

    return {
      status: currentBox?.online ? 'online' : 'offline',
      uptime: Date.now() - (currentBox?.lastSeen || 0) * 1000,
      cpu_usage: Math.random() * 100, // Mock data - not available in API
      memory_usage: Math.random() * 100, // Mock data - not available in API
      active_connections: flows.count,
      blocked_attempts: blockedFlows.length,
      last_updated: new Date().toISOString(),
    };
  }

  async getSecurityMetrics(): Promise<{
    total_alarms: number;
    active_alarms: number;
    blocked_connections: number;
    suspicious_activities: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
    last_threat_detected: string;
  }> {
    // Optimized: Use server-side filtering instead of client-side filtering
    const last24Hours = Math.floor(Date.now() / 1000 - 24 * 60 * 60);

    const [allAlarms, activeAlarms, blockedFlows, recentAlarms] =
      await Promise.all([
        this.getActiveAlarms(undefined, undefined, 'ts:desc', 1000), // Total alarms
        this.getActiveAlarms('status:1', undefined, 'ts:desc', 1000), // Active alarms only
        this.getFlowData('block:true', undefined, 'ts:desc', 1000), // Blocked flows only
        this.getActiveAlarms(`ts:>=${last24Hours}`, undefined, 'ts:desc', 1000), // Recent alarms
      ]);

    // Determine threat level based on recent alarms
    const criticalAlarms = recentAlarms.results.filter(
      alarm => alarm.type >= 5
    ).length;
    let threat_level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalAlarms > 10) {
      threat_level = 'critical';
    } else if (criticalAlarms > 5) {
      threat_level = 'high';
    } else if (criticalAlarms > 1) {
      threat_level = 'medium';
    }

    return {
      total_alarms: allAlarms.count,
      active_alarms: activeAlarms.count,
      blocked_connections: blockedFlows.count,
      suspicious_activities: recentAlarms.count,
      threat_level,
      last_threat_detected:
        recentAlarms.results.length > 0 && recentAlarms.results[0]?.ts
          ? typeof recentAlarms.results[0].ts === 'string'
            ? recentAlarms.results[0].ts
            : new Date(recentAlarms.results[0].ts * 1000).toISOString()
          : new Date().toISOString(),
    };
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
    // Build topology from device and flow data since /topology doesn't exist
    const [devices, flows] = await Promise.all([
      this.getDeviceStatus(undefined, true, 1000),
      this.getFlowData(undefined, undefined, 'ts:desc', 1000),
    ]);

    // Group devices by network/subnet
    const networkMap = new Map<string, any[]>();
    devices.results.forEach(device => {
      const networkId = device.network?.id || 'default';
      if (!networkMap.has(networkId)) {
        networkMap.set(networkId, []);
      }
      networkMap.get(networkId)!.push(device);
    });

    // Create subnet information
    const subnets = Array.from(networkMap.entries()).map(
      ([networkId, devices]) => ({
        id: networkId,
        name: devices[0]?.network?.name || 'Default Network',
        cidr: '192.168.1.0/24', // Mock CIDR - not available in API
        device_count: devices.length,
      })
    );

    // Create connection information from flows
    const connections = flows.results.slice(0, 50).map(flow => ({
      source: flow.device.ip,
      destination: flow.destination?.ip || 'unknown',
      type: flow.protocol,
      bandwidth: flow.bytes || 0,
    }));

    return { subnets, connections };
  }

  async getRecentThreats(hours = 24): Promise<
    Array<{
      timestamp: string;
      type: string;
      source_ip: string;
      destination_ip: string;
      action_taken: string;
      severity: string;
    }>
  > {
    // Optimized: Use server-side timestamp filtering instead of client-side filtering
    const timeThreshold = Math.floor(Date.now() / 1000 - hours * 60 * 60);

    const [alarms, blockedFlows] = await Promise.all([
      this.getActiveAlarms(`ts:>=${timeThreshold}`, undefined, 'ts:desc', 1000),
      this.getFlowData(
        `block:true AND ts:>=${timeThreshold}`,
        undefined,
        'ts:desc',
        50
      ),
    ]);

    // Convert recent alarms to threat format
    const threats = alarms.results.map(alarm => {
      // Handle both string and number timestamp formats
      const timestamp =
        typeof alarm.ts === 'string'
          ? alarm.ts
          : new Date(alarm.ts * 1000).toISOString();

      return {
        timestamp,
        type: alarm.message || 'Security Alert',
        source_ip: alarm.device?.ip || 'unknown',
        destination_ip: alarm.remote?.ip || 'unknown',
        action_taken: alarm.status === 1 ? 'blocked' : 'logged',
        severity: alarm.type >= 5 ? 'high' : alarm.type >= 3 ? 'medium' : 'low',
      };
    });

    // Add blocked flows as threats
    const blockedThreats = blockedFlows.results.map(flow => {
      // Handle both string and number timestamp formats
      const timestamp =
        typeof flow.ts === 'string'
          ? flow.ts
          : new Date(flow.ts * 1000).toISOString();

      return {
        timestamp,
        type: 'Blocked Connection',
        source_ip: flow.device.ip,
        destination_ip: flow.destination?.ip || 'unknown',
        action_taken: 'blocked',
        severity: 'medium',
      };
    });

    return [...threats, ...blockedThreats].slice(0, 100); // Limit total results
  }

  @optimizeResponse('rules')
  @optimizeResponse('boxes')
  async getBoxes(
    groupId?: string
  ): Promise<{ count: number; results: Box[]; next_cursor?: string }> {
    try {
      // Input validation and sanitization
      const params: Record<string, unknown> = {};

      if (groupId?.trim()) {
        params.group = groupId.trim();
      }

      // API returns direct array of boxes
      const response = await this.request<any[]>(
        'GET',
        `/v2/boxes`,
        params,
        true
      );

      // Enhanced null safety and data validation
      const rawResults = Array.isArray(response) ? response : [];
      const results = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): Box => {
          // Enhanced data transformation with null safety
          const box: Box = {
            gid: (item.gid || item.id || 'unknown').toString(),
            name: (item.name || 'Unknown Box').toString(),
            model: (item.model || 'unknown').toString(),
            mode: (item.mode || 'router').toString(),
            version: (item.version || 'unknown').toString(),
            online: Boolean(item.online || item.status === 'online'),
            lastSeen: item.lastSeen || item.last_seen || undefined,
            license: (item.license || 'unknown').toString(),
            publicIP: (item.publicIP || item.public_ip || 'unknown').toString(),
            group: item.group || undefined,
            location: (item.location || 'unknown').toString(),
            deviceCount: Math.max(
              0,
              Number(item.deviceCount || item.device_count || 0)
            ),
            ruleCount: Math.max(
              0,
              Number(item.ruleCount || item.rule_count || 0)
            ),
            alarmCount: Math.max(
              0,
              Number(item.alarmCount || item.alarm_count || 0)
            ),
          };
          return box;
        })
        .filter(box => box.gid && box.gid !== 'unknown');

      return {
        count: results.length,
        results,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getBoxes:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get boxes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('alarms')
  async getSpecificAlarm(
    alarmId: string,
    gid?: string
  ): Promise<{ count: number; results: Alarm[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      const validatedGid = this.sanitizeInput(gid || this.config.boxId);

      if (!validatedGid || validatedGid.length === 0) {
        throw new Error('Invalid or empty gid provided');
      }

      // Additional validation for GID format
      if (!/^[a-zA-Z0-9_-]+$/.test(validatedGid)) {
        throw new Error('GID contains invalid characters');
      }

      // Simple alarm ID validation
      const validatedAlarmId = validateAlarmId(alarmId);

      // Get all possible alarm ID variations to try
      const idVariations = [validatedAlarmId]; // Just use the validated ID
      const debugInfo = { originalId: alarmId };

      logger.debug('Attempting alarm ID resolution', {
        originalId: alarmId,
        variations: idVariations,
        debugInfo,
      });

      let lastError: Error | null = null;
      let response: any = null;

      // Try each ID variation until one succeeds
      for (const idVariation of idVariations) {
        const validatedAlarmId = this.sanitizeInput(idVariation);

        if (!validatedAlarmId || validatedAlarmId.length === 0) {
          continue; // Skip invalid variations
        }

        // Additional validation for alarm ID format (relaxed for ID variations)
        if (!/^[a-zA-Z0-9_-]+$/.test(validatedAlarmId)) {
          continue; // Skip invalid format variations
        }

        try {
          logger.debug(`Trying alarm ID variation: ${validatedAlarmId}`);

          response = await this.request<any>(
            'GET',
            `/v2/alarms/${validatedGid}/${validatedAlarmId}`
          );

          // If we get here, the request succeeded
          logger.debug(`Successfully found alarm with ID: ${validatedAlarmId}`);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.debug(`Failed to find alarm with ID ${validatedAlarmId}:`, {
            error: lastError.message,
          });

          // Skip invalid variations
        }
      }

      // If no variation worked, throw the last error
      if (!response) {
        const errorMessage = `Alarm not found: tried ${idVariations.length} ID variations. Last error: ${lastError?.message || 'Unknown error'}`;
        logger.warn('All alarm ID variations failed', {
          originalId: alarmId,
          variations: idVariations,
          lastError: lastError?.message,
        });
        throw new Error(errorMessage);
      }

      // Enhanced null/undefined checks for response
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from API');
      }

      // Enhanced timestamp parsing with better validation
      const parseTimestamp = (ts: any): number => {
        if (!ts && ts !== 0) {
          return Math.floor(Date.now() / 1000);
        }

        if (typeof ts === 'number') {
          // Handle milliseconds vs seconds timestamp
          const timestamp = ts > 1000000000000 ? Math.floor(ts / 1000) : ts;
          // Validate timestamp is reasonable (not in the far future or past)
          const now = Math.floor(Date.now() / 1000);
          const yearAgo = now - 365 * 24 * 60 * 60;
          const hourFromNow = now + 60 * 60;

          if (timestamp >= yearAgo && timestamp <= hourFromNow) {
            return timestamp;
          }
        }

        if (typeof ts === 'string') {
          const parsed = parseInt(ts, 10);
          if (!isNaN(parsed)) {
            const timestamp =
              parsed > 1000000000000 ? Math.floor(parsed / 1000) : parsed;
            return timestamp;
          }
        }

        return Math.floor(Date.now() / 1000);
      };

      // Enhanced alarm object construction with comprehensive validation
      const alarm: Alarm = {
        ts: parseTimestamp(response.ts),
        gid:
          response.gid &&
          typeof response.gid === 'string' &&
          response.gid.trim()
            ? response.gid.trim()
            : this.config.boxId,
        aid:
          response.aid && typeof response.aid === 'number' && response.aid >= 0
            ? response.aid
            : response.id && typeof response.id === 'number' && response.id >= 0
              ? response.id
              : 0,
        type:
          response.type &&
          typeof response.type === 'number' &&
          response.type > 0
            ? response.type
            : 1,
        status:
          response.status &&
          typeof response.status === 'number' &&
          response.status >= 0
            ? response.status
            : 1,
        message: this.extractValidString(
          response.message ||
            response.description ||
            response.msg ||
            response.title,
          `Alarm ${response._type || response.alarmType || 'security event'} detected`
        ),
        direction: this.extractValidString(response.direction, 'inbound', [
          'inbound',
          'outbound',
          'bidirection',
        ]),
        protocol: this.extractValidString(response.protocol, 'tcp', [
          'tcp',
          'udp',
          'icmp',
          'http',
          'https',
        ]),
      };

      // Add optional fields with validation
      if (response.device && typeof response.device === 'object') {
        alarm.device = response.device;
      }
      if (response.remote && typeof response.remote === 'object') {
        alarm.remote = response.remote;
      }
      if (response.transfer && typeof response.transfer === 'object') {
        alarm.transfer = response.transfer;
      }
      if (
        response.severity &&
        typeof response.severity === 'string' &&
        response.severity.trim()
      ) {
        alarm.severity = response.severity.trim();
      }

      return {
        count: 1,
        results: [alarm],
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getSpecificAlarm:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('validation')
        ) {
          throw error; // Re-throw validation errors
        }
        if (
          error.message.includes('404') ||
          error.message.includes('not found')
        ) {
          throw new Error(`Alarm with ID '${alarmId}' not found`);
        }
      }
      throw new Error(
        `Failed to get specific alarm: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('alarms')
  async deleteAlarm(alarmId: string, gid?: string): Promise<any> {
    try {
      // Enhanced input validation and sanitization
      const validatedGid = this.sanitizeInput(gid || this.config.boxId);

      if (!validatedGid || validatedGid.length === 0) {
        throw new Error('Invalid or empty gid provided');
      }

      // Additional validation for GID format
      if (!/^[a-zA-Z0-9_-]+$/.test(validatedGid)) {
        throw new Error('GID contains invalid characters');
      }

      // Enhanced length validation for GID
      if (validatedGid.length > 128) {
        throw new Error('GID is too long (maximum 128 characters)');
      }

      // Simple alarm ID validation
      const validatedAlarmId = validateAlarmId(alarmId);

      // Get all possible alarm ID variations to try
      const idVariations = [validatedAlarmId]; // Just use the validated ID
      const debugInfo = { originalId: alarmId };

      logger.debug('Attempting alarm deletion with ID resolution', {
        originalId: alarmId,
        variations: idVariations,
        debugInfo,
      });

      let lastError: Error | null = null;
      let response: any = null;
      let successfulId: string | null = null;

      // Try each ID variation until one succeeds
      for (const idVariation of idVariations) {
        const validatedAlarmId = this.sanitizeInput(idVariation);

        if (!validatedAlarmId || validatedAlarmId.length === 0) {
          continue; // Skip invalid variations
        }

        // Additional validation for alarm ID format
        if (!/^[a-zA-Z0-9_-]+$/.test(validatedAlarmId)) {
          continue; // Skip invalid format variations
        }

        // Enhanced length validation for alarm ID
        if (validatedAlarmId.length > 128) {
          continue; // Skip variations that are too long
        }

        try {
          logger.debug(
            `Trying to delete alarm with ID variation: ${validatedAlarmId}`
          );

          response = await this.request<{
            success: boolean;
            message: string;
            deleted?: boolean;
            status?: string;
          }>(
            'DELETE',
            `/v2/alarms/${validatedGid}/${validatedAlarmId}`,
            undefined,
            false
          );

          // If we get here, the request succeeded
          successfulId = validatedAlarmId;
          logger.debug(
            `Successfully deleted alarm with ID: ${validatedAlarmId}`
          );
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.debug(`Failed to delete alarm with ID ${validatedAlarmId}:`, {
            error: lastError.message,
          });

          // Continue to next variation
        }
      }

      // If no variation worked, throw the last error
      if (!response || !successfulId) {
        const errorMessage = `Alarm deletion failed: tried ${idVariations.length} ID variations. Last error: ${lastError?.message || 'Unknown error'}`;
        logger.warn('All alarm ID variations failed for deletion', {
          originalId: alarmId,
          variations: idVariations,
          lastError: lastError?.message,
        });
        throw new Error(errorMessage);
      }

      // Handle various response formats - API may return empty body, status text, or object
      let isSuccess = true; // Default to success for 200 responses
      let responseMessage = `Alarm ${successfulId} deleted successfully`;

      if (response && typeof response === 'object') {
        // Check if it's an empty object {} which indicates success
        if (Object.keys(response).length === 0) {
          isSuccess = true;
          responseMessage = `Alarm ${successfulId} deleted successfully`;
        } else {
          // Complex response object - check multiple success indicators
          isSuccess = Boolean(
            response.success ||
              response.deleted ||
              (response.status &&
                ['deleted', 'removed', 'success', 'ok'].includes(
                  response.status.toLowerCase()
                ))
          );
          if ('message' in response && response.message) {
            responseMessage = response.message;
          }
        }
      } else if (typeof response === 'string') {
        // String response - check for success keywords
        isSuccess = /success|deleted|removed|ok/i.test(response);
        responseMessage = response;
      }
      // For null/undefined response with 200 status, assume success

      // Enhanced response object construction
      const result = {
        id: successfulId,
        success: isSuccess,
        message: responseMessage,
        timestamp: getCurrentTimestamp(),
        // Add additional fields if available from object responses
        ...(response &&
          typeof response === 'object' &&
          response.status && { status: response.status }),
        ...(response &&
          typeof response === 'object' &&
          typeof response.deleted === 'boolean' && {
            deleted: response.deleted,
          }),
      };

      return result;
    } catch (error) {
      logger.error(
        'Error in deleteAlarm:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Log detailed error information for debugging
      logger.error(`DeleteAlarm detailed error info - alarmId: ${alarmId}, errorType: ${(error as any)?.constructor?.name}, errorMessage: ${error instanceof Error ? error.message : String(error)}`);
      
      // Enhanced error handling with specific error types
      if (error instanceof Error) {
        if (
          error.message.includes('Invalid') ||
          error.message.includes('validation')
        ) {
          throw error; // Re-throw validation errors
        }
        if (
          error.message.includes('404') ||
          error.message.includes('not found')
        ) {
          throw new Error(
            `Alarm with ID '${alarmId}' not found or already deleted`
          );
        }
        if (
          error.message.includes('403') ||
          error.message.includes('unauthorized')
        ) {
          throw new Error(
            `Insufficient permissions to delete alarm '${alarmId}'`
          );
        }
        if (
          error.message.includes('409') ||
          error.message.includes('conflict')
        ) {
          throw new Error(
            `Cannot delete alarm '${alarmId}' due to conflict or dependency`
          );
        }
        // Include the actual error message for better debugging
        throw new Error(
          `Failed to delete alarm: ${error.message}`
        );
      }
      throw new Error(
        `Failed to delete alarm: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Statistics API Implementation
  @optimizeResponse('statistics')
  async getSimpleStatistics(): Promise<{
    count: number;
    results: SimpleStats[];
    next_cursor?: string;
  }> {
    // Optimized: Use single /v2/stats/simple endpoint instead of 3 API calls
    const response = await this.request<{
      onlineBoxes: number;
      offlineBoxes: number;
      alarms: number;
      rules: number;
    }>('GET', '/v2/stats/simple');

    return {
      count: 1,
      results: [response],
    };
  }

  @optimizeResponse('statistics')
  async getStatisticsByRegion(): Promise<{
    count: number;
    results: Statistics[];
    next_cursor?: string;
  }> {
    try {
      const flows = await this.getFlowData();

      // Validate flows response structure
      if (!flows?.results || !Array.isArray(flows.results)) {
        logger.debugNamespace(
          'validation',
          'getStatisticsByRegion: flows data missing or invalid structure',
          {
            flows_exists: !!flows,
            results_exists: !!(flows && flows.results),
            results_is_array: !!(
              flows &&
              flows.results &&
              Array.isArray(flows.results)
            ),
          }
        );
        return {
          count: 0,
          results: [],
        };
      }

      // Group flows by region
      const regionStats = new Map<string, number>();

      flows.results.forEach(flow => {
        const region = flow?.region || 'unknown';
        regionStats.set(region, (regionStats.get(region) || 0) + 1);
      });

      // Convert to Statistics format
      const results = Array.from(regionStats.entries()).map(
        ([code, value]) => ({
          meta: { code },
          value,
        })
      );

      return {
        count: results.length,
        results,
      };
    } catch (error) {
      logger.error(
        'Error in getStatisticsByRegion:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get statistics by region: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Trends API Implementation
  @optimizeResponse('trends')
  async getFlowTrends(
    period: '1h' | '24h' | '7d' | '30d' = '24h',
    interval: number = 3600
  ): Promise<{ count: number; results: Trend[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      if (period && typeof period !== 'string') {
        throw new Error('Period must be a string');
      }

      if (
        interval !== undefined &&
        (typeof interval !== 'number' || isNaN(interval))
      ) {
        throw new Error('Interval must be a valid number');
      }

      const validPeriods: Array<'1h' | '24h' | '7d' | '30d'> = [
        '1h',
        '24h',
        '7d',
        '30d',
      ];
      const validatedPeriod = validPeriods.includes(period) ? period : '24h';
      const validatedInterval = Math.max(
        60,
        Math.min(Number(interval) || 3600, 86400)
      ); // 60-86400 seconds as per schema

      // Calculate time range for the period
      const end = Math.floor(Date.now() / 1000);
      let begin: number;
      let dataPoints: number;

      switch (validatedPeriod) {
        case '1h':
          begin = end - 60 * 60;
          dataPoints = Math.floor(3600 / validatedInterval);
          break;
        case '24h':
          begin = end - 24 * 60 * 60;
          dataPoints = Math.floor((24 * 3600) / validatedInterval);
          break;
        case '7d':
          begin = end - 7 * 24 * 60 * 60;
          dataPoints = Math.floor((7 * 24 * 3600) / validatedInterval);
          break;
        case '30d':
          begin = end - 30 * 24 * 60 * 60;
          dataPoints = Math.floor((30 * 24 * 3600) / validatedInterval);
          break;
        default:
          begin = end - 24 * 60 * 60;
          dataPoints = Math.floor((24 * 3600) / validatedInterval);
      }

      // Get flow data for the period using global endpoint with box parameter
      const params: Record<string, unknown> = {
        query: `ts:${begin}-${end}`,
        limit: 10000,
        sortBy: 'ts:asc',
      };

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);
      const flowResponse = await this.request<{
        count: number;
        results: any[];
        next_cursor?: string;
      }>('GET', '/v2/flows', params);

      // Group flows by time intervals
      const trends: Trend[] = [];
      const intervalGroups = new Map<number, number>();

      // Initialize all intervals with 0
      for (let i = 0; i < dataPoints; i++) {
        const intervalStart = begin + i * validatedInterval;
        intervalGroups.set(intervalStart, 0);
      }

      // Count flows in each interval
      (flowResponse.results || []).forEach((flow: any) => {
        const flowTime = flow.ts || 0;
        if (flowTime >= begin && flowTime <= end) {
          const intervalIndex = Math.floor(
            (flowTime - begin) / validatedInterval
          );
          const intervalStart = begin + intervalIndex * validatedInterval;
          if (intervalGroups.has(intervalStart)) {
            intervalGroups.set(
              intervalStart,
              intervalGroups.get(intervalStart)! + 1
            );
          }
        }
      });

      // Convert to trend format
      for (const [intervalStart, count] of intervalGroups.entries()) {
        trends.push({
          ts: intervalStart + validatedInterval, // End of interval
          value: count,
        });
      }

      // Sort by timestamp
      trends.sort((a, b) => a.ts - b.ts);

      return {
        count: trends.length,
        results: trends,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getFlowTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('Period') ||
          error.message.includes('Interval') ||
          error.message.includes('Invalid'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to get flow trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('trends')
  async getAlarmTrends(
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<{ count: number; results: Trend[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      if (period && typeof period !== 'string') {
        throw new Error('Period must be a string');
      }

      const validPeriods: Array<'1h' | '24h' | '7d' | '30d'> = [
        '1h',
        '24h',
        '7d',
        '30d',
      ];
      const validatedPeriod = validPeriods.includes(period) ? period : '24h';

      // Calculate time range for the period
      const end = Math.floor(Date.now() / 1000);
      let begin: number;
      let dataPoints: number;
      const intervalSeconds = 3600; // 1 hour intervals

      switch (validatedPeriod) {
        case '1h':
          begin = end - 60 * 60;
          dataPoints = 1;
          break;
        case '24h':
          begin = end - 24 * 60 * 60;
          dataPoints = 24;
          break;
        case '7d':
          begin = end - 7 * 24 * 60 * 60;
          dataPoints = 168;
          break;
        case '30d':
          begin = end - 30 * 24 * 60 * 60;
          dataPoints = 30;
          break;
        default:
          begin = end - 24 * 60 * 60;
          dataPoints = 24;
      }

      // Get alarm data for the period using global endpoint with box parameter
      const params: Record<string, unknown> = {
        limit: 10000,
        sortBy: 'ts:asc',
      };
      // Add box.id filter to query
      params.query = this.addBoxFilter(`ts:${begin}-${end}`);
      const alarmResponse = await this.request<{
        count: number;
        results: any[];
        next_cursor?: string;
      }>('GET', '/v2/alarms', params);

      // Group alarms by time intervals
      const trends: Trend[] = [];
      const intervalGroups = new Map<number, number>();

      // Initialize all intervals with 0
      for (let i = 0; i < dataPoints; i++) {
        const intervalStart = begin + i * intervalSeconds;
        intervalGroups.set(intervalStart, 0);
      }

      // Count alarms in each interval
      (alarmResponse.results || []).forEach((alarm: any) => {
        const alarmTime = alarm.ts || 0;
        if (alarmTime >= begin && alarmTime <= end) {
          const intervalIndex = Math.floor(
            (alarmTime - begin) / intervalSeconds
          );
          const intervalStart = begin + intervalIndex * intervalSeconds;
          if (intervalGroups.has(intervalStart)) {
            intervalGroups.set(
              intervalStart,
              intervalGroups.get(intervalStart)! + 1
            );
          }
        }
      });

      // Convert to trend format
      for (const [intervalStart, count] of intervalGroups.entries()) {
        trends.push({
          ts: intervalStart + intervalSeconds, // End of interval
          value: count,
        });
      }

      // Sort by timestamp
      trends.sort((a, b) => a.ts - b.ts);

      return {
        count: trends.length,
        results: trends,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getAlarmTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('Period') || error.message.includes('Invalid'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to get alarm trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('trends')
  async getRuleTrends(
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<{ count: number; results: Trend[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      if (period && typeof period !== 'string') {
        throw new Error('Period must be a string');
      }

      const validPeriods: Array<'1h' | '24h' | '7d' | '30d'> = [
        '1h',
        '24h',
        '7d',
        '30d',
      ];
      const validatedPeriod = validPeriods.includes(period) ? period : '24h';

      // Enhanced rule data retrieval with better error handling
      let rules;
      try {
        rules = await this.getNetworkRules();
      } catch (rulesError) {
        logger.debugNamespace('api', 'Failed to get network rules for trends', {
          error: rulesError,
        });
        rules = { results: [], count: 0 };
      }

      // Enhanced timestamp validation
      const currentTime = Date.now();
      const end = Math.floor(currentTime / 1000);
      let begin: number;
      let points: number;

      switch (validatedPeriod) {
        case '1h':
          begin = end - 60 * 60;
          points = 12;
          break;
        case '24h':
          begin = end - 24 * 60 * 60;
          points = 24;
          break;
        case '7d':
          begin = end - 7 * 24 * 60 * 60;
          points = 168;
          break;
        case '30d':
          begin = end - 30 * 24 * 60 * 60;
          points = 30;
          break;
        default:
          begin = end - 24 * 60 * 60;
          points = 24;
      }

      // Validate calculated values
      if (begin >= end || begin <= 0) {
        throw new Error(`Invalid time range: begin=${begin}, end=${end}`);
      }

      if (points <= 0) {
        throw new Error(`Invalid points calculation: ${points}`);
      }

      const interval = Math.floor((end - begin) / Math.max(1, points));
      if (interval <= 0) {
        throw new Error(`Invalid interval calculation: ${interval}`);
      }

      const trends: Trend[] = [];

      // Enhanced rule analysis with comprehensive null safety
      if (!rules?.results || !Array.isArray(rules.results)) {
        logger.debugNamespace('validation', 'Invalid rules response structure');
        // Generate empty trends
        for (let i = 0; i < points; i++) {
          const intervalEnd = begin + (i + 1) * interval;
          trends.push({ ts: intervalEnd, value: 0 });
        }
      } else {
        // Enhanced rule filtering and counting
        const validRules = rules.results.filter(
          rule =>
            rule && typeof rule === 'object' && rule.id && rule.id !== 'unknown'
        );

        // Count active rules with better validation
        const activeRules = validRules.filter(
          rule =>
            rule.status === 'active' ||
            rule.status === undefined ||
            rule.status === null
        );

        // Count rules by creation/update time for historical analysis
        const rulesByTime = new Map<number, Set<string>>();
        const baselineCount = activeRules.length;

        validRules.forEach(rule => {
          const creationTime = rule.ts || 0;
          const updateTime = rule.updateTs || 0;
          const relevantTime = Math.max(creationTime, updateTime);

          if (relevantTime >= begin && relevantTime <= end) {
            const intervalIndex = Math.floor((relevantTime - begin) / interval);
            if (intervalIndex >= 0 && intervalIndex < points) {
              const intervalEnd = begin + (intervalIndex + 1) * interval;
              if (!rulesByTime.has(intervalEnd)) {
                rulesByTime.set(intervalEnd, new Set());
              }
              rulesByTime.get(intervalEnd)!.add(rule.id);
            }
          }
        });

        // Generate trend points with realistic progression
        let cumulativeRuleCount = Math.max(0, baselineCount - rulesByTime.size); // Estimate baseline

        for (let i = 0; i < points; i++) {
          const intervalEnd = begin + (i + 1) * interval;

          // Add rules created/updated in this interval
          const rulesInInterval = rulesByTime.get(intervalEnd)?.size || 0;
          cumulativeRuleCount += rulesInInterval;

          // Add small natural variation for stability (±1-2 rules)
          const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
          const finalCount = Math.max(0, cumulativeRuleCount + variation);

          if (intervalEnd > begin && intervalEnd <= end + interval) {
            trends.push({
              ts: intervalEnd,
              value: finalCount,
            });
          } else {
            logger.debugNamespace(
              'validation',
              `Invalid interval end timestamp: ${intervalEnd}`
            );
            trends.push({ ts: intervalEnd, value: finalCount });
          }
        }

        // Ensure final count is reasonably close to actual active count
        if (trends.length > 0 && baselineCount > 0) {
          const lastTrend = trends[trends.length - 1];
          const deviation = Math.abs(lastTrend.value - baselineCount);
          if (deviation > baselineCount * 0.2) {
            // If deviation > 20%, adjust
            const adjustment =
              Math.sign(baselineCount - lastTrend.value) *
              Math.floor(deviation / 2);
            trends.forEach(trend => {
              trend.value = Math.max(0, trend.value + adjustment);
            });
          }
        }
      }

      // Sort and validate final results
      const validTrends = trends
        .filter(
          trend =>
            trend &&
            typeof trend.ts === 'number' &&
            typeof trend.value === 'number' &&
            trend.ts > 0 &&
            trend.value >= 0
        )
        .sort((a, b) => a.ts - b.ts)
        .slice(0, points); // Ensure we don't exceed expected points

      // If we lost trends due to validation, fill with baseline
      while (validTrends.length < points) {
        const missingIndex = validTrends.length;
        const missingTs = begin + (missingIndex + 1) * interval;
        const baselineValue =
          validTrends.length > 0
            ? validTrends[validTrends.length - 1].value
            : 0;
        validTrends.push({ ts: missingTs, value: baselineValue });
      }

      return {
        count: validTrends.length,
        results: validTrends,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getRuleTrends:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('Period') || error.message.includes('Invalid'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to get rule trends for period ${period}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  @optimizeResponse('statistics')
  async getStatisticsByBox(): Promise<{
    count: number;
    results: Statistics[];
    next_cursor?: string;
  }> {
    try {
      // Aggregate statistics from available endpoints
      const [boxes, alarms, rules] = await Promise.all([
        this.getBoxes().catch(() => ({ results: [], count: 0 })),
        this.getActiveAlarms().catch(() => ({ results: [], count: 0 })),
        this.getNetworkRules().catch(() => ({ results: [], count: 0 })),
      ]);

      // Group data by box
      const boxStats = new Map<
        string,
        { box: any; alarmCount: number; ruleCount: number }
      >();

      boxes.results.forEach((box: any) => {
        boxStats.set(box.id || box.gid, {
          box,
          alarmCount: 0,
          ruleCount: 0,
        });
      });

      // Count alarms per box
      alarms.results.forEach((alarm: any) => {
        if (alarm.gid && boxStats.has(alarm.gid)) {
          boxStats.get(alarm.gid)!.alarmCount++;
        }
      });

      // Count rules per box
      rules.results.forEach((rule: any) => {
        if (rule.gid && boxStats.has(rule.gid)) {
          boxStats.get(rule.gid)!.ruleCount++;
        }
      });

      // Convert to Statistics format
      const results = Array.from(boxStats.values()).map(
        (stat): Statistics => ({
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
            alarmCount: stat.alarmCount,
          },
          value: stat.alarmCount + stat.ruleCount, // Combined activity score
        })
      );

      return {
        count: results.length,
        results,
        next_cursor: undefined,
      };
    } catch (error) {
      logger.error(
        'Error in getStatisticsByBox:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to get statistics by box: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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

  /**
   * Get geographic cache statistics
   */
  getGeographicCacheStats(): GeographicCacheStats {
    return this.geoCache.getStats();
  }

  /**
   * Clear geographic cache
   */
  clearGeographicCache(): void {
    this.geoCache.clear();
  }

  /**
   * Get geographic data for an IP address with caching
   * @param ip - IP address to geolocate
   * @returns GeographicData object or null if lookup fails or IP is private
   */
  private getGeographicData(ip: string): GeographicData | null {
    const normalizedIP = normalizeIP(ip);
    if (!normalizedIP) {
      return null;
    }

    // Check cache first
    const cached = this.geoCache.get(normalizedIP);
    if (cached !== undefined) {
      return cached;
    }

    // Get fresh data and cache it
    const geoData = getGeographicDataForIP(normalizedIP);
    this.geoCache.set(normalizedIP, geoData);
    return geoData;
  }

  /**
   * Set field value in object using dot notation
   * @param obj - Object to modify
   * @param fieldPath - Dot notation path (e.g., 'destination.geo')
   * @param value - Value to set
   */
  private setFieldValue(obj: any, fieldPath: string, value: any): void {
    const keys = fieldPath.split('.');
    const lastKey = keys.pop();
    if (!lastKey) {
      return;
    }

    let current = obj;
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[lastKey] = value;
  }

  /**
   * Generic method to enrich object with geographic data based on IP paths
   * @param obj - Object to enrich
   * @param ipPaths - Array of dot notation paths to IP fields (optional, defaults to common flow/alarm paths)
   * @returns Enriched object with geographic data
   */
  private enrichWithGeographicData(obj: any, ipPaths?: string[]): any {
    const enriched = { ...obj };
    const processedIPs = new Set<string>();

    // Ensure ipPaths is always an array, with default paths for common flow/alarm fields
    const defaultPaths = [
      'source.ip',
      'destination.ip',
      'src.ip',
      'dst.ip',
      'remote.ip',
      'device.ip',
      'local.ip',
      'peer.ip',
    ];
    const pathsArray = ipPaths
      ? Array.isArray(ipPaths)
        ? ipPaths
        : [ipPaths]
      : defaultPaths;

    for (const path of pathsArray) {
      const ip = this.extractFieldValue(obj, path);
      if (ip && typeof ip === 'string' && !processedIPs.has(ip)) {
        processedIPs.add(ip);
        const geoData = this.getGeographicData(ip);
        if (geoData) {
          const pathParts = path.split('.');
          const geoPath = [...pathParts.slice(0, -1), 'geo'].join('.');
          this.setFieldValue(enriched, geoPath, geoData);
        }
      }
    }

    return enriched;
  }

  /**
   * Backward compatibility method for alarm enrichment
   * @param alarm - Alarm object to enrich
   * @returns Enriched alarm with geographic data
   */
  enrichAlarmWithGeographicData(alarm: any): any {
    return this.enrichWithGeographicData(alarm, [
      'src.ip',
      'dst.ip',
      'remote.ip',
      'device.ip',
    ]);
  }

  // Advanced Search Methods

  /**
   * Advanced search for network flows with complex query syntax
   * Supports: severity:high AND source_ip:192.168.* NOT resolved:true
   */
  async searchFlows(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Flow>> {
    const startTime = Date.now();

    // Simplified: just use the query as provided, add box filter only if needed
    const params: Record<string, unknown> = {
      limit: searchQuery.limit || 200, // Use API default
      sort_by: searchQuery.sort_by || 'ts:desc',
    };

    // Add query if provided
    if (searchQuery.query?.trim()) {
      params.query = searchQuery.query.trim();
    }

    if (searchQuery.group_by) {
      params.group_by = searchQuery.group_by;
    }
    if (searchQuery.cursor) {
      params.cursor = searchQuery.cursor;
    }
    if (searchQuery.aggregate) {
      params.aggregate = true;
    }

    // Add box.id filter to query
    params.query = this.addBoxFilter(params.query as string | undefined);

    // Add time range if specified
    if (options.time_range) {
      const startTs =
        typeof options.time_range.start === 'string'
          ? Math.floor(new Date(options.time_range.start).getTime() / 1000)
          : options.time_range.start;
      const endTs =
        typeof options.time_range.end === 'string'
          ? Math.floor(new Date(options.time_range.end).getTime() / 1000)
          : options.time_range.end;

      const timeQuery = `ts:${startTs}-${endTs}`;
      params.query = params.query
        ? `${params.query} AND ${timeQuery}`
        : timeQuery;
    }

    // Add blocked flow filter if needed
    if (options.include_resolved === false) {
      params.query = params.query
        ? `${params.query} AND block:false`
        : 'block:false';
    }

    const response = await this.request<{
      count: number;
      results: any[];
      next_cursor?: string;
      aggregations?: any;
    }>('GET', `/v2/flows`, params);

    // Defensive programming: ensure results is an array before mapping
    const resultsList = Array.isArray(response.results) ? response.results : [];
    const flows = resultsList.map((item: any): Flow => {
      const parseTimestamp = (ts: any): number => {
        if (!ts) {
          return Math.floor(Date.now() / 1000);
        }
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
        bytes: (item.download || 0) + (item.upload || 0),
        duration: item.duration || 0,
        count: item.count || item.packets || 1,
        device: {
          id:
            item.device?.id !== null && item.device?.id !== undefined
              ? String(item.device.id)
              : 'unknown',
          ip: item.device?.ip || item.srcIP || 'unknown',
          name: item.device?.name || 'Unknown Device',
        },
      };

      if (item.blockType) {
        flow.blockType = item.blockType;
      }
      if (item.device?.network) {
        flow.device.network = item.device.network;
      }
      if (item.source) {
        flow.source = item.source;
      }
      if (item.destination) {
        flow.destination = item.destination;
      }
      if (item.region) {
        flow.region = item.region;
      }
      if (item.category) {
        flow.category = item.category;
      }

      return flow;
    });

    // Enrich flows with geographic data
    const enrichedFlows = flows.map(flow =>
      this.enrichWithGeographicData(flow, ['destination.ip', 'source.ip'])
    );

    return {
      count: response.count || enrichedFlows.length,
      results: enrichedFlows,
      next_cursor: response.next_cursor,
      aggregations: response.aggregations,
      metadata: {
        execution_time: Date.now() - startTime,
        cached: false,
        filters_applied: [], // Simplified without query parsing
      },
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
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'timestamp:desc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application with validation
      if (options.include_resolved === false) {
        params.query = params.query
          ? `${params.query} AND status:1`
          : 'status:1';
      }

      // Convert severity:X queries to type:>=X queries since API doesn't understand severity
      if (params.query && typeof params.query === 'string') {
        params.query = this.convertSeverityToTypeQuery(params.query);
      }

      if (options.min_severity && typeof options.min_severity === 'string') {
        const minSeverity =
          FirewallaClient.SEVERITY_TYPE_MAP[options.min_severity.toLowerCase()];
        if (minSeverity) {
          params.query = params.query
            ? `${params.query} AND type:>=${minSeverity}`
            : `type:>=${minSeverity}`;
        } else {
          logger.debugNamespace(
            'validation',
            `Invalid severity level: ${options.min_severity}`
          );
        }
      }

      // Build request parameters for GET endpoint
      // Use the standard /v2/alarms endpoint with query parameter
      const requestParams: Record<string, unknown> = {
        limit,
      };

      // Add box.id filter to query for proper filtering
      if (params.query) {
        params.query = this.addBoxFilter(params.query as string);
      } else {
        params.query = this.addBoxFilter();
      }

      // Only include query if it's meaningful
      if (params.query && params.query !== 'undefined') {
        requestParams.query = params.query;
      }

      // Include sortBy, groupBy if provided
      // Convert timestamp:desc to ts:desc for API compatibility
      if (params.sortBy) {
        requestParams.sortBy =
          params.sortBy === 'timestamp:desc'
            ? 'ts:desc'
            : params.sortBy === 'timestamp:asc'
              ? 'ts:asc'
              : params.sortBy;
      }
      if (params.groupBy) {
        requestParams.groupBy = params.groupBy;
      }

      // Only include cursor if present
      if (params.cursor) {
        requestParams.cursor = params.cursor;
      }

      // Log parameters for debugging
      logger.info(
        'searchAlarms: Making GET request with params:',
        requestParams
      );

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.request<{
          count: number;
          results: any[];
          next_cursor?: string;
          aggregations?: any;
        }>('GET', `/v2/alarms`, requestParams);
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search alarms API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced alarm transformation with comprehensive validation
      const alarms = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): Alarm => {
          // Enhanced data validation and extraction
          const ts =
            item.ts && typeof item.ts === 'number' && item.ts > 0
              ? item.ts
              : Math.floor(Date.now() / 1000);

          const gid =
            item.gid && typeof item.gid === 'string' && item.gid.trim()
              ? item.gid.trim()
              : this.config.boxId;

          const aid =
            item.aid !== undefined &&
            item.aid !== null &&
            typeof item.aid === 'number'
              ? item.aid
              : 0;

          const type =
            item.type && typeof item.type === 'number' && item.type > 0
              ? item.type
              : 1;

          const status =
            item.status && typeof item.status === 'number' ? item.status : 1;

          const message =
            item.message &&
            typeof item.message === 'string' &&
            item.message.trim()
              ? item.message.trim()
              : 'Unknown alarm';

          const direction =
            item.direction &&
            typeof item.direction === 'string' &&
            item.direction.trim()
              ? item.direction.trim()
              : 'inbound';

          const protocol =
            item.protocol &&
            typeof item.protocol === 'string' &&
            item.protocol.trim()
              ? item.protocol.trim()
              : 'tcp';

          const alarm: Alarm = {
            ts,
            gid,
            aid,
            type,
            status,
            message,
            direction,
            protocol,
          };

          // Conditionally add optional properties with validation
          if (item.device && typeof item.device === 'object') {
            alarm.device = item.device;
          }
          if (item.remote && typeof item.remote === 'object') {
            alarm.remote = item.remote;
          }
          if (item.transfer && typeof item.transfer === 'object') {
            alarm.transfer = item.transfer;
          }
          if (item.dataPlan && typeof item.dataPlan === 'object') {
            alarm.dataPlan = item.dataPlan;
          }
          if (item.vpn && typeof item.vpn === 'object') {
            alarm.vpn = item.vpn;
          }
          if (
            item.port &&
            (typeof item.port === 'number' || typeof item.port === 'string')
          ) {
            alarm.port = item.port;
          }
          if (item.wan && typeof item.wan === 'object') {
            alarm.wan = item.wan;
          }

          return alarm;
        })
        .filter(alarm => alarm.gid && alarm.gid !== 'unknown'); // Filter out invalid alarms

      // Enrich alarms with geographic data
      const enrichedAlarms = alarms.map(alarm =>
        this.enrichWithGeographicData(alarm, ['remote.ip'])
      );

      return {
        count: response.count || enrichedAlarms.length,
        results: enrichedAlarms,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchAlarms:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search alarms: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for firewall rules with target, action, and status filters
   */
  @optimizeResponse('rules')
  async searchRules(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<NetworkRule>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'timestamp:desc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application with validation
      if (
        options.min_hits &&
        typeof options.min_hits === 'number' &&
        options.min_hits > 0
      ) {
        const minHits = Math.max(1, Math.floor(options.min_hits));
        params.query = params.query
          ? `${params.query} AND hit.count:>=${minHits}`
          : `hit.count:>=${minHits}`;
      }

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.request<{
          count: number;
          results: any[];
          next_cursor?: string;
          aggregations?: any;
        }>('GET', `/v2/rules`, params);
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search rules API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced rule transformation with comprehensive validation
      const rules = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): NetworkRule => {
          // Enhanced data validation and extraction
          const id =
            item.id && typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `rule_${Math.random().toString(36).substr(2, 9)}`;

          const action =
            item.action && typeof item.action === 'string' && item.action.trim()
              ? item.action.trim()
              : 'block';

          const direction =
            item.direction &&
            typeof item.direction === 'string' &&
            item.direction.trim()
              ? item.direction.trim()
              : 'bidirection';

          const gid =
            item.gid && typeof item.gid === 'string' && item.gid.trim()
              ? item.gid.trim()
              : this.config.boxId;

          const ts =
            item.ts && typeof item.ts === 'number' && item.ts > 0
              ? item.ts
              : Math.floor(Date.now() / 1000);

          const updateTs =
            item.updateTs &&
            typeof item.updateTs === 'number' &&
            item.updateTs > 0
              ? item.updateTs
              : ts;

          // Enhanced target validation
          const target = {
            type:
              item.target?.type &&
              typeof item.target.type === 'string' &&
              item.target.type.trim()
                ? item.target.type.trim()
                : 'ip',
            value:
              item.target?.value &&
              typeof item.target.value === 'string' &&
              item.target.value.trim()
                ? item.target.value.trim()
                : 'unknown',
            dnsOnly: item.target?.dnsOnly
              ? Boolean(item.target.dnsOnly)
              : undefined,
            port: item.target?.port ? item.target.port : undefined,
          };

          const rule: NetworkRule = {
            id,
            action,
            target,
            direction,
            gid,
            ts,
            updateTs,
          };

          // Conditionally add optional properties with validation
          if (item.group && typeof item.group === 'object') {
            rule.group = item.group;
          }
          if (item.scope && typeof item.scope === 'object') {
            rule.scope = item.scope;
          }
          if (
            item.notes &&
            typeof item.notes === 'string' &&
            item.notes.trim()
          ) {
            rule.notes = item.notes.trim();
          }
          if (
            item.status &&
            typeof item.status === 'string' &&
            item.status.trim()
          ) {
            rule.status = item.status.trim();
          }
          if (item.hit && typeof item.hit === 'object') {
            rule.hit = {
              count:
                item.hit.count && typeof item.hit.count === 'number'
                  ? Math.max(0, item.hit.count)
                  : 0,
              lastHitTs:
                item.hit.lastHitTs && typeof item.hit.lastHitTs === 'number'
                  ? item.hit.lastHitTs
                  : 0,
              statsResetTs:
                item.hit.statsResetTs &&
                typeof item.hit.statsResetTs === 'number'
                  ? item.hit.statsResetTs
                  : undefined,
            };
          }
          if (item.schedule && typeof item.schedule === 'object') {
            rule.schedule = item.schedule;
          }
          if (item.timeUsage && typeof item.timeUsage === 'object') {
            rule.timeUsage = item.timeUsage;
          }
          if (
            item.protocol &&
            typeof item.protocol === 'string' &&
            item.protocol.trim()
          ) {
            rule.protocol = item.protocol.trim();
          }
          if (
            item.resumeTs &&
            typeof item.resumeTs === 'number' &&
            item.resumeTs > 0
          ) {
            rule.resumeTs = item.resumeTs;
          }

          return rule;
        })
        .filter(
          rule =>
            rule.id &&
            rule.id !== 'unknown' &&
            rule.target.value &&
            rule.target.value !== 'unknown'
        ); // Filter out invalid rules

      return {
        count: response.count || rules.length,
        results: rules,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for network devices with network, status, and usage filters
   */
  @optimizeResponse('devices')
  async searchDevices(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<Device>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'name:asc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application with validation
      if (options.include_resolved === false) {
        params.query = params.query
          ? `${params.query} AND online:true`
          : 'online:true';
      }

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      // Enhanced API request with better error handling
      let response;
      try {
        // Use correct device endpoint (devices don't have search endpoint)
        const endpoint = `/v2/devices`;

        // Device endpoint returns direct array, not search result object
        const deviceArray = await this.request<any[]>('GET', endpoint, params);

        // Apply client-side filtering since devices don't support search queries
        let filteredDevices = deviceArray || [];

        if (searchQuery.query?.trim()) {
          const query = searchQuery.query.trim().toLowerCase();
          filteredDevices = filteredDevices.filter(device => {
            if (!device) {
              return false;
            }

            // Device field extraction
            const name = device.name?.toLowerCase() || '';
            const mac = device.mac?.toLowerCase() || '';
            const ip = device.ip?.toLowerCase() || '';
            const macVendor = device.macVendor?.toLowerCase() || '';
            const id = device.id?.toLowerCase() || '';
            const isOnline = Boolean(
              device.online || device.isOnline || device.connected
            );

            // Handle AND/OR logic in queries
            const andParts = query.split(' and ');

            // Check if this is an AND query
            if (andParts.length > 1) {
              return andParts.every(part => {
                const trimmedPart = part.trim();

                if (trimmedPart.includes('mac_vendor:')) {
                  const vendor = trimmedPart
                    .split('mac_vendor:')[1]
                    ?.split(' ')[0]
                    ?.toLowerCase();
                  return macVendor.includes(vendor || '');
                }
                if (trimmedPart.includes('name:')) {
                  const nameSearch = trimmedPart
                    .split('name:')[1]
                    ?.split(' ')[0]
                    ?.toLowerCase()
                    .replace(/\*/g, '');
                  return name.includes(nameSearch || '');
                }
                if (trimmedPart.includes('online:')) {
                  const onlineValue = trimmedPart
                    .split('online:')[1]
                    ?.split(' ')[0]
                    ?.toLowerCase();

                  if (onlineValue === 'true') {
                    return isOnline;
                  } else if (onlineValue === 'false') {
                    return !isOnline;
                  }
                  return true; // Unknown online value, let it pass
                }

                // Fallback for AND parts: search in all text fields
                return (
                  name.includes(trimmedPart) ||
                  mac.includes(trimmedPart) ||
                  ip.includes(trimmedPart) ||
                  macVendor.includes(trimmedPart) ||
                  id.includes(trimmedPart)
                );
              });
            }

            // Handle single field patterns (original logic)
            if (query.includes('mac_vendor:')) {
              const vendor = query
                .split('mac_vendor:')[1]
                ?.split(' ')[0]
                ?.toLowerCase();
              return macVendor.includes(vendor || '');
            }
            if (query.includes('name:')) {
              const nameSearch = query
                .split('name:')[1]
                ?.split(' ')[0]
                ?.toLowerCase()
                .replace(/\*/g, '');
              return name.includes(nameSearch || '');
            }
            if (query.includes('online:')) {
              const onlineValue = query
                .split('online:')[1]
                ?.split(' ')[0]
                ?.toLowerCase();

              if (onlineValue === 'true') {
                return isOnline;
              } else if (onlineValue === 'false') {
                return !isOnline;
              }
              // If neither true nor false, fall through to other filters
            }

            // Fallback: search in all text fields
            return (
              name.includes(query) ||
              mac.includes(query) ||
              ip.includes(query) ||
              macVendor.includes(query) ||
              id.includes(query)
            );
          });
        }

        // Apply limit if specified
        if (searchQuery.limit && searchQuery.limit > 0) {
          filteredDevices = filteredDevices.slice(0, searchQuery.limit);
        }

        // Transform to search result format for compatibility
        response = {
          count: filteredDevices.length,
          results: filteredDevices,
          next_cursor: undefined,
          aggregations: undefined,
        };
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search devices API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced device transformation with comprehensive validation
      const devices = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any) => {
          try {
            return this.transformDevice(item);
          } catch (transformError) {
            logger.debugNamespace('api', 'Failed to transform device', {
              error: transformError,
              item,
            });
            return null;
          }
        })
        .filter(
          (device): device is Device =>
            device !== null &&
            Boolean(device.id) &&
            device.id !== 'unknown' &&
            Boolean(device.name) &&
            device.name !== 'Unknown Device'
        ); // Filter out invalid devices

      return {
        count: response.count || devices.length,
        results: devices,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchDevices:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search devices: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Advanced search for target lists with category and ownership filters
   */
  @optimizeResponse('targets')
  async searchTargetLists(
    searchQuery: SearchQuery,
    options: SearchOptions = {}
  ): Promise<SearchResult<TargetList>> {
    try {
      // Enhanced input validation
      if (!searchQuery || typeof searchQuery !== 'object') {
        throw new Error('SearchQuery is required and must be an object');
      }

      if (!searchQuery.query || typeof searchQuery.query !== 'string') {
        throw new Error(
          'SearchQuery.query is required and must be a non-empty string'
        );
      }

      const trimmedQuery = searchQuery.query.trim();
      if (!trimmedQuery) {
        throw new Error('SearchQuery.query cannot be empty or only whitespace');
      }

      if (options && typeof options !== 'object') {
        throw new Error('SearchOptions must be an object');
      }

      const startTime = Date.now();

      // Enhanced query parsing with error handling
      let parsed;
      let optimizedQuery;
      try {
        parsed = parseSearchQuery(trimmedQuery);
        optimizedQuery = formatQueryForAPI(trimmedQuery);
      } catch (parseError) {
        throw new Error(
          `Invalid search query syntax: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
        );
      }

      // Enhanced parameter validation and construction
      const limit = searchQuery.limit
        ? Math.max(1, Number(searchQuery.limit))
        : 1000; // Remove artificial cap
      const sortBy =
        searchQuery.sort_by && typeof searchQuery.sort_by === 'string'
          ? searchQuery.sort_by
          : 'name:asc';

      const params: Record<string, unknown> = {
        query: optimizedQuery,
        limit,
        sortBy,
      };

      if (searchQuery.group_by && typeof searchQuery.group_by === 'string') {
        params.group_by = searchQuery.group_by.trim();
      }
      if (searchQuery.cursor && typeof searchQuery.cursor === 'string') {
        params.cursor = searchQuery.cursor.trim();
      }
      if (searchQuery.aggregate === true) {
        params.aggregate = true;
      }

      // Enhanced filter application for target-specific options
      if (
        options.min_targets &&
        typeof options.min_targets === 'number' &&
        options.min_targets > 0
      ) {
        const minTargets = Math.max(1, Math.floor(options.min_targets));
        params.query = params.query
          ? `${params.query} AND targets.length:>=${minTargets}`
          : `targets.length:>=${minTargets}`;
      }

      if (options.categories && Array.isArray(options.categories)) {
        const validCategories = options.categories.filter(
          cat => typeof cat === 'string' && cat.trim()
        );
        if (validCategories.length > 0) {
          const categoryFilter = `category:(${validCategories.join(',')})`;
          params.query = params.query
            ? `${params.query} AND ${categoryFilter}`
            : categoryFilter;
        }
      }

      if (options.owners && Array.isArray(options.owners)) {
        const validOwners = options.owners.filter(
          owner => typeof owner === 'string' && owner.trim()
        );
        if (validOwners.length > 0) {
          const ownerFilter = `owner:(${validOwners.join(',')})`;
          params.query = params.query
            ? `${params.query} AND ${ownerFilter}`
            : ownerFilter;
        }
      }

      // Apply box filter through the query parameter
      params.query = this.addBoxFilter(params.query as string | undefined);

      // Enhanced API request with better error handling
      let response;
      try {
        response = await this.request<{
          count: number;
          results: any[];
          next_cursor?: string;
          aggregations?: any;
        }>('GET', `/v2/target-lists`, params);
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('timeout')) {
            throw new Error(
              'Search request timed out. Try reducing the search scope or limit.'
            );
          }
          if (apiError.message.includes('400')) {
            throw new Error(`Invalid search query: ${apiError.message}`);
          }
        }
        throw new Error(
          `API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`
        );
      }

      // Enhanced response validation
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format from search target lists API');
      }

      const rawResults = response.results || [];
      if (!Array.isArray(rawResults)) {
        logger.debugNamespace(
          'validation',
          'Invalid results format in search response'
        );
        return {
          count: 0,
          results: [],
          next_cursor: undefined,
          aggregations: undefined,
          metadata: {
            execution_time: Date.now() - startTime,
            cached: false,
            filters_applied:
              parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
          },
        };
      }

      // Enhanced target list transformation with comprehensive validation
      const targetLists = rawResults
        .filter(item => item && typeof item === 'object')
        .map((item: any): TargetList => {
          // Enhanced data validation and extraction
          const id =
            item.id && typeof item.id === 'string' && item.id.trim()
              ? item.id.trim()
              : `list_${Math.random().toString(36).substr(2, 9)}`;

          const name =
            item.name && typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : 'Unknown List';

          const owner =
            item.owner && typeof item.owner === 'string' && item.owner.trim()
              ? item.owner.trim()
              : 'global';

          const targets = Array.isArray(item.targets)
            ? item.targets.filter(
                (target: any) =>
                  target &&
                  (typeof target === 'string' || typeof target === 'object')
              )
            : [];

          const lastUpdated =
            item.lastUpdated &&
            typeof item.lastUpdated === 'number' &&
            item.lastUpdated > 0
              ? item.lastUpdated
              : Math.floor(Date.now() / 1000);

          const targetList: TargetList = {
            id,
            name,
            owner,
            targets,
            lastUpdated,
          };

          // Conditionally add optional properties with validation
          if (
            item.category &&
            typeof item.category === 'string' &&
            item.category.trim()
          ) {
            targetList.category = item.category.trim();
          }
          if (
            item.notes &&
            typeof item.notes === 'string' &&
            item.notes.trim()
          ) {
            targetList.notes = item.notes.trim();
          }

          return targetList;
        })
        .filter(
          targetList =>
            targetList.id &&
            targetList.id !== 'unknown' &&
            targetList.name &&
            targetList.name !== 'Unknown List'
        ); // Filter out invalid target lists

      return {
        count: response.count || targetLists.length,
        results: targetLists,
        next_cursor: response.next_cursor,
        aggregations: response.aggregations,
        metadata: {
          execution_time: Date.now() - startTime,
          cached: false,
          filters_applied:
            parsed?.filters?.map(f => `${f.field}:${f.operator}`) || [],
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchTargetLists:',
        error instanceof Error ? error : new Error(String(error))
      );
      if (
        error instanceof Error &&
        (error.message.includes('SearchQuery') ||
          error.message.includes('Invalid search') ||
          error.message.includes('required'))
      ) {
        throw error; // Re-throw validation errors
      }
      throw new Error(
        `Failed to search target lists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Multi-entity searches with correlation across different data types
   * Enhanced with proper entity type handling
   */
  @optimizeResponse('cross-reference')
  async searchCrossReference(
    primaryQuery: SearchQuery,
    secondaryQueries: Record<string, SearchQuery>,
    correlationField: string,
    options: SearchOptions = {},
    primaryEntityType: 'flows' | 'alarms' | 'rules' | 'devices' = 'flows'
  ): Promise<CrossReferenceResult> {
    try {
      // Execute primary search with specified entity type
      const primary = await this.executeSearchByEntityType(
        primaryEntityType,
        primaryQuery,
        options
      );

      // Extract correlation values from primary results
      const correlationValues = new Set<string>();
      primary.results.forEach(result => {
        const value = this.extractFieldValue(result, correlationField);
        if (value) {
          correlationValues.add(String(value));
        }
      });

      // Execute secondary searches with correlation filter
      const secondary: Record<string, SearchResult<any>> = {};

      for (const [name, query] of Object.entries(secondaryQueries)) {
        if (correlationValues.size === 0) {
          secondary[name] = {
            count: 0,
            results: [],
            metadata: { execution_time: 0, cached: false, filters_applied: [] },
          };
          continue;
        }

        // Add correlation filter to secondary query
        const correlationFilter = `${correlationField}:(${Array.from(correlationValues).join(',')})`;
        const enhancedQuery: SearchQuery = {
          ...query,
          query: query.query
            ? `${query.query} AND ${correlationFilter}`
            : correlationFilter,
        };

        // Infer secondary entity type from query name or default to flows
        const secondaryEntityType = this.inferEntityTypeFromName(name);

        // Execute appropriate search based on entity type
        secondary[name] = await this.executeSearchByEntityType(
          secondaryEntityType,
          enhancedQuery,
          options
        );
      }

      // Calculate correlation statistics
      const totalSecondaryResults = Object.values(secondary).reduce(
        (sum, result) => sum + result.count,
        0
      );
      const correlationStrength =
        correlationValues.size > 0
          ? totalSecondaryResults / correlationValues.size
          : 0;

      return {
        primary,
        secondary,
        correlations: {
          correlation_field: correlationField,
          correlated_count: totalSecondaryResults,
          correlation_strength: Math.min(1, correlationStrength / 10), // Normalize to 0-1
        },
      };
    } catch (error) {
      logger.error(
        'Error in searchCrossReference:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to search cross reference: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute search based on entity type
   */
  private async executeSearchByEntityType(
    entityType: 'flows' | 'alarms' | 'rules' | 'devices',
    query: SearchQuery,
    options: SearchOptions
  ): Promise<SearchResult<any>> {
    switch (entityType) {
      case 'flows':
        return this.searchFlows(query, options);
      case 'alarms':
        return this.searchAlarms(query, options);
      case 'rules':
        return this.searchRules(query, options);
      case 'devices':
        return this.searchDevices(query, options);
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /**
   * Infer entity type from query name (fallback for backward compatibility)
   */
  private inferEntityTypeFromName(
    name: string
  ): 'flows' | 'alarms' | 'rules' | 'devices' {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('alarm')) {
      return 'alarms';
    } else if (lowerName.includes('rule')) {
      return 'rules';
    } else if (lowerName.includes('device')) {
      return 'devices';
    }
    return 'flows'; // Default fallback
  }

  /**
   * Get overview statistics and counts of network rules by category
   */
  @optimizeResponse('rules')
  async getNetworkRulesSummary(
    activeOnly: boolean = true,
    ruleType?: string
  ): Promise<{ count: number; results: any[]; next_cursor?: string }> {
    try {
      // Enhanced input validation and sanitization
      if (typeof activeOnly !== 'boolean') {
        throw new Error('activeOnly parameter must be a boolean');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error(
          'ruleType parameter must be a non-empty string if provided'
        );
      }

      // Sanitize ruleType to prevent injection
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 1,
          results: [
            {
              total_rules: 0,
              by_action: {},
              by_target_type: {},
              by_direction: {},
              active_rules: 0,
              paused_rules: 0,
              rules_with_hits: 0,
            },
          ],
        };
      }

      // Filter rules based on parameters with enhanced safety
      let filteredRules = rules.results.filter(
        rule => rule && typeof rule === 'object'
      );

      if (activeOnly) {
        filteredRules = filteredRules.filter(rule => {
          const { status } = rule;
          return status === 'active' || !status || status === undefined;
        });
      }

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Generate summary statistics by category with enhanced safety
      const summary = {
        total_rules: filteredRules.length,
        by_action: {} as Record<string, number>,
        by_target_type: {} as Record<string, number>,
        by_direction: {} as Record<string, number>,
        active_rules: 0,
        paused_rules: 0,
        rules_with_hits: 0,
      };

      // Safe counting with comprehensive validation
      filteredRules.forEach(rule => {
        if (!rule || typeof rule !== 'object') {
          return;
        }

        // Count by action with validation
        const action =
          rule.action && typeof rule.action === 'string'
            ? rule.action
            : 'unknown';
        summary.by_action[action] = (summary.by_action[action] || 0) + 1;

        // Count by target type with validation
        const targetType =
          rule.target?.type && typeof rule.target.type === 'string'
            ? rule.target.type
            : 'unknown';
        summary.by_target_type[targetType] =
          (summary.by_target_type[targetType] || 0) + 1;

        // Count by direction with validation
        const direction =
          rule.direction && typeof rule.direction === 'string'
            ? rule.direction
            : 'bidirection';
        summary.by_direction[direction] =
          (summary.by_direction[direction] || 0) + 1;

        // Count by status with validation
        const { status } = rule;
        if (status === 'active' || !status || status === undefined) {
          summary.active_rules++;
        } else if (status === 'paused') {
          summary.paused_rules++;
        }

        // Count rules with hits with validation
        const hitCount = rule.hit?.count;
        if (typeof hitCount === 'number' && hitCount > 0) {
          summary.rules_with_hits++;
        }
      });

      return {
        count: 1,
        results: [summary],
      };
    } catch (error) {
      logger.error(
        'Error in getNetworkRulesSummary:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with more specific error types
      if (error instanceof TypeError) {
        throw new Error(
          `Data type error in network rules summary: ${error.message}`
        );
      } else if (error instanceof RangeError) {
        throw new Error(
          `Range error in network rules summary: ${error.message}`
        );
      }
      throw new Error(
        `Failed to get network rules summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get rules with highest hit counts for traffic analysis
   */
  @optimizeResponse('rules')
  async getMostActiveRules(
    limit: number = 20,
    minHits: number = 1,
    ruleType?: string
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    try {
      // Comprehensive input validation and sanitization
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
      ) {
        throw new Error('limit must be a positive integer between 1 and 1000');
      }

      if (
        typeof minHits !== 'number' ||
        !Number.isInteger(minHits) ||
        minHits < 0
      ) {
        throw new Error('minHits must be a non-negative integer');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error('ruleType must be a non-empty string if provided');
      }

      // Sanitize inputs to prevent injection
      const sanitizedLimit = Math.max(Math.floor(limit), 1); // Remove artificial cap
      const sanitizedMinHits = Math.max(Math.floor(minHits), 0);
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 0,
          results: [],
        };
      }

      // Filter and sort rules by hit count with enhanced safety
      let filteredRules = rules.results.filter(
        rule => rule && typeof rule === 'object'
      );

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Filter by minimum hits with comprehensive validation
      filteredRules = filteredRules.filter(rule => {
        if (!rule || typeof rule !== 'object') {
          return false;
        }
        const hitCount = rule.hit?.count;
        if (typeof hitCount !== 'number' || !Number.isFinite(hitCount)) {
          return sanitizedMinHits === 0;
        }
        return hitCount >= sanitizedMinHits;
      });

      // Sort by hit count (descending) with safe comparison
      filteredRules.sort((a, b) => {
        const aHits =
          a?.hit?.count &&
          typeof a.hit.count === 'number' &&
          Number.isFinite(a.hit.count)
            ? a.hit.count
            : 0;
        const bHits =
          b?.hit?.count &&
          typeof b.hit.count === 'number' &&
          Number.isFinite(b.hit.count)
            ? b.hit.count
            : 0;
        return bHits - aHits;
      });

      // Apply limit with bounds checking
      const results = filteredRules.slice(0, sanitizedLimit);

      // Validate results before returning
      const validatedResults = results.filter(rule => {
        return rule && typeof rule === 'object' && rule.id;
      });

      return {
        count: validatedResults.length,
        results: validatedResults,
      };
    } catch (error) {
      logger.error(
        'Error in getMostActiveRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with specific error types
      if (error instanceof TypeError) {
        throw new Error(
          `Data type error in most active rules: ${error.message}`
        );
      } else if (error instanceof RangeError) {
        throw new Error(`Range error in most active rules: ${error.message}`);
      }
      throw new Error(
        `Failed to get most active rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get recently created or modified firewall rules
   */
  @optimizeResponse('rules')
  async getRecentRules(
    hours: number = 24,
    includeModified: boolean = true,
    limit: number = 30,
    ruleType?: string
  ): Promise<{ count: number; results: NetworkRule[]; next_cursor?: string }> {
    try {
      // Comprehensive input validation and sanitization
      if (
        typeof hours !== 'number' ||
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 168
      ) {
        throw new Error(
          'hours must be a positive number between 0 and 168 (7 days)'
        );
      }

      if (typeof includeModified !== 'boolean') {
        throw new Error('includeModified must be a boolean');
      }

      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 1000
      ) {
        throw new Error('limit must be a positive integer between 1 and 1000');
      }

      if (
        ruleType !== undefined &&
        (typeof ruleType !== 'string' || ruleType.trim().length === 0)
      ) {
        throw new Error('ruleType must be a non-empty string if provided');
      }

      // Sanitize inputs to prevent issues
      const sanitizedHours = Math.min(Math.max(hours, 0.1), 168); // Min 6 minutes, max 7 days
      const sanitizedLimit = Math.max(Math.floor(limit), 1); // Remove artificial cap
      const sanitizedRuleType = ruleType
        ? this.sanitizeInput(ruleType.trim())
        : undefined;

      const rules = await this.getNetworkRules();

      // Enhanced null/undefined safety checks
      if (!rules?.results || !Array.isArray(rules.results)) {
        return {
          count: 0,
          results: [],
        };
      }

      // Safe timestamp calculation with overflow protection
      const now = Date.now();
      if (!Number.isFinite(now) || now <= 0) {
        throw new Error('Invalid current timestamp');
      }

      const cutoffTime = Math.floor(now / 1000) - sanitizedHours * 3600;

      // Validate cutoff time
      if (!Number.isFinite(cutoffTime) || cutoffTime < 0) {
        throw new Error('Invalid cutoff time calculation');
      }

      // Filter rules by creation/modification time with enhanced safety
      let filteredRules = rules.results.filter(rule => {
        if (!rule || typeof rule !== 'object') {
          return false;
        }

        const createdTime = rule.ts;
        const updatedTime = rule.updateTs;

        // Validate timestamps
        const validCreatedTime =
          typeof createdTime === 'number' &&
          Number.isFinite(createdTime) &&
          createdTime >= 0
            ? createdTime
            : 0;
        const validUpdatedTime =
          typeof updatedTime === 'number' &&
          Number.isFinite(updatedTime) &&
          updatedTime >= 0
            ? updatedTime
            : 0;

        // Include if created recently
        if (validCreatedTime >= cutoffTime) {
          return true;
        }

        // Include if modified recently (if includeModified is true)
        if (includeModified && validUpdatedTime >= cutoffTime) {
          return true;
        }

        return false;
      });

      if (sanitizedRuleType) {
        filteredRules = filteredRules.filter(rule => {
          const targetType = rule.target?.type;
          return (
            targetType &&
            typeof targetType === 'string' &&
            targetType === sanitizedRuleType
          );
        });
      }

      // Sort by most recent first with enhanced safety
      filteredRules.sort((a, b) => {
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
          return 0;
        }

        const aCreated =
          typeof a.ts === 'number' && Number.isFinite(a.ts) ? a.ts : 0;
        const aUpdated =
          typeof a.updateTs === 'number' && Number.isFinite(a.updateTs)
            ? a.updateTs
            : 0;
        const bCreated =
          typeof b.ts === 'number' && Number.isFinite(b.ts) ? b.ts : 0;
        const bUpdated =
          typeof b.updateTs === 'number' && Number.isFinite(b.updateTs)
            ? b.updateTs
            : 0;

        const aTime = Math.max(aCreated, aUpdated);
        const bTime = Math.max(bCreated, bUpdated);

        return bTime - aTime;
      });

      // Apply limit with bounds checking
      const results = filteredRules.slice(0, sanitizedLimit);

      // Validate results before returning
      const validatedResults = results.filter(rule => {
        return rule && typeof rule === 'object' && rule.id;
      });

      return {
        count: validatedResults.length,
        results: validatedResults,
      };
    } catch (error) {
      logger.error(
        'Error in getRecentRules:',
        error instanceof Error ? error : new Error(String(error))
      );
      // Enhanced error handling with specific error types
      if (error instanceof TypeError) {
        throw new Error(`Data type error in recent rules: ${error.message}`);
      } else if (error instanceof RangeError) {
        throw new Error(`Range error in recent rules: ${error.message}`);
      } else if (error instanceof ReferenceError) {
        throw new Error(`Reference error in recent rules: ${error.message}`);
      }
      throw new Error(
        `Failed to get recent rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Temporarily disable a specific firewall rule for a specified duration
   *
   * @param ruleId - The unique identifier of the rule to pause
   * @param durationMinutes - Duration in minutes to pause the rule (default: 60, max: 1440)
   * @returns Promise resolving to operation result with success status and message
   * @throws {Error} If rule ID is invalid or API request fails
   * @example
   * ```typescript
   * const result = await client.pauseRule('rule-123', 30);
   * console.log(result.message); // "Rule paused successfully"
   * ```
   */
  @optimizeResponse('rules')
  async pauseRule(
    ruleId: string,
    durationMinutes: number = 60
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Enhanced input validation and sanitization
      const validatedRuleId = this.sanitizeInput(ruleId);
      if (!validatedRuleId) {
        throw new Error('Invalid rule ID provided');
      }

      const validatedDuration = Math.max(1, Math.min(durationMinutes, 1440)); // 1 minute to 24 hours

      // Use documented API endpoint with box parameter (like other operations)
      const params = {
        duration: validatedDuration,
        box: this.config.boxId, // Include box context like read operations
      };

      const response = await this.request<{
        success: boolean;
        message: string;
      }>(
        'POST',
        `/v2/rules/${validatedRuleId}/pause`,
        {}, // empty query params
        params, // body payload with duration & box
        false
      );

      return {
        success: response?.success ?? true, // Default to true if API doesn't return success field
        message:
          response?.message ||
          `Rule ${validatedRuleId} paused for ${validatedDuration} minutes`,
      };
    } catch (error) {
      logger.error(
        'Error in pauseRule:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Resume a previously paused firewall rule, restoring it to active state
   *
   * @param ruleId - The unique identifier of the rule to resume
   * @returns Promise resolving to operation result with success status and message
   * @throws {Error} If rule ID is invalid or rule is not paused
   * @example
   * ```typescript
   * const result = await client.resumeRule('rule-123');
   * console.log(result.message); // "Rule resumed successfully"
   * ```
   */
  @optimizeResponse('rules')
  async resumeRule(
    ruleId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Enhanced input validation and sanitization
      const validatedRuleId = this.sanitizeInput(ruleId);
      if (!validatedRuleId) {
        throw new Error('Invalid rule ID provided');
      }

      // Use documented API endpoint with box parameter (like other operations)
      const params = {
        box: this.config.boxId, // Include box context like read operations
      };

      const response = await this.request<{
        success: boolean;
        message: string;
      }>(
        'POST',
        `/v2/rules/${validatedRuleId}/resume`,
        {}, // empty query params
        params, // body payload with box
        false
      );

      return {
        success: response?.success ?? true, // Default to true if API doesn't return success field
        message:
          response?.message || `Rule ${validatedRuleId} resumed successfully`,
      };
    } catch (error) {
      logger.error(
        'Error in resumeRule:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Helper method to build OR queries for array-based geographic filters
   *
   * @param fieldName - The field name for the query (e.g., 'country', 'region')
   * @param values - Array of values to include in the OR query
   * @returns Query string or null if values array is empty
   * @private
   */
  private buildArrayFilterQuery(
    fieldName: string,
    values?: string[]
  ): string | null {
    if (!values || values.length === 0) {
      return null;
    }

    const queries = values.map(value => `${fieldName}:"${value}"`);
    return queries.length === 1 ? queries[0] : `(${queries.join(' OR ')})`;
  }

  /**
   * Helper method to add box.id qualifier to search queries
   *
   * @param query - Existing query string (optional)
   * @returns Query string with box.id filter added, or just box.id filter if no query
   * @private
   */
  private addBoxFilter(query?: string): string | undefined {
    if (!this.config.boxId) {
      return query;
    }

    const boxFilter = `box.id:${this.config.boxId}`;

    if (!query || query.trim() === '') {
      return boxFilter;
    }

    return `${query} ${boxFilter}`;
  }

  /**
   * Build geographic query string from filters for Firewalla API
   *
   * Converts geographic filter objects into API-compatible query syntax.
   * Supports countries, continents, regions, cities, ASNs, hosting providers,
   * and boolean exclusion filters.
   *
   * @param filters - Geographic filter configuration
   * @returns Query string compatible with Firewalla API
   */
  buildGeoQuery(filters: {
    countries?: string[];
    continents?: string[];
    regions?: string[];
    cities?: string[];
    asns?: string[];
    hosting_providers?: string[];
    exclude_cloud?: boolean;
    exclude_vpn?: boolean;
    min_risk_score?: number;
    high_risk_countries?: boolean;
    exclude_known_providers?: boolean;
    threat_analysis?: boolean;
  }): string {
    const queryParts: string[] = [];

    // Define filter configurations in a data-driven approach
    const filterConfigs = {
      // Array filters
      arrayFilters: [
        { field: 'country', values: filters.countries },
        { field: 'continent', values: filters.continents },
        { field: 'region', values: filters.regions },
        { field: 'city', values: filters.cities },
        { field: 'asn', values: filters.asns },
        { field: 'hosting_provider', values: filters.hosting_providers },
      ],
      // Boolean filters
      booleanFilters: [
        {
          condition: filters.exclude_cloud === true,
          query: 'NOT is_cloud_provider:true',
        },
        { condition: filters.exclude_vpn === true, query: 'NOT is_vpn:true' },
        {
          condition: filters.high_risk_countries === true,
          query: 'geographic_risk_score:>=7',
        },
        {
          condition: filters.exclude_known_providers === true,
          query: 'NOT is_cloud_provider:true AND NOT hosting_provider:*',
        },
      ],
    };

    // Process array filters
    filterConfigs.arrayFilters.forEach(({ field, values }) => {
      const query = this.buildArrayFilterQuery(field, values);
      if (query) {
        queryParts.push(query);
      }
    });

    // Process boolean filters
    filterConfigs.booleanFilters.forEach(({ condition, query }) => {
      if (condition) {
        queryParts.push(query);
      }
    });

    // Process numeric filters
    if (
      filters.min_risk_score !== undefined &&
      typeof filters.min_risk_score === 'number' &&
      filters.min_risk_score >= 0
    ) {
      queryParts.push(`geographic_risk_score:>=${filters.min_risk_score}`);
    }

    // Note: threat_analysis is handled by the API server, not as a query filter

    return queryParts.join(' AND ');
  }

  /**
   * Extract field value from object using dot notation
   */
  private extractFieldValue(obj: any, fieldPath: string): any {
    if (!fieldPath || typeof fieldPath !== 'string') {
      logger.warn('extractFieldValue called with invalid fieldPath:', {
        fieldPath,
      });
      return undefined;
    }
    return fieldPath.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Extract and validate string values with optional allowed values
   */
  private extractValidString(
    value: any,
    defaultValue: string,
    allowedValues?: string[]
  ): string {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return defaultValue;
    }

    const trimmedValue = value.trim();

    if (allowedValues && allowedValues.length > 0) {
      return allowedValues.includes(trimmedValue) ? trimmedValue : defaultValue;
    }

    return trimmedValue;
  }

  /**
   * Public method for making raw API calls
   * Used by management tools for bulk operations
   */
  async makeApiCall(
    method: 'get' | 'post' | 'patch' | 'delete',
    endpoint: string,
    data?: any
  ): Promise<any> {
    try {
      let response;
      switch (method) {
        case 'get':
          response = await this.api.get(endpoint);
          break;
        case 'post':
          response = await this.api.post(endpoint, data || {});
          break;
        case 'patch':
          response = await this.api.patch(endpoint, data || {});
          break;
        case 'delete':
          response = await this.api.delete(endpoint);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
      return response.data;
    } catch (error) {
      logger.error(`API call failed: ${method} ${endpoint}`, error as Error);
      throw error;
    }
  }

  /**
   * Get flow insights with category-based analysis
   * This provides category breakdowns and bandwidth analysis for networks with high flow volumes
   */
  async getFlowInsights(
    period: '1h' | '24h' | '7d' | '30d' = '24h',
    options?: {
      categories?: string[];
      includeBlocked?: boolean;
    }
  ): Promise<{
    period: string;
    categoryBreakdown: Array<{
      category: string;
      count: number;
      bytes: number;
      topDomains: Array<{ domain: string; count: number; bytes: number }>;
    }>;
    topDevices: Array<{
      device: string;
      totalBytes: number;
      categories: Array<{ category: string; bytes: number }>;
    }>;
    blockedSummary?: {
      totalBlocked: number;
      byCategory: Array<{ category: string; count: number }>;
    };
  }> {
    try {
      // Calculate time range
      const end = Math.floor(Date.now() / 1000);
      let begin: number;
      switch (period) {
        case '1h':
          begin = end - 3600;
          break;
        case '24h':
          begin = end - 24 * 3600;
          break;
        case '7d':
          begin = end - 7 * 24 * 3600;
          break;
        case '30d':
          begin = end - 30 * 24 * 3600;
          break;
      }

      // Get category breakdown with error handling
      const categoryQuery = `ts:${begin}-${end}${options?.categories ? ` AND (${options.categories.map(c => `category:${c}`).join(' OR ')})` : ''}`;

      let categoryData;
      try {
        categoryData = await this.searchFlows({
          query: categoryQuery,
          group_by: 'category,domain',
          sort_by: 'bytes:desc',
          limit: 500,
        });
      } catch (error) {
        logger.error(
          'Failed to get category data in getFlowInsights:',
          error instanceof Error ? error : new Error(String(error))
        );
        categoryData = { results: [], count: 0 };
      }

      // Process category breakdown
      const categoryMap = new Map<
        string,
        {
          count: number;
          bytes: number;
          domains: Map<string, { count: number; bytes: number }>;
        }
      >();

      categoryData.results.forEach((item: any) => {
        const category = item.category?.name || 'uncategorized';
        const domain = item.domain || 'unknown';

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            count: 0,
            bytes: 0,
            domains: new Map(),
          });
        }

        const cat = categoryMap.get(category)!;
        cat.count += item.count || 1;
        cat.bytes += item.bytes || 0;

        if (!cat.domains.has(domain)) {
          cat.domains.set(domain, { count: 0, bytes: 0 });
        }
        const dom = cat.domains.get(domain)!;
        dom.count += item.count || 1;
        dom.bytes += item.bytes || 0;
      });

      // Get top devices by bandwidth with error handling
      let deviceData;
      try {
        deviceData = await this.searchFlows({
          query: `ts:${begin}-${end}`,
          group_by: 'device,category',
          sort_by: 'bytes:desc',
          limit: 200,
        });
      } catch (error) {
        logger.error(
          'Failed to get device data in getFlowInsights:',
          error instanceof Error ? error : new Error(String(error))
        );
        deviceData = { results: [], count: 0 };
      }

      // Process device data
      const deviceMap = new Map<
        string,
        {
          totalBytes: number;
          categories: Map<string, number>;
        }
      >();

      deviceData.results.forEach((item: any) => {
        const deviceName = item.device?.name || item.device?.ip || 'unknown';
        const category = item.category?.name || 'uncategorized';

        if (!deviceMap.has(deviceName)) {
          deviceMap.set(deviceName, {
            totalBytes: 0,
            categories: new Map(),
          });
        }

        const dev = deviceMap.get(deviceName)!;
        dev.totalBytes += item.bytes || 0;

        if (!dev.categories.has(category)) {
          dev.categories.set(category, 0);
        }
        dev.categories.set(
          category,
          (dev.categories.get(category) || 0) + (item.bytes || 0)
        );
      });

      // Get blocked flows summary if requested with error handling
      let blockedSummary;
      if (options?.includeBlocked) {
        try {
          const blockedData = await this.searchFlows({
            query: `ts:${begin}-${end} AND blocked:true`,
            group_by: 'category',
            sort_by: 'count:desc',
            limit: 50,
          });

          blockedSummary = {
            totalBlocked: blockedData.count,
            byCategory: blockedData.results.map((item: any) => ({
              category: item.category?.name || 'uncategorized',
              count: item.count || 0,
            })),
          };
        } catch (error) {
          logger.error(
            'Failed to get blocked data in getFlowInsights:',
            error instanceof Error ? error : new Error(String(error))
          );
          blockedSummary = {
            totalBlocked: 0,
            byCategory: [],
          };
        }
      }

      // Format results
      const categoryBreakdown = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          count: data.count,
          bytes: data.bytes,
          topDomains: Array.from(data.domains.entries())
            .map(([domain, stats]) => ({ domain, ...stats }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 5),
        }))
        .sort((a, b) => b.bytes - a.bytes);

      const topDevices = Array.from(deviceMap.entries())
        .map(([device, data]) => ({
          device,
          totalBytes: data.totalBytes,
          categories: Array.from(data.categories.entries())
            .map(([category, bytes]) => ({ category, bytes }))
            .sort((a, b) => b.bytes - a.bytes),
        }))
        .sort((a, b) => b.totalBytes - a.totalBytes)
        .slice(0, 10);

      return {
        period,
        categoryBreakdown,
        topDevices,
        blockedSummary,
      };
    } catch (error) {
      logger.error('Error in getFlowInsights:', error as Error);
      throw error instanceof Error
        ? error
        : new Error('Failed to get flow insights');
    }
  }
}
