/**
 * Analytics and statistics tool handlers
 */

import { BaseToolHandler, ToolArgs, ToolResponse } from './base.js';
import { FirewallaClient } from '../../firewalla/client.js';
import { ParameterValidator, SafeAccess, createErrorResponse } from '../../validation/error-handler.js';
import { unixToISOString } from '../../utils/timestamp.js';
import { logger } from '../../monitoring/logger.js';

export class GetBoxesHandler extends BaseToolHandler {
  name = 'get_boxes';
  description = 'List all managed Firewalla boxes';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const groupIdValidation = ParameterValidator.validateOptionalString(_args?.group_id, 'group_id');
      
      if (!groupIdValidation.isValid) {
        return createErrorResponse(this.name, 'Parameter validation failed', {}, groupIdValidation.errors);
      }
      
      const groupId = groupIdValidation.sanitizedValue;
      
      const boxesResponse = await firewalla.getBoxes(groupId);
      
      return this.createSuccessResponse({
        total_boxes: SafeAccess.safeArrayAccess(boxesResponse.results, (arr) => arr.length, 0),
        boxes: SafeAccess.safeArrayMap(
          boxesResponse.results,
          (box: any) => ({
            gid: SafeAccess.getNestedValue(box, 'gid', 'unknown'),
            name: SafeAccess.getNestedValue(box, 'name', 'Unknown Box'),
            model: SafeAccess.getNestedValue(box, 'model', 'unknown'),
            mode: SafeAccess.getNestedValue(box, 'mode', 'unknown'),
            version: SafeAccess.getNestedValue(box, 'version', 'unknown'),
            online: SafeAccess.getNestedValue(box, 'online', false),
            last_seen: SafeAccess.getNestedValue(box, 'lastSeen', 0),
            license: SafeAccess.getNestedValue(box, 'license', null),
            public_ip: SafeAccess.getNestedValue(box, 'publicIP', 'unknown'),
            group: SafeAccess.getNestedValue(box, 'group', null),
            location: SafeAccess.getNestedValue(box, 'location', null),
            device_count: SafeAccess.getNestedValue(box, 'deviceCount', 0),
            rule_count: SafeAccess.getNestedValue(box, 'ruleCount', 0),
            alarm_count: SafeAccess.getNestedValue(box, 'alarmCount', 0),
          })
        ),
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get boxes: ${errorMessage}`);
    }
  }
}

export class GetSimpleStatisticsHandler extends BaseToolHandler {
  name = 'get_simple_statistics';
  description = 'Get basic statistics about boxes, alarms, and rules';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const statsResponse = await firewalla.getSimpleStatistics();
      const stats = SafeAccess.getNestedValue(statsResponse, 'results[0]', {});
      
      return this.createSuccessResponse({
        statistics: {
          online_boxes: SafeAccess.getNestedValue(stats, 'onlineBoxes', 0),
          offline_boxes: SafeAccess.getNestedValue(stats, 'offlineBoxes', 0),
          total_boxes: SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) + SafeAccess.getNestedValue(stats, 'offlineBoxes', 0),
          total_alarms: SafeAccess.getNestedValue(stats, 'alarms', 0),
          total_rules: SafeAccess.getNestedValue(stats, 'rules', 0),
          box_availability: this.calculateBoxAvailability(stats),
        },
        summary: {
          status: SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) > 0 ? 'operational' : 'offline',
          health_score: this.calculateHealthScore(stats),
          active_monitoring: SafeAccess.getNestedValue(stats, 'onlineBoxes', 0) > 0,
        }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get simple statistics: ${errorMessage}`);
    }
  }

  private calculateBoxAvailability(stats: any): number {
    const onlineBoxes = SafeAccess.getNestedValue(stats, 'onlineBoxes', 0);
    const offlineBoxes = SafeAccess.getNestedValue(stats, 'offlineBoxes', 0);
    const totalBoxes = onlineBoxes + offlineBoxes;
    return totalBoxes > 0 ? Math.round((onlineBoxes / totalBoxes) * 100) : 0;
  }

  private calculateHealthScore(stats: any): number {
    let score = 100;
    
    const onlineBoxes = SafeAccess.getNestedValue(stats, 'onlineBoxes', 0);
    const offlineBoxes = SafeAccess.getNestedValue(stats, 'offlineBoxes', 0);
    const alarms = SafeAccess.getNestedValue(stats, 'alarms', 0);
    const rules = SafeAccess.getNestedValue(stats, 'rules', 0);
    
    const totalBoxes = onlineBoxes + offlineBoxes;
    if (totalBoxes === 0) { return 0; }
    
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
  description = 'Get flow statistics grouped by country/region';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const stats = await firewalla.getStatisticsByRegion();
      
      // Validate response structure with comprehensive null/undefined guards
      if (!stats || !SafeAccess.getNestedValue(stats, 'results') || !Array.isArray(stats.results)) {
        return this.createSuccessResponse({
          total_regions: 0,
          regional_statistics: [],
          top_regions: [],
          error: 'No regional statistics available - API response missing results array',
          debug_info: {
            stats_exists: !!stats,
            results_exists: !!stats?.results,
            results_is_array: !!stats?.results && Array.isArray(stats.results),
            actual_structure: stats ? Object.keys(stats) : 'null'
          }
        });
      }

      // Calculate total flow count for percentage calculations
      const totalFlowCount = stats.results.reduce((sum: number, stat: any) => {
        return sum + (typeof SafeAccess.getNestedValue(stat, 'value') === 'number' ? stat.value : 0);
      }, 0);

      // Process regional statistics with defensive programming
      const regionalStatistics = SafeAccess.safeArrayFilter(
        stats.results,
        (stat: any) => stat && typeof SafeAccess.getNestedValue(stat, 'value') === 'number' && SafeAccess.getNestedValue(stat, 'meta')
      )
      .map((stat: any) => ({
        country_code: SafeAccess.getNestedValue(stat, 'meta.code', 'unknown'),
        flow_count: SafeAccess.getNestedValue(stat, 'value', 0),
        percentage: totalFlowCount > 0 
          ? Math.round((SafeAccess.getNestedValue(stat, 'value', 0) / totalFlowCount) * 100) 
          : 0,
      }))
      .sort((a: any, b: any) => b.flow_count - a.flow_count);

      // Get top 5 regions with defensive programming
      const topRegions = SafeAccess.safeArrayFilter(
        stats.results,
        (stat: any) => stat && typeof SafeAccess.getNestedValue(stat, 'value') === 'number' && SafeAccess.getNestedValue(stat, 'meta')
      )
      .sort((a: any, b: any) => SafeAccess.getNestedValue(b, 'value', 0) - SafeAccess.getNestedValue(a, 'value', 0))
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get statistics by region: ${errorMessage}`);
    }
  }
}

export class GetStatisticsByBoxHandler extends BaseToolHandler {
  name = 'get_statistics_by_box';
  description = 'Get statistics for each Firewalla box with activity scores';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      const stats = await firewalla.getStatisticsByBox();
      
      // Validate stats response structure
      if (!stats || typeof stats !== 'object') {
        throw new Error('Invalid stats response: not an object');
      }
      
      if (!SafeAccess.getNestedValue(stats, 'results') || !Array.isArray(stats.results)) {
        throw new Error('Invalid stats response: results is not an array');
      }
      
      // Process and validate each box statistic
      const boxStatistics = SafeAccess.safeArrayMap(
        stats.results,
        (stat: any) => {
          const boxMeta = SafeAccess.getNestedValue(stat, 'meta', {});
          return {
            box_id: SafeAccess.getNestedValue(boxMeta, 'gid', 'unknown'),
            name: SafeAccess.getNestedValue(boxMeta, 'name', 'Unknown Box'),
            model: SafeAccess.getNestedValue(boxMeta, 'model', 'unknown'),
            status: SafeAccess.getNestedValue(boxMeta, 'online', false) ? 'online' : 'offline',
            version: SafeAccess.getNestedValue(boxMeta, 'version', 'unknown'),
            location: SafeAccess.getNestedValue(boxMeta, 'location', 'unknown'),
            device_count: SafeAccess.getNestedValue(boxMeta, 'deviceCount', 0),
            rule_count: SafeAccess.getNestedValue(boxMeta, 'ruleCount', 0),
            alarm_count: SafeAccess.getNestedValue(boxMeta, 'alarmCount', 0),
            activity_score: SafeAccess.getNestedValue(stat, 'value', 0),
            last_seen: SafeAccess.getNestedValue(boxMeta, 'lastSeen', 0) 
              ? unixToISOString(SafeAccess.getNestedValue(boxMeta, 'lastSeen', 0)) 
              : 'Never',
          };
        }
      ).sort((a: any, b: any) => b.activity_score - a.activity_score);
      
      // Calculate summary with safe operations
      const onlineBoxes = SafeAccess.safeArrayFilter(
        stats.results,
        (s: any) => SafeAccess.getNestedValue(s, 'meta.online', false)
      ).length;
      
      const totalDevices = stats.results.reduce((sum: number, s: any) => 
        sum + SafeAccess.getNestedValue(s, 'meta.deviceCount', 0), 0);
      const totalRules = stats.results.reduce((sum: number, s: any) => 
        sum + SafeAccess.getNestedValue(s, 'meta.ruleCount', 0), 0);
      const totalAlarms = stats.results.reduce((sum: number, s: any) => 
        sum + SafeAccess.getNestedValue(s, 'meta.alarmCount', 0), 0);
      
      return this.createSuccessResponse({
        total_boxes: stats.results.length,
        box_statistics: boxStatistics,
        summary: {
          online_boxes: onlineBoxes,
          total_devices: totalDevices,
          total_rules: totalRules,
          total_alarms: totalAlarms,
        }
      });
      
    } catch (error: unknown) {
      logger.error('Error in get_statistics_by_box', error instanceof Error ? error : new Error(String(error)));
      
      return this.createErrorResponse(`Failed to get box statistics: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        total_boxes: 0,
        box_statistics: [],
        summary: {
          online_boxes: 0,
          total_devices: 0,
          total_rules: 0,
          total_alarms: 0,
        }
      });
    }
  }
}

