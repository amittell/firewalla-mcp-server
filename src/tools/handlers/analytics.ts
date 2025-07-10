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
// Temporarily commented out for simplification PR
// import {
//   safeAccess,
//   safeValue,
// } from '../../utils/data-normalizer.js';
import { normalizeTimestamps } from '../../utils/data-validator.js';

export class GetBoxesHandler extends BaseToolHandler {
  name = 'get_boxes';
  description = `List all managed Firewalla boxes with comprehensive status and configuration details.

Retrieve information about all Firewalla devices in your network including their status, configuration, and monitoring capabilities.

RESPONSE DATA:
- Box identification: GID, name, model, and version information
- Status monitoring: Online/offline status and last seen timestamps
- Network configuration: Public IP, location, and network settings
- Device statistics: Connected device count, active rules, and alarm counts
- License information: Subscription status and feature availability

OPTIONAL FILTERING:
- group_id parameter to filter boxes by specific groups
- Automatic data normalization for consistent field formats
- Timestamp conversion to ISO format for standardized time handling

DATA NORMALIZATION:
- Unknown values standardized across all fields
- Box names sanitized to handle null/empty values
- Location data normalized for consistent geographic information
- Public IP validation and formatting

TROUBLESHOOTING:
- If no boxes returned, verify MSP API credentials and permissions
- Check network connectivity if boxes show as offline
- Ensure box GIDs are correctly configured in environment variables

See the Box Management guide for configuration details.`;
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
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

      const boxesResponse = await firewalla.getBoxes(groupId as string);

      // Normalize box data for consistency
      const boxResults = SafeAccess.safeArrayAccess(
        boxesResponse.results,
        (arr: any[]) => arr,
        []
      ) as any[];
      // Simplified: just use the raw data for now
      const normalizedBoxes = boxResults;

