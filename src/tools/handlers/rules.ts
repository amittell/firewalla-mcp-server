/**
 * Firewall rule management tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  createErrorResponse,
} from '../../validation/error-handler.js';
import {
  optimizeRuleResponse,
  DEFAULT_OPTIMIZATION_CONFIG,
} from '../../optimization/index.js';
import {
  safeUnixToISOString,
  getCurrentTimestamp,
} from '../../utils/timestamp.js';

export class GetNetworkRulesHandler extends BaseToolHandler {
  name = 'get_network_rules';
  description = 'Retrieve firewall rules and conditions';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 1000,
          integer: true,
        }
      );

      if (!limitValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          {},
          limitValidation.errors
        );
      }

      const query = args?.query as string | undefined;
      const summaryOnly = (args?.summary_only as boolean) ?? false;
      const limit = limitValidation.sanitizedValue!;

      const response = await firewalla.getNetworkRules(query, limit);

      // Apply additional optimization if summary mode requested
      let optimizedResponse = response;
      if (summaryOnly) {
        optimizedResponse = optimizeRuleResponse(response, {
          ...DEFAULT_OPTIMIZATION_CONFIG,
          summaryMode: {
            maxItems: limit,
            includeFields: [
              'id',
              'action',
              'target',
              'direction',
              'status',
              'hit',
            ],
            excludeFields: ['notes', 'schedule', 'timeUsage', 'scope'],
          },
        });
      }

      return this.createSuccessResponse({
        count: SafeAccess.getNestedValue(optimizedResponse, 'count', 0),
        summary_mode: summaryOnly,
        limit_applied: summaryOnly ? limit : undefined,
        rules: summaryOnly
          ? optimizedResponse.results
          : SafeAccess.safeArrayMap(
              response.results.slice(0, limit),
              (rule: any) => ({
                id: SafeAccess.getNestedValue(rule, 'id', 'unknown'),
                action: SafeAccess.getNestedValue(rule, 'action', 'unknown'),
                target: rule.target
                  ? {
                      type: SafeAccess.getNestedValue(
                        rule.target,
                        'type',
                        'unknown'
                      ),
                      value: SafeAccess.getNestedValue(
                        rule.target,
                        'value',
                        'unknown'
                      ),
                      ...(rule.target?.dnsOnly && {
                        dnsOnly: rule.target.dnsOnly,
                      }),
                      ...(rule.target?.port && { port: rule.target.port }),
                    }
                  : { type: 'unknown', value: 'unknown' },
                direction: SafeAccess.getNestedValue(
                  rule,
                  'direction',
                  'unknown'
                ),
                gid: SafeAccess.getNestedValue(rule, 'gid', 'unknown'),
                group: SafeAccess.getNestedValue(rule, 'group', undefined),
                scope: SafeAccess.getNestedValue(rule, 'scope', undefined),
                notes: SafeAccess.getNestedValue(rule, 'notes', ''),
                status: SafeAccess.getNestedValue(rule, 'status', 'unknown'),
                hit: SafeAccess.getNestedValue(rule, 'hit', undefined),
                schedule: SafeAccess.getNestedValue(
                  rule,
                  'schedule',
                  undefined
                ),
                timeUsage: SafeAccess.getNestedValue(
                  rule,
                  'timeUsage',
                  undefined
                ),
                protocol: SafeAccess.getNestedValue(
                  rule,
                  'protocol',
                  undefined
                ),
                created_at: safeUnixToISOString(
                  SafeAccess.getNestedValue(rule, 'ts', undefined),
                  undefined
                ),
                updated_at: safeUnixToISOString(
                  SafeAccess.getNestedValue(rule, 'updateTs', undefined),
                  undefined
                ),
                resume_at: safeUnixToISOString(
                  SafeAccess.getNestedValue(rule, 'resumeTs', undefined),
                  undefined
                ),
              })
            ),
        next_cursor: SafeAccess.getNestedValue(
          summaryOnly ? optimizedResponse : response,
          'next_cursor',
          undefined
        ),
        ...(summaryOnly &&
          (optimizedResponse as any).pagination_note && {
            pagination_note: (optimizedResponse as any).pagination_note,
          }),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get network rules: ${errorMessage}`
      );
    }
  }
}

export class PauseRuleHandler extends BaseToolHandler {
  name = 'pause_rule';
  description = 'Temporarily disable a specific firewall rule';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const ruleIdValidation = ParameterValidator.validateRequiredString(
        args?.rule_id,
        'rule_id'
      );
      const durationValidation = ParameterValidator.validateNumber(
        args?.duration,
        'duration',
        {
          min: 1,
          max: 1440,
          defaultValue: 60,
          integer: true,
        }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        ruleIdValidation,
        durationValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          undefined,
          validationResult.errors
        );
      }

      const result = await firewalla.pauseRule(
        ruleIdValidation.sanitizedValue,
        durationValidation.sanitizedValue
      );

      return this.createSuccessResponse({
        success: SafeAccess.getNestedValue(result, 'success', false),
        message: SafeAccess.getNestedValue(
          result,
          'message',
          'Rule pause completed'
        ),
        rule_id: ruleIdValidation.sanitizedValue,
        duration_minutes: durationValidation.sanitizedValue,
        action: 'pause_rule',
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to pause rule: ${errorMessage}`);
    }
  }
}

export class ResumeRuleHandler extends BaseToolHandler {
  name = 'resume_rule';
  description = 'Resume a previously paused firewall rule';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const ruleIdValidation = ParameterValidator.validateRequiredString(
        args?.rule_id,
        'rule_id'
      );

      if (!ruleIdValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          undefined,
          ruleIdValidation.errors
        );
      }

      const result = await firewalla.resumeRule(
        ruleIdValidation.sanitizedValue
      );

      return this.createSuccessResponse({
        success: SafeAccess.getNestedValue(result, 'success', false),
        message: SafeAccess.getNestedValue(
          result,
          'message',
          'Rule resume completed'
        ),
        rule_id: ruleIdValidation.sanitizedValue,
        action: 'resume_rule',
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to resume rule: ${errorMessage}`);
    }
  }
}

export class GetTargetListsHandler extends BaseToolHandler {
  name = 'get_target_lists';
  description = 'Access security target lists (CloudFlare, CrowdSec)';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const listType = args?.list_type as string | undefined;

      // Validate list_type parameter if provided
      if (listType !== undefined) {
        const validTypes = ['cloudflare', 'crowdsec', 'all'];
        if (!validTypes.includes(listType)) {
          return createErrorResponse(
            this.name,
            'Invalid list_type parameter',
            undefined,
            [`list_type must be one of: ${validTypes.join(', ')}`]
          );
        }
      }

      const listsResponse = await firewalla.getTargetLists(listType);

      return this.createSuccessResponse({
        total_lists: SafeAccess.safeArrayAccess(
          listsResponse.results,
          arr => arr.length,
          0
        ),
        categories: Array.from(
          new Set(
            SafeAccess.safeArrayMap(listsResponse.results, (l: any) =>
              SafeAccess.getNestedValue(l, 'category', undefined)
            ).filter(Boolean)
          )
        ),
        target_lists: SafeAccess.safeArrayMap(
          listsResponse.results,
          (list: any) => ({
            id: SafeAccess.getNestedValue(list, 'id', 'unknown'),
            name: SafeAccess.getNestedValue(list, 'name', 'Unknown List'),
            owner: SafeAccess.getNestedValue(list, 'owner', 'unknown'),
            category: SafeAccess.getNestedValue(list, 'category', 'unknown'),
            entry_count: SafeAccess.safeArrayAccess(
              list.targets,
              arr => arr.length,
              0
            ),
            targets: SafeAccess.safeArrayAccess(
              list.targets,
              arr => arr.slice(0, 500),
              []
            ), // Increased from 100 to 500 targets per list
            last_updated: safeUnixToISOString(
              SafeAccess.getNestedValue(list, 'lastUpdated', undefined),
              undefined
            ),
            notes: SafeAccess.getNestedValue(list, 'notes', ''),
          })
        ),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get target lists: ${errorMessage}`
      );
    }
  }
}

export class GetNetworkRulesSummaryHandler extends BaseToolHandler {
  name = 'get_network_rules_summary';
  description =
    'Get overview statistics and counts of network rules by category';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const ruleTypeValidation = ParameterValidator.validateEnum(
        args?.rule_type,
        'rule_type',
        ['block', 'allow', 'timelimit', 'all'],
        false,
        'all'
      );
      const activeOnlyValidation = ParameterValidator.validateBoolean(
        args?.active_only,
        'active_only',
        true
      );

      const validationResult = ParameterValidator.combineValidationResults([
        ruleTypeValidation,
        activeOnlyValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          {},
          validationResult.errors
        );
      }

      const ruleType = ruleTypeValidation.sanitizedValue!;
      const activeOnly = activeOnlyValidation.sanitizedValue!;

      // Add reasonable limit to prevent memory issues with large rule sets
      // Summary analysis doesn't need all rules, 5000 should be sufficient for statistics
      const analysisLimit = 5000;
      const allRulesResponse = await firewalla.getNetworkRules(
        undefined,
        analysisLimit
      );
      const allRules = SafeAccess.getNestedValue(
        allRulesResponse,
        'results',
        []
      );

      // Group rules by various categories for overview
      const rulesByAction = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const action = SafeAccess.getNestedValue(rule, 'action', 'unknown');
          acc[action] = (acc[action] || 0) + 1;
          return acc;
        },
        {}
      );

      const rulesByDirection = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const direction = SafeAccess.getNestedValue(
            rule,
            'direction',
            'unknown'
          );
          acc[direction] = (acc[direction] || 0) + 1;
          return acc;
        },
        {}
      );

      const rulesByStatus = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const status = SafeAccess.getNestedValue(rule, 'status', 'active');
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        {}
      );

      const rulesByTargetType = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const targetType = SafeAccess.getNestedValue(
            rule,
            'target.type',
            'unknown'
          );
          acc[targetType] = (acc[targetType] || 0) + 1;
          return acc;
        },
        {}
      );

      // Calculate hit statistics
      const rulesWithHits = allRules.filter((rule: any) => {
        const hitCount = SafeAccess.getNestedValue(rule, 'hit.count', 0);
        return hitCount > 0;
      });
      const totalHits = allRules.reduce(
        (sum: number, rule: any) =>
          sum + SafeAccess.getNestedValue(rule, 'hit.count', 0),
        0
      );
      const avgHitsPerRule =
        allRules.length > 0
          ? Math.round((totalHits / allRules.length) * 100) / 100
          : 0;

      // Find most recent rule activity
      let mostRecentRuleTs: number | undefined = undefined;
      let oldestRuleTs: number | undefined = undefined;

      if (allRules.length > 0) {
        const validTimestamps = allRules
          .map((rule: any) => {
            const ts = SafeAccess.getNestedValue(rule, 'ts', 0);
            const updateTs = SafeAccess.getNestedValue(rule, 'updateTs', 0);
            return Math.max(ts, updateTs);
          })
          .filter((ts: number) => ts > 0);

        const creationTimestamps = allRules
          .map((rule: any) => SafeAccess.getNestedValue(rule, 'ts', 0))
          .filter((ts: number) => ts > 0);

        if (validTimestamps.length > 0) {
          mostRecentRuleTs = Math.max(...validTimestamps);
        }

        if (creationTimestamps.length > 0) {
          oldestRuleTs = Math.min(...creationTimestamps);
        }
      }

      return this.createSuccessResponse({
        total_rules: allRules.length,
        summary_timestamp: getCurrentTimestamp(),
        breakdown: {
          by_action: rulesByAction,
          by_direction: rulesByDirection,
          by_status: rulesByStatus,
          by_target_type: rulesByTargetType,
        },
        hit_statistics: {
          total_hits: totalHits,
          rules_with_hits: rulesWithHits.length,
          rules_with_no_hits: allRules.length - rulesWithHits.length,
          average_hits_per_rule: avgHitsPerRule,
          hit_rate_percentage:
            allRules.length > 0
              ? Math.round((rulesWithHits.length / allRules.length) * 100)
              : 0,
        },
        age_statistics: {
          most_recent_activity: safeUnixToISOString(
            mostRecentRuleTs,
            undefined
          ),
          oldest_rule_created: safeUnixToISOString(oldestRuleTs, undefined),
          has_timestamp_data:
            mostRecentRuleTs !== undefined || oldestRuleTs !== undefined,
        },
        filters_applied: {
          rule_type: ruleType || 'all',
          active_only: activeOnly,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get network rules summary: ${errorMessage}`
      );
    }
  }
}

export class GetMostActiveRulesHandler extends BaseToolHandler {
  name = 'get_most_active_rules';
  description = 'Get rules with highest hit counts for traffic analysis';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 1000,
          integer: true,
        }
      );

      if (!limitValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          {},
          limitValidation.errors
        );
      }

      const limit = limitValidation.sanitizedValue!;
      const minHitsValidation = ParameterValidator.validateNumber(
        args?.min_hits,
        'min_hits',
        {
          min: 0,
          max: 1000000,
          defaultValue: 1,
          integer: true,
        }
      );

      if (!minHitsValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          {},
          minHitsValidation.errors
        );
      }

      const minHits = minHitsValidation.sanitizedValue!;

      // Fetch rules with a reasonable buffer to account for filtering by minHits
      // Use 3x the limit to ensure we have enough rules after filtering
      const fetchLimit = Math.min(limit * 3, 3000);
      const allRulesResponse = await firewalla.getNetworkRules(
        undefined,
        fetchLimit
      );

      // Filter and sort by hit count
      const activeRules = SafeAccess.safeArrayFilter(
        allRulesResponse.results,
        (rule: any) => {
          const hitCount = SafeAccess.getNestedValue(rule, 'hit.count', 0);
          return hitCount >= minHits;
        }
      )
        .sort((a: any, b: any) => {
          const aHits = SafeAccess.getNestedValue(a, 'hit.count', 0);
          const bHits = SafeAccess.getNestedValue(b, 'hit.count', 0);
          return bHits - aHits;
        })
        .slice(0, limit);

      return this.createSuccessResponse({
        total_rules_analyzed: SafeAccess.safeArrayAccess(
          allRulesResponse.results,
          arr => arr.length,
          0
        ),
        rules_meeting_criteria: activeRules.length,
        min_hits_threshold: minHits,
        limit_applied: limit,
        rules: SafeAccess.safeArrayMap(activeRules, (rule: any) => {
          const targetValue = SafeAccess.getNestedValue(
            rule,
            'target.value',
            ''
          );
          const notes = SafeAccess.getNestedValue(rule, 'notes', '');
          return {
            id: SafeAccess.getNestedValue(rule, 'id', 'unknown'),
            action: SafeAccess.getNestedValue(rule, 'action', 'unknown'),
            target_type: SafeAccess.getNestedValue(
              rule,
              'target.type',
              'unknown'
            ),
            target_value:
              targetValue.length > 60
                ? `${targetValue.substring(0, 60)}...`
                : targetValue,
            direction: SafeAccess.getNestedValue(rule, 'direction', 'unknown'),
            hit_count: SafeAccess.getNestedValue(rule, 'hit.count', 0),
            last_hit: safeUnixToISOString(
              SafeAccess.getNestedValue(rule, 'hit.lastHitTs', undefined),
              'Never'
            ),
            created_at: safeUnixToISOString(
              SafeAccess.getNestedValue(rule, 'ts', undefined),
              undefined
            ),
            notes: notes.length > 80 ? `${notes.substring(0, 80)}...` : notes,
          };
        }),
        summary: {
          total_hits: activeRules.reduce(
            (sum, rule) =>
              sum + SafeAccess.getNestedValue(rule, 'hit.count', 0),
            0
          ),
          top_rule_hits:
            activeRules.length > 0
              ? SafeAccess.getNestedValue(activeRules[0], 'hit.count', 0)
              : 0,
          analysis_timestamp: getCurrentTimestamp(),
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get most active rules: ${errorMessage}`
      );
    }
  }
}

export class GetRecentRulesHandler extends BaseToolHandler {
  name = 'get_recent_rules';
  description = 'Get recently created or modified firewall rules';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          min: 1,
          max: 1000,
          integer: true,
        }
      );
      const hoursValidation = ParameterValidator.validateNumber(
        args?.hours,
        'hours',
        {
          min: 1,
          max: 168,
          defaultValue: 24,
          integer: true,
        }
      );

      const validationResult = ParameterValidator.combineValidationResults([
        limitValidation,
        hoursValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          {},
          validationResult.errors
        );
      }

      const hours = hoursValidation.sanitizedValue!;
      const limit = limitValidation.sanitizedValue!;
      const includeModified = (args?.include_modified as boolean) ?? true;

      // Dynamic fetch limit calculation based on expected filtering efficiency
      const fetchMultiplier = Math.max(3, Math.min(10, 500 / limit)); // Adaptive multiplier: 3-10x based on limit size
      const fetchLimit = Math.min(limit * fetchMultiplier, 2000); // Cap at reasonable maximum
      const allRulesResponse = await firewalla.getNetworkRules(
        undefined,
        fetchLimit
      );

      const hoursAgoTs = Math.floor(Date.now() / 1000) - hours * 3600;

      // Filter rules created or modified within the timeframe
      const recentRules = SafeAccess.safeArrayFilter(
        allRulesResponse.results,
        (rule: any) => {
          const ts = SafeAccess.getNestedValue(rule, 'ts', 0);
          const updateTs = SafeAccess.getNestedValue(rule, 'updateTs', 0);
          const created = ts >= hoursAgoTs;
          const modified =
            includeModified && updateTs >= hoursAgoTs && updateTs > ts;
          return created || modified;
        }
      )
        .sort((a: any, b: any) => {
          const aTs = SafeAccess.getNestedValue(a, 'ts', 0);
          const aUpdateTs = SafeAccess.getNestedValue(a, 'updateTs', 0);
          const bTs = SafeAccess.getNestedValue(b, 'ts', 0);
          const bUpdateTs = SafeAccess.getNestedValue(b, 'updateTs', 0);
          return Math.max(bTs, bUpdateTs) - Math.max(aTs, aUpdateTs);
        }) // Sort by most recent activity
        .slice(0, limit);

      return this.createSuccessResponse({
        total_rules_analyzed: SafeAccess.safeArrayAccess(
          allRulesResponse.results,
          arr => arr.length,
          0
        ),
        recent_rules_found: recentRules.length,
        lookback_hours: hours,
        include_modified: includeModified,
        cutoff_time: safeUnixToISOString(hoursAgoTs, undefined),
        rules: SafeAccess.safeArrayMap(recentRules, (rule: any) => {
          const ts = SafeAccess.getNestedValue(rule, 'ts', 0);
          const updateTs = SafeAccess.getNestedValue(rule, 'updateTs', 0);
          const wasModified = updateTs > ts && updateTs >= hoursAgoTs;
          const targetValue = SafeAccess.getNestedValue(
            rule,
            'target.value',
            ''
          );
          const notes = SafeAccess.getNestedValue(rule, 'notes', '');

          return {
            id: SafeAccess.getNestedValue(rule, 'id', 'unknown'),
            action: SafeAccess.getNestedValue(rule, 'action', 'unknown'),
            target_type: SafeAccess.getNestedValue(
              rule,
              'target.type',
              'unknown'
            ),
            target_value:
              targetValue.length > 60
                ? `${targetValue.substring(0, 60)}...`
                : targetValue,
            direction: SafeAccess.getNestedValue(rule, 'direction', 'unknown'),
            status: SafeAccess.getNestedValue(rule, 'status', 'active'),
            activity_type: wasModified ? 'modified' : 'created',
            created_at: safeUnixToISOString(ts, undefined),
            updated_at: safeUnixToISOString(updateTs, undefined),
            hit_count: SafeAccess.getNestedValue(rule, 'hit.count', 0),
            notes: notes.length > 80 ? `${notes.substring(0, 80)}...` : notes,
          };
        }),
        summary: {
          newly_created: recentRules.filter((r: any) => {
            const ts = SafeAccess.getNestedValue(r, 'ts', 0);
            const updateTs = SafeAccess.getNestedValue(r, 'updateTs', 0);
            return (
              ts >= hoursAgoTs && (updateTs <= ts || updateTs < hoursAgoTs)
            );
          }).length,
          recently_modified: recentRules.filter((r: any) => {
            const ts = SafeAccess.getNestedValue(r, 'ts', 0);
            const updateTs = SafeAccess.getNestedValue(r, 'updateTs', 0);
            return updateTs > ts && updateTs >= hoursAgoTs;
          }).length,
          analysis_timestamp: getCurrentTimestamp(),
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get recent rules: ${errorMessage}`
      );
    }
  }
}
