/**
 * Analytics and statistics tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import {
  BoxSelectionError,
  isValidBoxGid,
  type FirewallaClient,
} from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  unixToISOString,
  safeUnixToISOString,
  getCurrentTimestamp,
} from '../../utils/timestamp.js';
import { logger } from '../../monitoring/logger.js';
import { withToolTimeout } from '../../utils/timeout-manager.js';
import {
  normalizeUnknownFields,
  sanitizeFieldValue,
  batchNormalize,
} from '../../utils/data-normalizer.js';
import { normalizeTimestamps } from '../../utils/data-validator.js';
import type {
  BoxStatisticType,
  TrendPeriod,
  TrendSeries,
} from '../../types.js';

export class GetBoxesHandler extends BaseToolHandler {
  name = 'get_boxes';
  description =
    'List the Firewalla boxes this MSP token can see (GET /v2/boxes, optionally one box group), with online status, model and version. Not limited by FIREWALLA_BOX_ID.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: false,
      additionalMeta: {
        data_source: 'flow_trends',
        entity_type: 'historical_flow_data',
        supports_geographic_enrichment: false,
        supports_field_normalization: false,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // The schema advertises `group`; `group_id` is what this read before
      const groupIdValidation = ParameterValidator.validateOptionalString(
        _args?.group ?? _args?.group_id,
        'group'
      );

      if (!groupIdValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          groupIdValidation.errors
        );
      }

      const groupId = groupIdValidation.sanitizedValue;

      const boxesResponse = await withToolTimeout(
        async () => firewalla.getBoxes(groupId as string),
        this.name
      );

      const boxResults = SafeAccess.safeArrayAccess(
        boxesResponse.results,
        (arr: any[]) => arr,
        []
      ) as any[];

      const normalizedBoxes = batchNormalize(boxResults, {
        name: (v: any) => sanitizeFieldValue(v, 'Unknown Box').value,
        model: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        mode: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        version: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        group: (v: any) => (v ? normalizeUnknownFields(v) : null),
        location: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        online: (v: any) => Boolean(v),
        gid: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        license: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        publicIP: (v: any) => sanitizeFieldValue(v, 'unknown').value,
        deviceCount: (v: any) => Number(v) || 0,
        ruleCount: (v: any) => Number(v) || 0,
        alarmCount: (v: any) => Number(v) || 0,
      });

      const startTime = Date.now();

      const boxData = normalizedBoxes.map((box: any) => {
        const timestampNormalized = normalizeTimestamps(box);
        const finalBox = timestampNormalized.data;

        return {
          gid: SafeAccess.getNestedValue(finalBox, 'gid', 'unknown'),
          name: finalBox.name,
          model: finalBox.model,
          mode: finalBox.mode,
          version: finalBox.version,
          online: SafeAccess.getNestedValue(finalBox, 'online', false),
          last_seen: SafeAccess.getNestedValue(finalBox, 'lastSeen', 0),
          license: SafeAccess.getNestedValue(finalBox, 'license', null),
          public_ip: finalBox.publicIP || finalBox.public_ip || 'unknown',
          group: finalBox.group,
          location: finalBox.location,
          device_count: SafeAccess.getNestedValue(finalBox, 'deviceCount', 0),
          rule_count: SafeAccess.getNestedValue(finalBox, 'ruleCount', 0),
          alarm_count: SafeAccess.getNestedValue(finalBox, 'alarmCount', 0),
        };
      });

      // Apply geographic enrichment for public IP addresses
      const enrichedBoxData = await this.enrichGeoIfNeeded(boxData, [
        'public_ip',
      ]);

      const unifiedResponseData = {
        total_boxes: normalizedBoxes.length,
        boxes: enrichedBoxData,
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get boxes: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GetSimpleStatisticsHandler extends BaseToolHandler {
  name = 'get_simple_statistics';
  description =
    'Get account-wide counts from GET /v2/stats/simple: online boxes, offline boxes, alarms and rules, optionally for one box group. Not limited by FIREWALLA_BOX_ID.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in statistics
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'statistics',
        entity_type: 'network_statistics',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const groupValidation = ParameterValidator.validateOptionalString(
        _args?.group,
        'group'
      );
      if (!groupValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          groupValidation.errors
        );
      }
      const statsResponse = await withToolTimeout(
        async () =>
          firewalla.getSimpleStatistics(
            groupValidation.sanitizedValue as string | undefined
          ),
        this.name
      );
      const stats = SafeAccess.safeArrayAccess(
        statsResponse?.results,
        (arr: any[]) => arr[0],
        {}
      ) as any;

      const startTime = Date.now();

      const unifiedResponseData = {
        statistics: {
          online_boxes: SafeAccess.getNestedValue(
            stats,
            'onlineBoxes',
            0
          ) as number,
          offline_boxes: SafeAccess.getNestedValue(
            stats,
            'offlineBoxes',
            0
          ) as number,
          total_boxes:
            (SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) as number) +
            (SafeAccess.getNestedValue(stats, 'offlineBoxes', 0) as number),
          total_alarms: SafeAccess.getNestedValue(stats, 'alarms', 0) as number,
          total_rules: SafeAccess.getNestedValue(stats, 'rules', 0) as number,
          box_availability: this.calculateBoxAvailability(stats),
        },
        summary: {
          status:
            (SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) as number) > 0
              ? 'operational'
              : 'offline',
          health_score: this.calculateHealthScore(stats),
          active_monitoring:
            (SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) as number) > 0,
        },
      };

      const executionTime = Date.now() - startTime;

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get simple statistics: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }

  private calculateBoxAvailability(stats: any): number {
    const onlineBoxes = SafeAccess.getNestedValue(
      stats,
      'onlineBoxes',
      0
    ) as number;
    const offlineBoxes = SafeAccess.getNestedValue(
      stats,
      'offlineBoxes',
      0
    ) as number;
    const totalBoxes = onlineBoxes + offlineBoxes;
    return totalBoxes > 0 ? Math.round((onlineBoxes / totalBoxes) * 100) : 0;
  }

  private calculateHealthScore(stats: any): number {
    let score = 100;

    const onlineBoxes = SafeAccess.getNestedValue(
      stats,
      'onlineBoxes',
      0
    ) as number;
    const offlineBoxes = SafeAccess.getNestedValue(
      stats,
      'offlineBoxes',
      0
    ) as number;
    const alarms = SafeAccess.getNestedValue(stats, 'alarms', 0) as number;
    const rules = SafeAccess.getNestedValue(stats, 'rules', 0) as number;

    const totalBoxes = onlineBoxes + offlineBoxes;
    if (totalBoxes === 0) {
      return 0;
    }

    // Penalize for offline boxes (up to -40 points)
    const offlineRatio = offlineBoxes / totalBoxes;
    score -= Math.round(offlineRatio * 40);

    // Penalize for high alarm count (up to -30 points)
    const alarmPenalty = Math.min(alarms * 2, 30);
    score -= alarmPenalty;

    // Bonus for having active rules (up to +10 points)
    const ruleBonus = Math.min(rules / 10, 10);
    score += ruleBonus;

    return Math.max(0, Math.min(100, score));
  }
}

export class GetStatisticsByRegionHandler extends BaseToolHandler {
  name = 'get_statistics_by_region';
  description =
    'Top regions by blocked flows, from GET /v2/stats/topRegionsByBlockedFlows, optionally for one box group; the API returned no more than 5 regions. Not limited by FIREWALLA_BOX_ID.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // Already contains geographic data
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'regional_statistics',
        entity_type: 'geographic_flow_statistics',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const groupValidation = ParameterValidator.validateOptionalString(
        _args?.group,
        'group'
      );
      const limitValidation = ParameterValidator.validateNumber(
        _args?.limit,
        'limit',
        { min: 1, integer: true }
      );
      if (!groupValidation.isValid || !limitValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [...groupValidation.errors, ...limitValidation.errors]
        );
      }

      const startTime = Date.now();
      const stats = await withToolTimeout(
        async () =>
          firewalla.getStatisticsByRegion(
            groupValidation.sanitizedValue as string | undefined,
            limitValidation.sanitizedValue as number | undefined
          ),
        this.name
      );

      const rows = (Array.isArray(stats?.results) ? stats.results : [])
        .filter(
          (stat: any) =>
            typeof stat?.value === 'number' &&
            typeof stat?.meta?.code === 'string'
        )
        .map((stat: any) => ({
          country_code: stat.meta.code as string,
          flow_count: stat.value as number,
        }))
        .sort((a, b) => b.flow_count - a.flow_count);
      const totalFlowCount = rows.reduce((sum, row) => sum + row.flow_count, 0);

      const unifiedResponseData = {
        metric: 'blocked_flows',
        source: 'GET /v2/stats/topRegionsByBlockedFlows',
        total_regions: rows.length,
        regional_statistics: rows.map(row => ({
          ...row,
          percentage:
            totalFlowCount > 0
              ? Math.round((row.flow_count / totalFlowCount) * 100)
              : 0,
        })),
        top_regions: rows.slice(0, 5),
        total_flow_count: totalFlowCount,
        note: 'flow_count is the number of blocked flows from each region, in the order the API ranks them. percentage and total_flow_count cover only the listed regions.',
      };

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: Date.now() - startTime,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get statistics by region: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/** What each box statistic type counts */
const BOX_STATISTIC_METRICS: Record<
  BoxStatisticType,
  { metric: string; note: string }