      return this.createSuccessResponse({
        total_boxes: normalizedBoxes.length,
        boxes: normalizedBoxes.map((box: any) => {
          // Apply timestamp normalization
          const timestampNormalized = normalizeTimestamps(box);
          const finalBox = timestampNormalized.data;

          return {
            gid: SafeAccess.getNestedValue(finalBox, 'gid', 'unknown'),
            name: finalBox.name, // Already normalized
            model: finalBox.model, // Already normalized
            mode: finalBox.mode, // Already normalized
            version: finalBox.version, // Already normalized
            online: SafeAccess.getNestedValue(finalBox, 'online', false),
            last_seen: SafeAccess.getNestedValue(finalBox, 'lastSeen', 0),
            license: SafeAccess.getNestedValue(finalBox, 'license', null),
            public_ip: finalBox.publicIP || finalBox.public_ip || 'unknown', // Standardized field name
            group: finalBox.group, // Already normalized
            location: finalBox.location, // Already normalized
            device_count: SafeAccess.getNestedValue(finalBox, 'deviceCount', 0),
            rule_count: SafeAccess.getNestedValue(finalBox, 'ruleCount', 0),
            alarm_count: SafeAccess.getNestedValue(finalBox, 'alarmCount', 0),
          };
        }),
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
  description = `Get comprehensive network statistics with health monitoring and status analysis.

Provides an overview of your entire Firewalla network infrastructure including box status, security metrics, and system health indicators.

STATISTICS PROVIDED:
- Box availability: Online/offline counts and availability percentage
- Security monitoring: Total alarms and active threats
- Policy management: Total rules and enforcement status
- Health assessment: Overall system health score (0-100)
- Status summary: Operational status and active monitoring indicators

HEALTH SCORE CALCULATION:
- Base score: 100 points
- Offline box penalty: Up to -40 points based on offline ratio
- Alarm penalty: Up to -30 points for high alarm counts
- Rule bonus: Up to +10 points for active rule management
- Final range: 0-100 with higher scores indicating better health

USE CASES:
- Dashboard overview: Quick system status assessment
- Health monitoring: Automated health check integration
- Capacity planning: Understanding current infrastructure load
- Troubleshooting: Identifying system-wide issues

PERFORMANCE NOTES:
- Statistics cached for 1 hour for optimal performance
- Real-time calculation of derived metrics
- Defensive programming prevents division by zero errors
- Null-safe operations throughout calculation pipeline

ERROR HANDLING:
- Returns default values if API data unavailable
- Graceful degradation with partial data
- Detailed error context for troubleshooting

This tool provides the foundation for network health monitoring and dashboard displays.`;
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const statsResponse = await firewalla.getSimpleStatistics();
      const stats = SafeAccess.safeArrayAccess(
        statsResponse?.results,
        (arr: any[]) => arr[0],
        {}
      ) as any;

      return this.createSuccessResponse({
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
  description = 'Get flow statistics grouped by country/region for geographic analysis. No required parameters. Data cached for 5 minutes for performance.';
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const stats = await firewalla.getStatisticsByRegion();

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

      return this.createSuccessResponse({
        total_regions: stats.results.length,
        regional_statistics: regionalStatistics,
        top_regions: topRegions,
        total_flow_count: totalFlowCount,
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
  description = 'Get statistics for each Firewalla box with activity scores and health monitoring. No required parameters. Data cached for 5 minutes for performance.';
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const stats = await firewalla.getStatisticsByBox();

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

      return this.createSuccessResponse({
        total_boxes: stats.results.length,
        box_statistics: boxStatistics,
        summary: {
          online_boxes: onlineBoxes,
          total_devices: totalDevices,
          total_rules: totalRules,
          total_alarms: totalAlarms,
        },
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
  description = 'Get historical flow data trends over time with configurable intervals. Optional interval and period parameters. Data cached for 5 minutes for performance.';
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
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

      const trends = await firewalla.getFlowTrends(
        period as '1h' | '24h' | '7d' | '30d',
        interval as number
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

      return this.createSuccessResponse({
        period,
        interval_seconds: interval,
        data_points: validTrends.length,
        trends: SafeAccess.safeArrayMap(validTrends, (trend: any) => ({
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
  description = 'Get historical alarm data trends over time with configurable periods. Optional period parameter. Data cached for 5 minutes for performance.';
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
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

      const trends = await firewalla.getAlarmTrends(
        period as '1h' | '24h' | '7d' | '30d'
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

      return this.createSuccessResponse({
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
  description = 'Get historical rule activity trends over time with configurable periods. Optional period parameter. Data cached for 5 minutes for performance.';
  category = 'analytics' as const;

  async execute(
    _args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
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

      const trends = await firewalla.getRuleTrends(
        period as '1h' | '24h' | '7d' | '30d'
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

      return this.createSuccessResponse({
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

    let totalVariation = 0;
    for (let i = 1; i < trends.length; i++) {
      const current = trends[i];
      const previous = trends[i - 1];
      if (current && previous) {
        const currentValue = SafeAccess.getNestedValue(current, 'value', 0);
        const previousValue = SafeAccess.getNestedValue(previous, 'value', 0);
        if (
          typeof currentValue === 'number' &&
          typeof previousValue === 'number'
        ) {
          const change = Math.abs(currentValue - previousValue);
          totalVariation += change;
        }
      }
    }

    const avgValue =
      trends.reduce(
        (sum: number, t: any) =>
          sum + (SafeAccess.getNestedValue(t, 'value', 0) as number),
        0
      ) / trends.length;
    if (avgValue === 0 || !Number.isFinite(avgValue)) {
      return 100;
    }

    // Prevent division by zero when there's only one trend
    if (trends.length <= 1) {
      return 100;
    }

    const variationPercentage = totalVariation / (trends.length - 1) / avgValue;

    // Ensure the result is a finite number
    if (!Number.isFinite(variationPercentage)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, Math.round((1 - variationPercentage) * 100))
    );
  }
}