export class GetFlowTrendsHandler extends BaseToolHandler {
  name = 'get_flow_trends';
  description = 'Get historical flow data trends over time';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const periodValidation = ParameterValidator.validateEnum(_args?.period, 'period', ['1h', '24h', '7d', '30d'], false, '24h');
      const intervalValidation = ParameterValidator.validateNumber(_args?.interval, 'interval', {
        min: 60, max: 86400, defaultValue: 3600, integer: true
      });
      
      const validationResult = ParameterValidator.combineValidationResults([
        periodValidation, intervalValidation
      ]);
      
      if (!validationResult.isValid) {
        return createErrorResponse(this.name, 'Parameter validation failed', {}, validationResult.errors);
      }
      
      const period = periodValidation.sanitizedValue!;
      const interval = intervalValidation.sanitizedValue!;
      
      const trends = await firewalla.getFlowTrends(period, interval);
      
      // Validate trends response structure
      if (!trends || typeof trends !== 'object') {
        throw new Error('Invalid trends response: not an object');
      }
      
      if (!SafeAccess.getNestedValue(trends, 'results') || !Array.isArray(trends.results)) {
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
        trends: SafeAccess.safeArrayMap(
          validTrends,
          (trend: any) => ({
            timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
            timestamp_iso: unixToISOString(SafeAccess.getNestedValue(trend, 'ts', 0)),
            flow_count: SafeAccess.getNestedValue(trend, 'value', 0),
          })
        ),
        summary: {
          total_flows: validTrends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0),
          avg_flows_per_interval: validTrends.length > 0 
            ? Math.round(validTrends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0) / validTrends.length)
            : 0,
          peak_flow_count: validTrends.length > 0 ? 
            Math.max(...validTrends.slice(0, 1000).map((t: any) => SafeAccess.getNestedValue(t, 'value', 0))) : 0,
          min_flow_count: validTrends.length > 0 ? 
            Math.min(...validTrends.slice(0, 1000).map((t: any) => SafeAccess.getNestedValue(t, 'value', 0))) : 0,
        }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to get flow trends: ${errorMessage}`, {
        period: _args?.period || '24h',
        interval_seconds: _args?.interval || 3600,
        troubleshooting: 'Check if Firewalla API is accessible and credentials are valid'
      });
    }
  }
}

export class GetAlarmTrendsHandler extends BaseToolHandler {
  name = 'get_alarm_trends';
  description = 'Get historical alarm data trends over time';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const periodValidation = ParameterValidator.validateEnum(_args?.period, 'period', ['1h', '24h', '7d', '30d'], false, '24h');
      
      if (!periodValidation.isValid) {
        return createErrorResponse(this.name, 'Parameter validation failed', {}, periodValidation.errors);
      }
      
      const period = periodValidation.sanitizedValue!;
      
      const trends = await firewalla.getAlarmTrends(period);
      
      // Defensive programming: validate trends response structure
      if (!trends || !SafeAccess.getNestedValue(trends, 'results') || !Array.isArray(trends.results)) {
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
          error: 'Invalid alarm trends data received'
        });
      }

      // Validate individual trend entries
      const validTrends = SafeAccess.safeArrayFilter(
        trends.results,
        (trend: any) => 
          trend && 
          typeof SafeAccess.getNestedValue(trend, 'ts') === 'number' && 
          typeof SafeAccess.getNestedValue(trend, 'value') === 'number' && 
          SafeAccess.getNestedValue(trend, 'ts', 0) > 0 && 
          SafeAccess.getNestedValue(trend, 'value', 0) >= 0
      );
      
      return this.createSuccessResponse({
        period,
        data_points: validTrends.length,
        trends: SafeAccess.safeArrayMap(
          validTrends,
          (trend: any) => ({
            timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
            timestamp_iso: unixToISOString(SafeAccess.getNestedValue(trend, 'ts', 0)),
            alarm_count: SafeAccess.getNestedValue(trend, 'value', 0),
          })
        ),
        summary: {
          total_alarms: validTrends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0),
          avg_alarms_per_interval: validTrends.length > 0 
            ? Math.round(validTrends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0) / validTrends.length * 100) / 100
            : 0,
          peak_alarm_count: validTrends.length > 0 ? 
            Math.max(...validTrends.slice(0, 1000).map((t: any) => SafeAccess.getNestedValue(t, 'value', 0))) : 0,
          intervals_with_alarms: SafeAccess.safeArrayFilter(validTrends, (t: any) => SafeAccess.getNestedValue(t, 'value', 0) > 0).length,
          alarm_frequency: validTrends.length > 0 
            ? Math.round((SafeAccess.safeArrayFilter(validTrends, (t: any) => SafeAccess.getNestedValue(t, 'value', 0) > 0).length / validTrends.length) * 100)
            : 0,
        }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to get alarm trends: ${errorMessage}`);
    }
  }
}