> = {
  topBoxesByBlockedFlows: {
    metric: 'blocked_flows',
    note: 'value is the number of blocked flows on the box. The API does not document the window; it was about the last 30 days when measured.',
  },
  topBoxesBySecurityAlarms: {
    metric: 'security_alarms',
    note: 'value is the number of Security Activity (type 1) alarms on the box. The API does not document the window; it matched the last 30 days of alarms when measured. Boxes the API does not rank are not listed.',
  },
};

export class GetStatisticsByBoxHandler extends BaseToolHandler {
  name = 'get_statistics_by_box';
  description =
    "Top boxes by blocked flows (the default) or by Security Activity alarms, from GET /v2/stats/{type}, with each box's details from GET /v2/boxes; each box's value is the statistic, over about the last 30 days when measured. Not limited by FIREWALLA_BOX_ID.";
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in box statistics
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'box_statistics',
        entity_type: 'firewalla_box_statistics',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const typeValidation = ParameterValidator.validateEnum(
        _args?.type,
        'type',
        Object.keys(BOX_STATISTIC_METRICS),
        false,
        'topBoxesByBlockedFlows'
      );
      const groupValidation = ParameterValidator.validateOptionalString(
        _args?.group,
        'group'
      );
      const limitValidation = ParameterValidator.validateNumber(
        _args?.limit,
        'limit',
        { min: 1, integer: true }
      );
      if (
        !typeValidation.isValid ||
        !groupValidation.isValid ||
        !limitValidation.isValid
      ) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [
            ...typeValidation.errors,
            ...groupValidation.errors,
            ...limitValidation.errors,
          ]
        );
      }
      const type = typeValidation.sanitizedValue as BoxStatisticType;

      const startTime = Date.now();
      const stats = await withToolTimeout(
        async () =>
          firewalla.getStatisticsByBox(
            type,
            groupValidation.sanitizedValue as string | undefined,
            limitValidation.sanitizedValue as number | undefined
          ),
        this.name
      );

      if (!Array.isArray(stats?.results)) {
        throw new Error('Invalid stats response: results is not an array');
      }

      const boxStatistics = SafeAccess.safeArrayMap(
        stats.results,
        (stat: any) => {
          const boxMeta = SafeAccess.getNestedValue(stat, 'meta', {}) as any;
          const lastSeen = Number(boxMeta.lastSeen) || 0;
          return {
            box_id: String(boxMeta.gid ?? 'unknown'),
            name: String(boxMeta.name ?? 'Unknown Box'),
            model: String(boxMeta.model ?? 'unknown'),
            value: Number(stat.value) || 0,
            status: boxMeta.online ? 'online' : 'offline',
            version: String(boxMeta.version ?? 'unknown'),
            location: String(boxMeta.location ?? 'unknown'),
            device_count: Number(boxMeta.deviceCount) || 0,
            rule_count: Number(boxMeta.ruleCount) || 0,
            alarm_count: Number(boxMeta.alarmCount) || 0,
            last_seen: lastSeen ? unixToISOString(lastSeen) : 'Never',
          };
        }
      ).sort((a: any, b: any) => b.value - a.value);

      const sum = (field: string): number =>
        boxStatistics.reduce(
          (total: number, box: any) => total + (Number(box[field]) || 0),
          0
        );

      const unifiedResponseData = {
        stat_type: type,
        metric: BOX_STATISTIC_METRICS[type].metric,
        source: `GET /v2/stats/${type}`,
        total_boxes: boxStatistics.length,
        box_statistics: boxStatistics,
        summary: {
          online_boxes: boxStatistics.filter(
            (box: any) => box.status === 'online'
          ).length,
          total_devices: sum('device_count'),
          total_rules: sum('rule_count'),
          total_alarms: sum('alarm_count'),
          total_value: sum('value'),
        },
        note: `${BOX_STATISTIC_METRICS[type].note} device_count, rule_count and alarm_count are the counts GET /v2/boxes reports; the summary covers the listed boxes.`,
      };

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: Date.now() - startTime,
      });
    } catch (error: unknown) {
      logger.error(
        'Error in get_statistics_by_box',
        error instanceof Error ? error : new Error(String(error))
      );

      return this.createErrorResponse(
        `Failed to get box statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR,
        {
          total_boxes: 0,
          box_statistics: [],
          summary: {
            online_boxes: 0,
            total_devices: 0,
            total_rules: 0,
            total_alarms: 0,
          },
        }
      );
    }
  }
}

export class GetRecentFlowActivityHandler extends BaseToolHandler {
  name = 'get_recent_flow_activity';
  description =
    'Get a snapshot of the 50 most recent network flows (one GET /v2/flows request) with protocol, region and blocked/allowed counts; the minutes they span depend on how busy the network is. Use this for: "what\'s happening right now?", current security threats, immediate network issues. DO NOT use for: historical analysis, more than 50 flows, or daily/weekly patterns; use search_flows with time queries like "ts:>24h" for those. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'analytics' as const;

  private static readonly MAX_FLOWS = 50;
  private static readonly FLOWS_PER_PAGE = 50;
  private static readonly MAX_PAGES = Math.ceil(
    GetRecentFlowActivityHandler.MAX_FLOWS /
      GetRecentFlowActivityHandler.FLOWS_PER_PAGE
  );

  constructor() {
    super({
      enableGeoEnrichment: false, // Disabled to stay within token limits
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'recent_flow_activity',
        entity_type: 'current_network_snapshot',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
        time_scope: 'recent_activity_only',
        max_flows: GetRecentFlowActivityHandler.MAX_FLOWS,
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const startTime = Date.now();
      const allFlows: any[] = [];
      let cursor: string | undefined;
      let pagesProcessed = 0;

      // Fetch up to 2000 flows in 4 pages of 500 each
      while (
        pagesProcessed < GetRecentFlowActivityHandler.MAX_PAGES &&
        allFlows.length < GetRecentFlowActivityHandler.MAX_FLOWS
      ) {
        const currentCursor = cursor;
        const pageData = await withToolTimeout(
          async () =>
            firewalla.getFlowData(
              undefined, // No query filter - get all recent flows
              undefined, // No groupBy - we want individual flows
              'ts:desc', // Most recent first
              GetRecentFlowActivityHandler.FLOWS_PER_PAGE,
              currentCursor
            ),
          this.name
        );

        if (!pageData?.results || !Array.isArray(pageData.results)) {
          break; // No more data or invalid response
        }

        allFlows.push(...pageData.results);
        cursor = pageData.next_cursor;
        pagesProcessed++;

        // Break if no more pages available or we hit our limit
        if (
          !cursor ||
          allFlows.length >= GetRecentFlowActivityHandler.MAX_FLOWS
        ) {
          break;
        }
      }

      // Limit to exactly MAX_FLOWS if we got more
      const flows = allFlows.slice(0, GetRecentFlowActivityHandler.MAX_FLOWS);

      if (flows.length === 0) {
        return this.createUnifiedResponse(
          {
            flows_analyzed: 0,
            time_span_minutes: 0,
            activity_summary: 'No recent flows found',
            flows: [],
            limitations: {
              data_scope: 'Current activity snapshot only',
              not_suitable_for: [
                'Historical analysis',
                'Daily patterns',
                'Trend analysis',
              ],
              time_frame: 'Last 10-20 minutes for high-volume networks',
            },
          },
          {
            executionTimeMs: Date.now() - startTime,
          }
        );
      }

      // Calculate time span of the flows
      const oldestFlow = flows[flows.length - 1];
      const newestFlow = flows[0];
      const timeSpanSeconds = (newestFlow.ts || 0) - (oldestFlow.ts || 0);
      const timeSpanMinutes = Math.round(timeSpanSeconds / 60);

      // Analyze the flows for summary statistics
      const protocolCounts = new Map<string, number>();
      const regionCounts = new Map<string, number>();
      const blockedCount = flows.filter(f => f.block).length;
      const allowedCount = flows.length - blockedCount;

      flows.forEach(flow => {
        const protocol = flow.protocol || 'unknown';
        const region = flow.region || flow.country || 'unknown';

        protocolCounts.set(protocol, (protocolCounts.get(protocol) || 0) + 1);
        regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
      });

      // Convert maps to sorted arrays for top protocols/regions
      const topProtocols = Array.from(protocolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([protocol, count]) => ({
          protocol,
          count,
          percentage: Math.round((count / flows.length) * 100),
        }));

      const topRegions = Array.from(regionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({
          region,
          count,
          percentage: Math.round((count / flows.length) * 100),
        }));

      const unifiedResponseData = {
        flows_analyzed: flows.length,
        pages_fetched: pagesProcessed,
        time_span_minutes: timeSpanMinutes,
        data_period: `Last ${timeSpanMinutes} minutes`,
        activity_summary: {
          total_flows: flows.length,
          blocked_flows: blockedCount,
          allowed_flows: allowedCount,
          blocked_percentage: Math.round((blockedCount / flows.length) * 100),
          top_protocols: topProtocols,
          top_regions: topRegions,
        },
        flows: flows.map(flow => ({
          timestamp: flow.ts,
          timestamp_iso: safeUnixToISOString(flow.ts, 'Never'),
          protocol: flow.protocol,
          direction: flow.direction,
          blocked: flow.block,
          source_ip: flow.source?.ip,
          destination_ip: flow.destination?.ip,
          region: flow.region || flow.country,
          category: flow.category,
          domain: flow.domain,
          bytes: flow.total || 0,
          block_reason: flow.blockedby,
        })),
        limitations: {
          data_scope: 'Recent activity snapshot only - NOT historical trends',
          sample_size: `${flows.length} flows from last ${timeSpanMinutes} minutes`,
          not_suitable_for: [
            'Daily/weekly/monthly analysis',
            'Historical trend identification',
            'Peak usage time analysis',
            'Long-term pattern detection',
          ],
          suitable_for: [
            'Current network state assessment',
            'Immediate security analysis',
            'Recent protocol distribution',
            'Active threat detection',
            'Real-time activity monitoring',
          ],
          performance_note:
            flows.length >= GetRecentFlowActivityHandler.MAX_FLOWS
              ? `Limited to ${GetRecentFlowActivityHandler.MAX_FLOWS} flows for performance`
              : 'All available recent flows included',
        },
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get recent flow activity: ${errorMessage}`,
        ErrorType.API_ERROR,
        {
          max_flows: GetRecentFlowActivityHandler.MAX_FLOWS,
          flows_per_page: GetRecentFlowActivityHandler.FLOWS_PER_PAGE,
          troubleshooting:
            'Check if Firewalla API is accessible and credentials are valid',
        }
      );
    }
  }
}

