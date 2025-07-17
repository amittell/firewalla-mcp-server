/**
 * Analytics and statistics tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  ErrorType,
} from '../../validation/error-handler.js';
import { unixToISOString } from '../../utils/timestamp.js';
import { logger } from '../../monitoring/logger.js';
import { withToolTimeout } from '../../utils/timeout-manager.js';
import {
  normalizeUnknownFields,
  sanitizeFieldValue,
  batchNormalize,
} from '../../utils/data-normalizer.js';
import { normalizeTimestamps } from '../../utils/data-validator.js';

export class GetBoxesHandler extends BaseToolHandler {
  name = 'get_boxes';
  description =
    'List all managed Firewalla boxes with status and configuration details.';
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
      const groupIdValidation = ParameterValidator.validateOptionalString(
        _args?.group_id,
        'group_id'
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
    'Get network statistics including box status, security metrics, and system health indicators.';
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
      const statsResponse = await withToolTimeout(
        async () => firewalla.getSimpleStatistics(),
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
    'Get flow statistics grouped by country/region for geographic analysis. No required parameters. Data cached for 1 hour for performance.';
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
      const stats = await withToolTimeout(
        async () => firewalla.getStatisticsByRegion(),
        this.name
      );

      // Validate response structure with comprehensive null/undefined guards
      if (
        !stats ||
        !SafeAccess.getNestedValue(stats, 'results') ||
        !Array.isArray(stats.results)
      ) {
        return this.createSuccessResponse({
          total_regions: 0,
          regional_statistics: [],
          top_regions: [],
          error:
            'No regional statistics available - API response missing results array',
          debug_info: {
            stats_exists: !!stats,
            results_exists: !!stats?.results,
            results_is_array: !!stats?.results && Array.isArray(stats.results),
            actual_structure: stats ? Object.keys(stats) : 'null',
          },
        });
      }

      // Calculate total flow count for percentage calculations
      const totalFlowCount = stats.results.reduce((sum: number, stat: any) => {
        return (
          sum +
          (typeof SafeAccess.getNestedValue(stat, 'value') === 'number'
            ? stat.value
            : 0)
        );
      }, 0);

      // Process regional statistics with defensive programming
      const regionalStatistics = SafeAccess.safeArrayFilter(
        stats.results,
        (stat: any): stat is any =>
          stat &&
          typeof SafeAccess.getNestedValue(stat, 'value') === 'number' &&
          !!SafeAccess.getNestedValue(stat, 'meta')
      )
        .map((stat: any) => ({
          country_code: SafeAccess.getNestedValue(stat, 'meta.code', 'unknown'),
          flow_count: SafeAccess.getNestedValue(stat, 'value', 0),
          percentage:
            totalFlowCount > 0
              ? Math.round(
                  ((SafeAccess.getNestedValue(stat, 'value', 0) as number) /
                    totalFlowCount) *
                    100
                )
              : 0,
        }))
        .sort((a: any, b: any) => b.flow_count - a.flow_count);

      // Get top 5 regions with defensive programming
      const topRegions = SafeAccess.safeArrayFilter(
        stats.results,
        (stat: any): stat is any =>
          stat &&
          typeof SafeAccess.getNestedValue(stat, 'value') === 'number' &&
          SafeAccess.getNestedValue(stat, 'meta')
      )
        .sort(
          (a: any, b: any) =>
            (SafeAccess.getNestedValue(b, 'value', 0) as number) -
            (SafeAccess.getNestedValue(a, 'value', 0) as number)
        )
        .slice(0, 5)
        .map((stat: any) => ({
          country_code: SafeAccess.getNestedValue(stat, 'meta.code', 'unknown'),
          flow_count: SafeAccess.getNestedValue(stat, 'value', 0),
        }));

      const startTime = Date.now();

      const unifiedResponseData = {
        total_regions: stats.results.length,
        regional_statistics: regionalStatistics,
        top_regions: topRegions,
        total_flow_count: totalFlowCount,
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
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

export class GetStatisticsByBoxHandler extends BaseToolHandler {
  name = 'get_statistics_by_box';
  description =
    'Get statistics for each Firewalla box with activity scores and health monitoring. No required parameters. Data cached for 1 hour for performance.';
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
      const stats = await withToolTimeout(
        async () => firewalla.getStatisticsByBox(),
        this.name
      );

      // Validate stats response structure
      if (!stats || typeof stats !== 'object') {
        throw new Error('Invalid stats response: not an object');
      }

      if (
        !SafeAccess.getNestedValue(stats, 'results') ||
        !Array.isArray(stats.results)
      ) {
        throw new Error('Invalid stats response: results is not an array');
      }

      // Process and validate each box statistic
      const boxStatistics = SafeAccess.safeArrayMap(
        stats.results,
        (stat: any) => {
          const boxMeta = SafeAccess.getNestedValue(stat, 'meta', {}) as any;
          return {
            box_id: SafeAccess.getNestedValue(
              boxMeta,
              'gid',
              'unknown'
            ) as string,
            name: SafeAccess.getNestedValue(
              boxMeta,
              'name',
              'Unknown Box'
            ) as string,
            model: SafeAccess.getNestedValue(
              boxMeta,
              'model',
              'unknown'
            ) as string,
            status: (SafeAccess.getNestedValue(
              boxMeta,
              'online',
              false
            ) as boolean)
              ? 'online'
              : 'offline',
            version: SafeAccess.getNestedValue(
              boxMeta,
              'version',
              'unknown'
            ) as string,
            location: SafeAccess.getNestedValue(
              boxMeta,
              'location',
              'unknown'
            ) as string,
            device_count: SafeAccess.getNestedValue(
              boxMeta,
              'deviceCount',
              0
            ) as number,
            rule_count: SafeAccess.getNestedValue(
              boxMeta,
              'ruleCount',
              0
            ) as number,
            alarm_count: SafeAccess.getNestedValue(
              boxMeta,
              'alarmCount',
              0
            ) as number,
            activity_score: SafeAccess.getNestedValue(
              stat,
              'value',
              0
            ) as number,
            last_seen: (SafeAccess.getNestedValue(
              boxMeta,
              'lastSeen',
              0
            ) as number)
              ? unixToISOString(
                  SafeAccess.getNestedValue(boxMeta, 'lastSeen', 0) as number
                )
              : 'Never',
          };
        }
      ).sort((a: any, b: any) => b.activity_score - a.activity_score);

      // Calculate summary with safe operations
      const onlineBoxes = SafeAccess.safeArrayFilter(
        stats.results,
        (s: any) =>
          SafeAccess.getNestedValue(s, 'meta.online', false) as boolean
      ).length;

      const totalDevices = stats.results.reduce(
        (sum: number, s: any) =>
          sum + (SafeAccess.getNestedValue(s, 'meta.deviceCount', 0) as number),
        0
      );
      const totalRules = stats.results.reduce(
        (sum: number, s: any) =>
          sum + (SafeAccess.getNestedValue(s, 'meta.ruleCount', 0) as number),
        0
      );
      const totalAlarms = stats.results.reduce(
        (sum: number, s: any) =>
          sum + (SafeAccess.getNestedValue(s, 'meta.alarmCount', 0) as number),
        0
      );

      const startTime = Date.now();

      const unifiedResponseData = {
        total_boxes: stats.results.length,
        box_statistics: boxStatistics,
        summary: {
          online_boxes: onlineBoxes,
          total_devices: totalDevices,
          total_rules: totalRules,
          total_alarms: totalAlarms,
        },
      };

      const executionTime = Date.now() - startTime;
      return this.createUnifiedResponse(unifiedResponseData, {
        executionTimeMs: executionTime,
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

export class GetFlowTrendsHandler extends BaseToolHandler {
  name = 'get_flow_trends';
  description =
    'Get historical flow data trends over time with configurable intervals. Optional interval and period parameters. Data cached for 1 hour for performance.';
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
      const periodValidation = ParameterValidator.validateEnum(
        _args?.period,
        'period',
        ['1h', '24h', '7d', '30d'],
        false,
        '24h'
      );
      const intervalValidation = ParameterValidator.validateNumber(
        _args?.interval,
        'interval',
        {
          min: 60,
          max: 86400,
          defaultValue: 3600,
          integer: true,
        }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation,
        intervalValidation,
      ]);

      if (!validationResult.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const period = periodValidation.sanitizedValue!;
      const interval = intervalValidation.sanitizedValue!;

      const trends = await withToolTimeout(
        async () =>
          firewalla.getFlowTrends(
            period as '1h' | '24h' | '7d' | '30d',
            interval as number
          ),
        this.name
      );

      // Validate trends response structure
      if (!trends || typeof trends !== 'object') {
        throw new Error('Invalid trends response: not an object');
      }

      if (
        !SafeAccess.getNestedValue(trends, 'results') ||
        !Array.isArray(trends.results)
      ) {
        throw new Error('Invalid trends response: results is not an array');
      }

      // Validate each trend item has required properties
      const validTrends = SafeAccess.safeArrayFilter(
        trends.results,
        (trend: any) =>
          trend &&
          typeof SafeAccess.getNestedValue(trend, 'ts') === 'number' &&
          typeof SafeAccess.getNestedValue(trend, 'value') === 'number'
      );

      const startTime = Date.now();

      const unifiedResponseData = {
        period,
        interval_seconds: interval,
        data_points: validTrends.length,
        trends: validTrends.map((trend: any) => ({
          timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
          timestamp_iso: unixToISOString(
            SafeAccess.getNestedValue(trend, 'ts', 0) as number
          ),
          flow_count: SafeAccess.getNestedValue(trend, 'value', 0),
        })),
        summary: {
          total_flows: validTrends.reduce(
            (sum: number, t: any) =>
              sum + (SafeAccess.getNestedValue(t, 'value', 0) as number),
            0
          ),
          avg_flows_per_interval:
            validTrends.length > 0
              ? Math.round(
                  validTrends.reduce(
                    (sum: number, t: any) =>
                      sum +
                      (SafeAccess.getNestedValue(t, 'value', 0) as number),
                    0
                  ) / validTrends.length
                )
              : 0,
          // Performance Buffer Strategy: Array processing limitation
          //
          // Problem: Math.max() and Math.min() can exceed call stack limits with
          // very large arrays (>10,000 elements in some JavaScript engines).
          //
          // Solution: Use defensive slicing to process only first 1000 elements.
          // This provides accurate peak/min detection for reasonable datasets while
          // preventing stack overflow errors on unusually large trend datasets.
          //
          // Rationale: 1000 data points is sufficient for trend analysis in most
          // time series scenarios and represents a good balance between accuracy
          // and performance safety.
          peak_flow_count:
            validTrends.length > 0
              ? Math.max(
                  ...validTrends
                    .slice(0, 1000) // Defensive limit to prevent call stack overflow
                    .map(
                      (t: any) =>
                        SafeAccess.getNestedValue(t, 'value', 0) as number
                    )
                )
              : 0,
          min_flow_count:
            validTrends.length > 0
              ? Math.min(
                  ...validTrends
                    .slice(0, 1000) // Defensive limit to prevent call stack overflow
                    .map(
                      (t: any) =>
                        SafeAccess.getNestedValue(t, 'value', 0) as number
                    )
                )
              : 0,
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
        `Failed to get flow trends: ${errorMessage}`,
        ErrorType.API_ERROR,
        {
          period: _args?.period || '24h',
          interval_seconds: _args?.interval || 3600,
          troubleshooting:
            'Check if Firewalla API is accessible and credentials are valid',
        }
      );
    }
  }
}

export class GetAlarmTrendsHandler extends BaseToolHandler {
  name = 'get_alarm_trends';
  description =
    'Get historical alarm data trends over time with configurable periods. Optional period parameter. Data cached for 1 hour for performance.';
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
      const periodValidation = ParameterValidator.validateEnum(
        _args?.period,
        'period',
        ['1h', '24h', '7d', '30d'],
        false,
        '24h'
      );

      if (!periodValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          periodValidation.errors
        );
      }

      const period = periodValidation.sanitizedValue!;

      const trends = await withToolTimeout(
        async () =>
          firewalla.getAlarmTrends(period as '1h' | '24h' | '7d' | '30d'),
        this.name
      );

      // Defensive programming: validate trends response structure
      if (
        !trends ||
        !SafeAccess.getNestedValue(trends, 'results') ||
        !Array.isArray(trends.results)
      ) {
        return this.createSuccessResponse({
          period,
          data_points: 0,
          trends: [],
          summary: {
            total_alarms: 0,
            avg_alarms_per_interval: 0,
            peak_alarm_count: 0,
            intervals_with_alarms: 0,
            alarm_frequency: 0,
          },
          error: 'Invalid alarm trends data received',
        });
      }

      // Validate individual trend entries
      const validTrends = SafeAccess.safeArrayFilter(
        trends.results,
        (trend: any) =>
          trend &&
          typeof SafeAccess.getNestedValue(trend, 'ts') === 'number' &&
          typeof SafeAccess.getNestedValue(trend, 'value') === 'number' &&
          (SafeAccess.getNestedValue(trend, 'ts', 0) as number) > 0 &&
          (SafeAccess.getNestedValue(trend, 'value', 0) as number) >= 0
      );

      const startTime = Date.now();

      const unifiedResponseData = {
        period,
        data_points: validTrends.length,
        trends: SafeAccess.safeArrayMap(validTrends, (trend: any) => ({
          timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
          timestamp_iso: unixToISOString(
            SafeAccess.getNestedValue(trend, 'ts', 0) as number
          ),
          alarm_count: SafeAccess.getNestedValue(trend, 'value', 0),
        })),
        summary: {
          total_alarms: validTrends.reduce(
            (sum: number, t: any) =>
              sum + (SafeAccess.getNestedValue(t, 'value', 0) as number),
            0
          ),
          avg_alarms_per_interval:
            validTrends.length > 0
              ? Math.round(
                  (validTrends.reduce(
                    (sum: number, t: any) =>
                      sum +
                      (SafeAccess.getNestedValue(t, 'value', 0) as number),
                    0
                  ) /
                    validTrends.length) *
                    100
                ) / 100
              : 0,
          // Performance Buffer Strategy: Same defensive slicing as flow trends
          // to prevent call stack overflow with large alarm trend datasets
          peak_alarm_count:
            validTrends.length > 0
              ? Math.max(
                  ...validTrends
                    .slice(0, 1000) // Defensive limit to prevent call stack overflow
                    .map(
                      (t: any) =>
                        SafeAccess.getNestedValue(t, 'value', 0) as number
                    )
                )
              : 0,
          intervals_with_alarms: SafeAccess.safeArrayFilter(
            validTrends,
            (t: any) => (SafeAccess.getNestedValue(t, 'value', 0) as number) > 0
          ).length,
          alarm_frequency:
            validTrends.length > 0
              ? Math.round(
                  (SafeAccess.safeArrayFilter(
                    validTrends,
                    (t: any) =>
                      (SafeAccess.getNestedValue(t, 'value', 0) as number) > 0
                  ).length /
                    validTrends.length) *
                    100
                )
              : 0,
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
        `Failed to get alarm trends: ${errorMessage}`,
        ErrorType.API_ERROR
      );
    }
  }
}

export class GetRuleTrendsHandler extends BaseToolHandler {
  name = 'get_rule_trends';
  description =
    'Get historical rule activity trends over time with configurable periods. Optional period parameter. Data cached for 1 hour for performance.';
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
      const periodValidation = ParameterValidator.validateEnum(
        _args?.period,
        'period',
        ['1h', '24h', '7d', '30d'],
        false,
        '24h'
      );

      if (!periodValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          periodValidation.errors
        );
      }

      const period = periodValidation.sanitizedValue!;

      const trends = await withToolTimeout(
        async () =>
          firewalla.getRuleTrends(period as '1h' | '24h' | '7d' | '30d'),
        this.name
      );

      // Validate trends response structure
      if (!trends || typeof trends !== 'object') {
        throw new Error('Invalid trends response: not an object');
      }

      if (
        !SafeAccess.getNestedValue(trends, 'results') ||
        !Array.isArray(trends.results)
      ) {
        throw new Error('Invalid trends response: results is not an array');
      }

      // Validate each trend item has required properties
      const validTrends = SafeAccess.safeArrayFilter(
        trends.results,
        (trend: any) =>
          trend &&
          typeof SafeAccess.getNestedValue(trend, 'ts') === 'number' &&
          typeof SafeAccess.getNestedValue(trend, 'value') === 'number'
      );

      const startTime = Date.now();

      const unifiedResponseData = {
        period,
        data_points: validTrends.length,
        trends: SafeAccess.safeArrayMap(validTrends, (trend: any) => ({
          timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
          timestamp_iso: unixToISOString(
            SafeAccess.getNestedValue(trend, 'ts', 0) as number
          ),
          active_rule_count: SafeAccess.getNestedValue(trend, 'value', 0),
        })),
        summary: {
          avg_active_rules:
            validTrends.length > 0
              ? Math.round(
                  validTrends.reduce(
                    (sum: number, t: any) =>
                      sum +
                      (SafeAccess.getNestedValue(t, 'value', 0) as number),
                    0
                  ) / validTrends.length
                )
              : 0,
          max_active_rules:
            validTrends.length > 0
              ? Math.max(
                  ...validTrends.map(
                    (t: any) =>
                      SafeAccess.getNestedValue(t, 'value', 0) as number
                  )
                )
              : 0,
          min_active_rules:
            validTrends.length > 0
              ? Math.min(
                  ...validTrends.map(
                    (t: any) =>
                      SafeAccess.getNestedValue(t, 'value', 0) as number
                  )
                )
              : 0,
          rule_stability: this.calculateRuleStability(validTrends),
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
        `Failed to get rule trends: ${errorMessage}`,
        ErrorType.API_ERROR,
        {
          period: _args?.period || '24h',
          troubleshooting:
            'Check if Firewalla API is accessible and firewall rules are available',
        }
      );
    }
  }

  private calculateRuleStability(
    trends: Array<{ ts: number; value: number }>
  ): number {
    if (trends.length < 2) {
      return 100;
    }

    const values = trends.map(
      t => SafeAccess.getNestedValue(t, 'value', 0) as number
    );
    const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;

    if (avgValue === 0) {
      return 100;
    }

    const variation =
      values.reduce((sum, val, i) => {
        return i > 0 ? sum + Math.abs(val - values[i - 1]) : sum;
      }, 0) /
      (values.length - 1);

    const variationPercent = variation / avgValue;
    return Math.max(0, Math.min(100, Math.round((1 - variationPercent) * 100)));
  }
}