export class GetRuleTrendsHandler extends BaseToolHandler {
  name = 'get_rule_trends';
  description = 'Get historical rule activity trends over time';
  category = 'analytics' as const;

  async execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
    try {
      // Parameter validation
      const periodValidation = ParameterValidator.validateEnum(_args?.period, 'period', ['1h', '24h', '7d', '30d'], false, '24h');
      
      if (!periodValidation.isValid) {
        return createErrorResponse(this.name, 'Parameter validation failed', {}, periodValidation.errors);
      }
      
      const period = periodValidation.sanitizedValue!;
      
      const trends = await firewalla.getRuleTrends(period);
      
      // Validate trends response structure
      if (!trends || typeof trends !== 'object') {
        throw new Error('Invalid trends response: not an object');
      }
      
      if (!SafeAccess.getNestedValue(trends, 'results') || !Array.isArray(trends.results)) {
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
        trends: SafeAccess.safeArrayMap(
          validTrends,
          (trend: any) => ({
            timestamp: SafeAccess.getNestedValue(trend, 'ts', 0),
            timestamp_iso: unixToISOString(SafeAccess.getNestedValue(trend, 'ts', 0)),
            active_rule_count: SafeAccess.getNestedValue(trend, 'value', 0),
          })
        ),
        summary: {
          avg_active_rules: validTrends.length > 0 
            ? Math.round(validTrends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0) / validTrends.length)
            : 0,
          max_active_rules: validTrends.length > 0 ? Math.max(...validTrends.map((t: any) => SafeAccess.getNestedValue(t, 'value', 0))) : 0,
          min_active_rules: validTrends.length > 0 ? Math.min(...validTrends.map((t: any) => SafeAccess.getNestedValue(t, 'value', 0))) : 0,
          rule_stability: this.calculateRuleStability(validTrends),
        }
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(`Failed to get rule trends: ${errorMessage}`, {
        period: _args?.period || '24h',
        troubleshooting: 'Check if Firewalla API is accessible and firewall rules are available'
      });
    }
  }

  private calculateRuleStability(trends: Array<{ ts: number; value: number }>): number {
    if (trends.length < 2) { return 100; }
    
    let totalVariation = 0;
    for (let i = 1; i < trends.length; i++) {
      const current = trends[i];
      const previous = trends[i-1];
      if (current && previous) {
        const currentValue = SafeAccess.getNestedValue(current, 'value', 0);
        const previousValue = SafeAccess.getNestedValue(previous, 'value', 0);
        if (typeof currentValue === 'number' && typeof previousValue === 'number') {
          const change = Math.abs(currentValue - previousValue);
          totalVariation += change;
        }
      }
    }
    
    const avgValue = trends.reduce((sum: number, t: any) => sum + SafeAccess.getNestedValue(t, 'value', 0), 0) / trends.length;
    if (avgValue === 0 || !isFinite(avgValue)) { return 100; }
    
    // Prevent division by zero when there's only one trend
    if (trends.length <= 1) { return 100; }
    
    const variationPercentage = (totalVariation / (trends.length - 1)) / avgValue;
    
    // Ensure the result is a finite number
    if (!isFinite(variationPercentage)) { return 0; }
    
    return Math.max(0, Math.min(100, Math.round((1 - variationPercentage) * 100)));
  }
}