export class GetFlowInsightsHandler extends BaseToolHandler {
  name = 'get_flow_insights';
  description =
    'Get category-based flow analysis for a period: top content categories and their domains, top devices by bandwidth, and optionally blocked traffic. Ideal for answering questions like "what porn sites were accessed" or "what social media was used". Computed client-side from the period\'s largest flows (GET /v2/flows by total bytes: up to 500 for categories, 200 for devices) and, with include_blocked, the 50 most frequent blocked flows, so on a busy network it covers the largest flows, not all of them. Scoped to FIREWALLA_BOX_ID when set, otherwise every box.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // Already contains aggregated data
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'flow_insights',
        entity_type: 'category_flow_analysis',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const periodValidation = ParameterValidator.validateEnum(
        _args?.period,
        'period',
        ['1h', '24h', '7d', '30d'],
        false,
        '24h'
      );
      const categoriesValidation = ParameterValidator.validateArray(
        _args?.categories,
        'categories',
        {
          required: false,
        }
      );

      // Validate allowed category values if provided
      const allowedCategories = [
        'ad',
        'edu',
        'games',
        'gamble',
        'intel',
        'p2p',
        'porn',
        'private',
        'social',
        'shopping',
        'video',
        'vpn',
      ];

      if (categoriesValidation.isValid && categoriesValidation.sanitizedValue) {
        const categories = categoriesValidation.sanitizedValue as string[];
        const invalidCategories = categories.filter(
          cat => !allowedCategories.includes(cat)
        );
        if (invalidCategories.length > 0) {
          categoriesValidation.isValid = false;
          categoriesValidation.errors = [
            `Invalid categories: ${invalidCategories.join(', ')}`,
          ];
        }
      }
      const includeBlockedValidation = ParameterValidator.validateBoolean(
        _args?.include_blocked,
        'include_blocked',
        false
      );

      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation,
        categoriesValidation,
        includeBlockedValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const period = periodValidation.sanitizedValue as
        '1h' | '24h' | '7d' | '30d';
      const categories = categoriesValidation.sanitizedValue as
        string[] | undefined;
      const includeBlocked = includeBlockedValidation.sanitizedValue as boolean;

      const startTime = Date.now();

      const insights = await withToolTimeout(
        async () =>
          firewalla.getFlowInsights(period, {
            categories,
            includeBlocked,
          }),
        this.name
      );

      // Format response for better readability
      const unifiedResponseData = {
        period,
        analysis_time: getCurrentTimestamp(),

        // Category breakdown with human-readable formatting
        content_categories: insights.categoryBreakdown.map(cat => ({
          category: cat.category,
          flow_count: cat.count,
          total_bytes: cat.bytes,
          total_mb: Math.round((cat.bytes / 1048576) * 100) / 100,
          top_domains: cat.topDomains.map(dom => ({
            domain: dom.domain,
            visits: dom.count,
            bandwidth_mb: Math.round((dom.bytes / 1048576) * 100) / 100,
          })),
        })),

        // Top bandwidth consumers
        top_bandwidth_devices: insights.topDevices.map(dev => ({
          device: dev.device,
          total_bandwidth_mb:
            Math.round((dev.totalBytes / 1048576) * 100) / 100,
          category_usage: dev.categories.map(cat => ({
            category: cat.category,
            bandwidth_mb: Math.round((cat.bytes / 1048576) * 100) / 100,
          })),
        })),

        // Blocked traffic summary if requested
        ...(insights.blockedSummary && {
          blocked_traffic: {
            total_blocked_flows: insights.blockedSummary.totalBlocked,
            blocked_by_category: insights.blockedSummary.byCategory,
          },
        }),

        // Summary statistics
        summary: {
          total_categories: insights.categoryBreakdown.length,
          total_bandwidth_gb:
            Math.round(
              (insights.categoryBreakdown.reduce(
                (sum, cat) => sum + cat.bytes,
                0
              ) /
                1073741824) *
                100
            ) / 100,
          most_active_category:
            insights.categoryBreakdown[0]?.category || 'none',
          top_bandwidth_consumer: insights.topDevices[0]?.device || 'none',
        },
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get flow insights: ${errorMessage}`,
        ErrorType.API_ERROR,
        {
          period: _args?.period || '24h',
          categories: _args?.categories || 'all',
          troubleshooting:
            'Check if Firewalla API is accessible and flow data is available',
        }
      );
    }
  }
}

const TREND_PERIODS: TrendPeriod[] = ['1h', '24h', '7d', '30d'];

/**
 * Validate the trend tools' optional `period` (default 30d, the API's whole
 * series) and `group`
 */
function validateTrendArgs(args: ToolArgs): {
  errors: string[];
  period: TrendPeriod;
  group?: string;
} {
  const periodValidation = ParameterValidator.validateEnum(
    args?.period,
    'period',
    TREND_PERIODS,
    false,
    '30d'
  );
  const groupValidation = ParameterValidator.validateOptionalString(
    args?.group,
    'group'
  );
  return {
    errors: [...periodValidation.errors, ...groupValidation.errors],
    period: (periodValidation.sanitizedValue as TrendPeriod) || '30d',
    group: groupValidation.sanitizedValue as string | undefined,
  };
}

/**
 * Validate the trend tools' optional `box`: a box gid, and not together with
 * `group`
 */
function validateTrendBox(
  args: ToolArgs,
  group: string | undefined
): { errors: string[]; box?: string } {
  const boxValidation = ParameterValidator.validateOptionalString(
    args?.box,
    'box'
  );
  const box = boxValidation.sanitizedValue as string | undefined;
  const errors = [...boxValidation.errors];
  if (box !== undefined && !isValidBoxGid(box)) {
    errors.push(
      "box must be a box gid (letters, digits, '-' or '_'); get_boxes lists them"
    );
  }
  if (box !== undefined && group !== undefined) {
    errors.push(
      'box and group cannot be combined: pass box for one box or group for a box group'
    );
  }
  return { errors, box };
}

/**
 * The BoxSelectionError behind a failure, if any: withToolTimeout rewraps
 * errors and keeps the original as `cause`
 */
function boxSelectionError(error: unknown): BoxSelectionError | undefined {
  if (error instanceof BoxSelectionError) {
    return error;
  }
  const cause = (error as { cause?: unknown })?.cause;
  return cause instanceof BoxSelectionError ? cause : undefined;
}

/** Where a trend tool's daily points came from and what they cover */
function describeTrend(series: TrendSeries, period: TrendPeriod) {
  const notes = [
    `The trends API has one point per day, and each timestamp is the start of a day; these are the days that overlap the last ${period}.`,
  ];
  if (series.last_point_partial) {
    notes.push('The last point is the current day so far.');
  }
  if (series.note) {
    notes.push(series.note);
  }
  return {
    interval: series.interval,
    source: series.source,
    scope: series.scope,
    window: {
      from:
        series.window_start !== undefined
          ? unixToISOString(series.window_start)
          : null,
      to: unixToISOString(series.window_end),
    },
    last_point_partial: series.last_point_partial,
    note: notes.join(' '),
  };
}

/** Total, mean, peak and non-zero days of a series' values */
function summarizeValues(points: Array<{ value: number }>) {
  const values = points.map(point => point.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const nonZero = values.filter(value => value > 0).length;
  return {
    total,
    mean:
      values.length > 0 ? Math.round((total / values.length) * 100) / 100 : 0,
    peak: values.reduce((max, value) => Math.max(max, value), 0),
    nonZero,
    nonZeroPercent:
      values.length > 0 ? Math.round((nonZero / values.length) * 100) : 0,
  };
}

export class GetFlowTrendsHandler extends BaseToolHandler {
  name = 'get_flow_trends';
  description =
    'Blocked flows per day for the last 30 days, one point per day, the last being today so far; period (default 30d) returns the days that overlap it. Without a box it is one GET /v2/trends/flows covering every box, or the box group. That endpoint takes no box, so with box (else FIREWALLA_BOX_ID, unless group is given) each day is counted with one GET /v2/flows status:blocked groupBy=box scoped to the box: 1 request plus 1 per day, ~31 for 30d, of the 100 requests the API allows per 5 minutes. box and group cannot be combined.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in flow trends
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'flow_trends',
        entity_type: 'historical_flow_data',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const { errors, period, group } = validateTrendArgs(_args);
      const boxCheck = validateTrendBox(_args, group);
      errors.push(...boxCheck.errors);
      if (errors.length > 0) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          errors
        );
      }

      const startTime = Date.now();
      const series = await withToolTimeout(
        async () => firewalla.getFlowTrends(period, group, boxCheck.box),
        this.name
      );
      const points = Array.isArray(series?.results) ? series.results : [];
      const stats = summarizeValues(points);

      const unifiedResponseData = {
        period,
        data_points: points.length,
        trends: points.map(point => ({
          timestamp: point.ts,
          timestamp_iso: unixToISOString(point.ts),
          blocked_flow_count: point.value,
        })),
        summary: {
          total_blocked_flows: stats.total,
          avg_blocked_flows_per_interval: stats.mean,
          peak_blocked_flow_count: stats.peak,
          intervals_with_blocked_flows: stats.nonZero,
          blocked_flow_frequency: stats.nonZeroPercent,
        },
        ...describeTrend(series, period),
      };

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: Date.now() - startTime,
      });
    } catch (error: unknown) {
      // A malformed FIREWALLA_BOX_ID, refused before any request
      const selectionError = boxSelectionError(error);
      if (selectionError) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [selectionError.message]
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get flow trends: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GetAlarmTrendsHandler extends BaseToolHandler {
  name = 'get_alarm_trends';
  description =
    'Alarms generated per day for the last 30 days, one point per day, the last being today so far; period (default 30d) returns the days that overlap it. Without a box it is one GET /v2/trends/alarms covering every box, or the box group. That endpoint takes no box, so with box (else FIREWALLA_BOX_ID, unless group is given) each day is counted with one GET /v2/alarms groupBy=box scoped to the box: 1 request plus 1 per day, ~31 for 30d, of the 100 requests the API allows per 5 minutes. box and group cannot be combined.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in alarm trends
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'alarm_trends',
        entity_type: 'historical_alarm_data',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const { errors, period, group } = validateTrendArgs(_args);
      const boxCheck = validateTrendBox(_args, group);
      errors.push(...boxCheck.errors);
      if (errors.length > 0) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          errors
        );
      }

      const startTime = Date.now();
      const series = await withToolTimeout(
        async () => firewalla.getAlarmTrends(period, group, boxCheck.box),
        this.name
      );
      const points = Array.isArray(series?.results) ? series.results : [];
      const stats = summarizeValues(points);

      const unifiedResponseData = {
        period,
        data_points: points.length,
        trends: points.map(point => ({
          timestamp: point.ts,
          timestamp_iso: unixToISOString(point.ts),
          alarm_count: point.value,
        })),
        summary: {
          total_alarms: stats.total,
          avg_alarms_per_interval: stats.mean,
          peak_alarm_count: stats.peak,
          intervals_with_alarms: stats.nonZero,
          alarm_frequency: stats.nonZeroPercent,
        },
        ...describeTrend(series, period),
      };

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: Date.now() - startTime,
      });
    } catch (error: unknown) {
      // A malformed FIREWALLA_BOX_ID, refused before any request
      const selectionError = boxSelectionError(error);
      if (selectionError) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [selectionError.message]
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get alarm trends: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GetRuleTrendsHandler extends BaseToolHandler {
  name = 'get_rule_trends';
  description =
    'Rules created per day for the last 30 days, one point per day, the last being today so far; period (default 30d) returns the days that overlap it. Without a box it is GET /v2/trends/rules covering every box, or the box group. When that endpoint answers 400 (it did when measured), each day counts the rules in GET /v2/rules created on it, on the days of GET /v2/trends/alarms (UTC days if that read fails): 3 requests, 4 with group. That endpoint takes no box, so with box (else FIREWALLA_BOX_ID, unless group is given) the rules of the box are counted that way: 2 requests. Rules deleted since are not counted, and the response says how the days were counted. box and group cannot be combined.';
  category = 'analytics' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in rule trends
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'rule_trends',
        entity_type: 'historical_rule_data',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const { errors, period, group } = validateTrendArgs(_args);
      const boxCheck = validateTrendBox(_args, group);
      errors.push(...boxCheck.errors);
      if (errors.length > 0) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          errors
        );
      }

      const startTime = Date.now();
      const series = await withToolTimeout(
        async () => firewalla.getRuleTrends(period, group, boxCheck.box),
        this.name
      );
      const points = Array.isArray(series?.results) ? series.results : [];
      const stats = summarizeValues(points);

      const unifiedResponseData = {
        period,
        data_points: points.length,
        trends: points.map(point => ({
          timestamp: point.ts,
          timestamp_iso: unixToISOString(point.ts),
          rules_created: point.value,
        })),
        summary: {
          total_rules_created: stats.total,
          avg_rules_created_per_day: stats.mean,
          peak_rules_created: stats.peak,
          days_with_new_rules: stats.nonZero,
        },
        ...describeTrend(series, period),
      };

      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: Date.now() - startTime,
      });
    } catch (error: unknown) {
      // A malformed FIREWALLA_BOX_ID, refused before any request
      const selectionError = boxSelectionError(error);
      if (selectionError) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [selectionError.message]
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get rule trends: ${errorMessage}`,
        ErrorType.API_ERROR,
        {
          period: _args?.period || '30d',
          troubleshooting:
            'Check if Firewalla API is accessible and firewall rules are available',
        }
      );
    }
  }
}
