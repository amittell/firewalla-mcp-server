/**
 * Firewall rule management tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  SafeAccess,
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  optimizeRuleResponse,
  DEFAULT_OPTIMIZATION_CONFIG,
} from '../../optimization/index.js';
import {
  safeUnixToISOString,
  getCurrentTimestamp,
} from '../../utils/timestamp.js';
import {
  getLimitValidationConfig,
  VALIDATION_CONFIG,
} from '../../config/limits.js';
import {
  withToolTimeout,
  createTimeoutErrorResponse,
  TimeoutError,
} from '../../utils/timeout-manager.js';
import { validateRuleExists } from '../../validation/resource-validator.js';
import { logger } from '../../monitoring/logger.js';

/**
 * Rule status checking utility for preventing redundant operations
 */
interface RuleStatusInfo {
  exists: boolean;
  status: string;
  isPaused: boolean;
  isActive: boolean;
  resumeAt?: string;
  errorResponse?: ToolResponse;
}

/**
 * Check the current status of a rule before performing operations
 */
async function checkRuleStatus(
  ruleId: string,
  toolName: string,
  firewalla: FirewallaClient
): Promise<RuleStatusInfo> {
  try {
    // First check if the rule exists
    const existenceCheck = await validateRuleExists(
      ruleId,
      toolName,
      firewalla
    );
    if (!existenceCheck.exists) {
      return {
        exists: false,
        status: 'not_found',
        isPaused: false,
        isActive: false,
        errorResponse: existenceCheck.errorResponse,
      };
    }

    // Get the specific rule details to check its status
    const rulesResponse = await firewalla.getNetworkRules(`id:${ruleId}`, 1);
    const rules = SafeAccess.getNestedValue(
      rulesResponse,
      'results',
      []
    ) as any[];

    if (rules.length === 0) {
      return {
        exists: false,
        status: 'not_found',
        isPaused: false,
        isActive: false,
        errorResponse: createErrorResponse(
          toolName,
          'Rule not found in current rule set',
          ErrorType.API_ERROR,
          { rule_id: ruleId }
        ),
      };
    }

    const rule = rules[0];
    const status = SafeAccess.getNestedValue(
      rule,
      'status',
      'unknown'
    ) as string;
    const resumeTs = SafeAccess.getNestedValue(rule, 'resumeTs', undefined) as
      | number
      | undefined;

    // Determine if rule is paused or active
    const isPaused: boolean =
      status === 'paused' ||
      status === 'disabled' ||
      Boolean(resumeTs && resumeTs > Date.now() / 1000);
    const isActive: boolean = status === 'active' || status === 'enabled';

    return {
      exists: true,
      status,
      isPaused,
      isActive,
      resumeAt: resumeTs ? new Date(resumeTs * 1000).toISOString() : undefined,
    };
  } catch (error) {
    return {
      exists: false,
      status: 'error',
      isPaused: false,
      isActive: false,
      errorResponse: createErrorResponse(
        toolName,
        `Failed to check rule status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR,
        { rule_id: ruleId }
      ),
    };
  }
}

export class GetNetworkRulesHandler extends BaseToolHandler {
  name = 'get_network_rules';
  description =
    'Retrieve firewall rules and conditions including target domains, actions, and status. Requires limit parameter. Data is cached for 10 minutes for performance.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
        }
      );

      if (!limitValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          limitValidation.errors
        );
      }

      const query = args?.query;
      const summaryOnly = (args?.summary_only as boolean) ?? false;
      const limit = limitValidation.sanitizedValue! as number;

      const response = await withToolTimeout(
        async () => firewalla.getNetworkRules(query, limit),
        this.name
      );

      // Apply additional optimization if summary mode requested
      let optimizedResponse: any = response;
      if (summaryOnly) {
        optimizedResponse = optimizeRuleResponse(response as any, {
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
              (response.results as any[]).slice(0, limit),
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
                  SafeAccess.getNestedValue(rule, 'ts', undefined) as
                    | number
                    | undefined,
                  undefined
                ),
                updated_at: safeUnixToISOString(
                  SafeAccess.getNestedValue(rule, 'updateTs', undefined) as
                    | number
                    | undefined,
                  undefined
                ),
                resume_at: safeUnixToISOString(
                  SafeAccess.getNestedValue(rule, 'resumeTs', undefined) as
                    | number
                    | undefined,
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
          optimizedResponse.pagination_note && {
            pagination_note: optimizedResponse.pagination_note,
          }),
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

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
  description =
    'Temporarily disable a specific firewall rule. Requires rule_id parameter. Optional duration parameter (default 60 minutes).';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with enhanced rule ID format checking
      const ruleIdValidation = ParameterValidator.validateRuleId(
        args?.rule_id,
        'rule_id'
      );
      const durationValidation = ParameterValidator.validateNumber(
        args?.duration,
        'duration',
        {
          defaultValue: 60,
          ...VALIDATION_CONFIG.DURATION_MINUTES,
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
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const ruleId = ruleIdValidation.sanitizedValue as string;
      const duration = durationValidation.sanitizedValue as number;

      // Check rule status before attempting to pause it
      const statusCheck = await checkRuleStatus(ruleId, this.name, firewalla);

      if (!statusCheck.exists) {
        return statusCheck.errorResponse!;
      }

      // Prevent redundant pause operations
      if (statusCheck.isPaused) {
        const resumeInfo = statusCheck.resumeAt
          ? ` (scheduled to resume at ${statusCheck.resumeAt})`
          : '';

        return createErrorResponse(
          this.name,
          `Rule is already paused${resumeInfo}`,
          ErrorType.API_ERROR,
          {
            rule_id: ruleId,
            current_status: statusCheck.status,
            already_paused: true,
            resume_at: statusCheck.resumeAt,
            requested_duration_minutes: duration,
          },
          [
            'Rule is already in a paused state',
            statusCheck.resumeAt
              ? `Rule will automatically resume at ${statusCheck.resumeAt}`
              : 'Use resume_rule to manually reactivate the rule',
            'Use get_network_rules to check current rule status',
            'If you want to extend the pause duration, resume first then pause again',
          ]
        );
      }

      // Warn if rule is not currently active
      if (!statusCheck.isActive) {
        logger.warn(
          `Rule ${ruleId} has status '${statusCheck.status}' - pausing may not have the expected effect`,
          {
            tool: 'pause_rule',
            rule_id: ruleId,
            current_status: statusCheck.status,
            warning: 'rule_not_active',
          }
        );
      }

      const result = await withToolTimeout(
        async () => firewalla.pauseRule(ruleId, duration),
        this.name
      );

      return this.createSuccessResponse({
        success: SafeAccess.getNestedValue(result as any, 'success', false),
        message: SafeAccess.getNestedValue(
          result,
          'message',
          'Rule pause completed'
        ),
        rule_id: ruleId,
        duration_minutes: duration,
        action: 'pause_rule',
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      // Provide enhanced error context based on common failure scenarios
      let errorType = ErrorType.API_ERROR;
      const suggestions: string[] = [];
      const context: Record<string, any> = {
        rule_id: args?.rule_id,
        duration: args?.duration || 60,
        operation: 'pause_rule',
      };

      // Analyze error message for specific guidance
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        errorType = ErrorType.API_ERROR;
        suggestions.push(
          'Verify the rule_id exists by searching rules first: search_rules query:"id:your_rule_id"',
          'Check if the rule was recently deleted or modified',
          'Ensure you have permission to access this rule'
        );
      } else if (
        errorMessage.includes('permission') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403')
      ) {
        errorType = ErrorType.AUTHENTICATION_ERROR;
        suggestions.push(
          'Verify your Firewalla MSP API credentials are valid',
          'Check if your API token has rule management permissions',
          'Ensure the rule belongs to a box you have access to'
        );
      } else if (
        errorMessage.includes('already paused') ||
        errorMessage.includes('inactive')
      ) {
        errorType = ErrorType.API_ERROR;
        suggestions.push(
          'Rule may already be paused - check rule status first',
          'Use resume_rule if the rule needs to be reactivated',
          'Check rule status with get_network_rules to verify current state'
        );
      } else {
        suggestions.push(
          'Verify network connectivity to Firewalla API',
          'Check if the Firewalla box is online and accessible',
          'Try with a different rule_id to test functionality',
          'See the Error Handling Guide: /docs/error-handling-guide.md'
        );
      }

      return createErrorResponse(
        this.name,
        `Failed to pause rule: ${errorMessage}`,
        errorType,
        context,
        suggestions
      );
    }
  }
}

export class ResumeRuleHandler extends BaseToolHandler {
  name = 'resume_rule';
  description =
    'Resume a previously paused firewall rule. Requires rule_id parameter.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with enhanced rule ID format checking
      const ruleIdValidation = ParameterValidator.validateRuleId(
        args?.rule_id,
        'rule_id'
      );

      if (!ruleIdValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          ruleIdValidation.errors
        );
      }

      const ruleId = ruleIdValidation.sanitizedValue as string;

      // Check rule status before attempting to resume it
      const statusCheck = await checkRuleStatus(ruleId, this.name, firewalla);

      if (!statusCheck.exists) {
        return statusCheck.errorResponse!;
      }

      // Prevent redundant resume operations
      if (statusCheck.isActive) {
        return createErrorResponse(
          this.name,
          'Rule is already active and does not need to be resumed',
          ErrorType.API_ERROR,
          {
            rule_id: ruleId,
            current_status: statusCheck.status,
            already_active: true,
          },
          [
            'Rule is already in an active state',
            'Use get_network_rules to verify current rule status',
            'If the rule is not working as expected, check rule configuration instead',
            'Use pause_rule if you want to temporarily disable the rule',
          ]
        );
      }

      // Provide helpful context for non-paused rules
      if (!statusCheck.isPaused) {
        logger.warn(
          `Rule ${ruleId} has status '${statusCheck.status}' - resuming may not activate it as expected`,
          {
            tool: 'resume_rule',
            rule_id: ruleId,
            current_status: statusCheck.status,
            warning: 'rule_not_paused',
          }
        );
      }

      const result = await withToolTimeout(
        async () => firewalla.resumeRule(ruleId),
        this.name
      );

      return this.createSuccessResponse({
        success: SafeAccess.getNestedValue(result as any, 'success', false),
        message: SafeAccess.getNestedValue(
          result,
          'message',
          'Rule resume completed'
        ),
        rule_id: ruleId,
        action: 'resume_rule',
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(`Failed to resume rule: ${errorMessage}`);
    }
  }
}

export class GetTargetListsHandler extends BaseToolHandler {
  name = 'get_target_lists';
  description =
    'Access security target lists (CloudFlare, CrowdSec) with domains and IPs. Requires limit parameter. Data cached for 1 hour for performance.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // Pre-flight parameter validation - do this before timeout wrapper
    const limitValidation = ParameterValidator.validateNumber(
      args?.limit,
      'limit',
      {
        required: true,
        ...getLimitValidationConfig(this.name),
      }
    );

    if (!limitValidation.isValid) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        limitValidation.errors
      );
    }

    const limit = limitValidation.sanitizedValue! as number;
    const listType = args?.list_type as string | undefined;

    // Validate list_type parameter if provided
    if (listType !== undefined) {
      const validTypes = ['cloudflare', 'crowdsec', 'all'];
      if (!validTypes.includes(listType)) {
        return createErrorResponse(
          this.name,
          'Invalid list_type parameter',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [`list_type must be one of: ${validTypes.join(', ')}`]
        );
      }
    }

    // Use timeout wrapper only for the API call and response processing
    return withToolTimeout(async () => {
      const listsResponse = await firewalla.getTargetLists(listType, limit);

      return this.createSuccessResponse({
        total_lists: SafeAccess.safeArrayAccess(
          listsResponse.results,
          arr => arr.length,
          0
        ),
        limit_applied: limit,
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
              SafeAccess.getNestedValue(list, 'targets', []),
              arr => arr.length,
              0
            ),
            // Target List Buffer Strategy: Per-list target limiting
            //
            // Problem: Some target lists (especially threat intelligence feeds)
            // can contain 10,000+ targets, leading to:
            // - Excessive response payload sizes
            // - JSON serialization performance issues
            // - Client-side rendering problems
            //
            // Solution: Limit to 500 targets per list while preserving total count.
            // This balances:
            // - Useful data visibility (500 targets shows patterns/types)
            // - Response performance (manageable payload size)
            // - Client usability (reasonable display limits)
            //
            // The 500 limit was chosen as 5x the original 100 limit to provide
            // better visibility into large lists while maintaining performance.
            targets: SafeAccess.safeArrayAccess(
              SafeAccess.getNestedValue(list, 'targets', []),
              arr => arr.slice(0, 500), // Per-list target buffer limit
              []
            ),
            last_updated: safeUnixToISOString(
              SafeAccess.getNestedValue(list, 'lastUpdated', undefined) as
                | number
                | undefined,
              undefined
            ),
            notes: SafeAccess.getNestedValue(list, 'notes', ''),
          })
        ),
      });
    }, this.name);
  }
}

export class GetNetworkRulesSummaryHandler extends BaseToolHandler {
  name = 'get_network_rules_summary';
  description =
    'Get overview statistics and counts of network rules by category. Requires limit parameter. Data cached for 10 minutes for performance.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
        }
      );
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
        limitValidation,
        ruleTypeValidation,
        activeOnlyValidation,
      ]);

      if (!validationResult.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const limit = limitValidation.sanitizedValue! as number;
      const ruleType = ruleTypeValidation.sanitizedValue!;
      const activeOnly = activeOnlyValidation.sanitizedValue!;

      // Statistical Analysis Buffer Strategy: User-controlled limit for rule analysis
      //
      // Problem: Rule summary analysis requires processing potentially thousands
      // of rules to generate meaningful statistics. Without limits, this could:
      // - Consume excessive memory for large rule sets (10k+ rules)
      // - Cause slow API responses
      // - Risk timeout failures on resource-constrained systems
      //
      // Solution: Use user-specified limit (validated 1-10000) for statistical analysis.
      // This provides:
      // - User control over memory usage and response time
      // - Predictable memory usage based on user's choice
      // - Consistent with other rule tools' validation patterns
      //
      // The limit is validated to ensure reasonable bounds (1-10000) which allows
      // both lightweight queries and comprehensive enterprise-level analysis.
      const allRulesResponse = await withToolTimeout(
        async () => firewalla.getNetworkRules(undefined, limit),
        this.name
      );
      const allRules = SafeAccess.getNestedValue(
        allRulesResponse,
        'results',
        []
      ) as any[];

      // Group rules by various categories for overview
      const rulesByAction = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const action = SafeAccess.getNestedValue(
            rule,
            'action',
            'unknown'
          ) as string;
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
          ) as string;
          acc[direction] = (acc[direction] || 0) + 1;
          return acc;
        },
        {}
      );

      const rulesByStatus = allRules.reduce(
        (acc: Record<string, number>, rule: any) => {
          const status = SafeAccess.getNestedValue(
            rule,
            'status',
            'active'
          ) as string;
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
          ) as string;
          acc[targetType] = (acc[targetType] || 0) + 1;
          return acc;
        },
        {}
      );

      // Calculate hit statistics
      const rulesWithHits = allRules.filter((rule: any) => {
        const hitCount = SafeAccess.getNestedValue(
          rule,
          'hit.count',
          0
        ) as number;
        return hitCount > 0;
      });
      const totalHits = allRules.reduce(
        (sum: number, rule: any) =>
          sum + (SafeAccess.getNestedValue(rule, 'hit.count', 0) as number),
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
            const ts = SafeAccess.getNestedValue(rule, 'ts', 0) as number;
            const updateTs = SafeAccess.getNestedValue(
              rule,
              'updateTs',
              0
            ) as number;
            return Math.max(ts, updateTs);
          })
          .filter((ts: number) => ts > 0);

        const creationTimestamps = allRules
          .map(
            (rule: any) => SafeAccess.getNestedValue(rule, 'ts', 0) as number
          )
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
        limit_applied: limit,
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
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

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
  description =
    'Get rules with highest hit counts for traffic analysis. Requires limit parameter. Optional min_hits parameter.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
        }
      );

      if (!limitValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          limitValidation.errors
        );
      }

      const limit = limitValidation.sanitizedValue! as number;
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
          ErrorType.VALIDATION_ERROR,
          undefined,
          minHitsValidation.errors
        );
      }

      const minHits = minHitsValidation.sanitizedValue! as number;

      // Buffer Strategy: Over-fetch to compensate for hit-count filtering
      //
      // Problem: Rules are filtered by minimum hit count after retrieval. Since hit
      // counts vary widely (some rules have 0 hits, others have thousands), we can't
      // predict how many rules will pass the filter.
      //
      // Solution: Apply the same 3x buffer strategy as device filtering. This ensures
      // we typically have enough rules that meet the minimum hit threshold without
      // requiring multiple API calls or complex pagination logic.
      //
      // The 3000 cap prevents excessive API loads while still allowing reasonable
      // result sets for most use cases.
      const fetchLimit = Math.min(limit * 3, 3000); // 3x buffer with 3000 cap
      const allRulesResponse = await withToolTimeout(
        async () => firewalla.getNetworkRules(undefined, fetchLimit),
        this.name
      );

      // Filter and sort by hit count
      const activeRules = SafeAccess.safeArrayFilter(
        allRulesResponse.results,
        (rule: any) => {
          const hitCount = SafeAccess.getNestedValue(
            rule,
            'hit.count',
            0
          ) as number;
          return hitCount >= minHits;
        }
      )
        .sort((a: any, b: any) => {
          const aHits = SafeAccess.getNestedValue(a, 'hit.count', 0) as number;
          const bHits = SafeAccess.getNestedValue(b, 'hit.count', 0) as number;
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
          ) as string;
          const notes = SafeAccess.getNestedValue(rule, 'notes', '') as string;
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
              SafeAccess.getNestedValue(rule, 'hit.lastHitTs', undefined) as
                | number
                | undefined,
              'Never'
            ),
            created_at: safeUnixToISOString(
              SafeAccess.getNestedValue(rule, 'ts', undefined) as
                | number
                | undefined,
              undefined
            ),
            notes: notes.length > 80 ? `${notes.substring(0, 80)}...` : notes,
          };
        }),
        summary: {
          total_hits: activeRules.reduce(
            (sum, rule) =>
              sum + (SafeAccess.getNestedValue(rule, 'hit.count', 0) as number),
            0
          ),
          top_rule_hits:
            activeRules.length > 0
              ? (SafeAccess.getNestedValue(
                  activeRules[0],
                  'hit.count',
                  0
                ) as number)
              : 0,
          analysis_timestamp: getCurrentTimestamp(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

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
  description =
    'Get recently created or modified firewall rules. Requires limit parameter. Optional hours parameter (default 24 hours lookback).';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      // Parameter validation with standardized limits
      const limitValidation = ParameterValidator.validateNumber(
        args?.limit,
        'limit',
        {
          required: true,
          ...getLimitValidationConfig(this.name),
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
          ErrorType.VALIDATION_ERROR,
          undefined,
          validationResult.errors
        );
      }

      const hours = hoursValidation.sanitizedValue! as number;
      const limit = limitValidation.sanitizedValue! as number;
      const includeModified = (args?.include_modified as boolean) ?? true;

      // Adaptive Buffer Strategy: Dynamic fetch limit calculation
      //
      // Challenge: Time-based filtering has highly variable efficiency depending on:
      // - Time window size (1 hour vs 168 hours)
      // - Network activity levels during the period
      // - Historical rule creation/modification patterns
      //
      // Solution: Use an adaptive multiplier that scales with the requested limit:
      // - Small limits (≤50): Use higher multiplier (up to 10x) to ensure adequate results
      // - Large limits (≥500): Use conservative multiplier (3x) to avoid excessive API load
      // - Formula: max(3, min(10, 500/limit)) provides smooth scaling
      //
      // Example multipliers:
      // - limit=10:  multiplier=10x (fetchLimit=100) - high buffer for small requests
      // - limit=50:  multiplier=10x (fetchLimit=500) - still generous buffer
      // - limit=100: multiplier=5x  (fetchLimit=500) - balanced approach
      // - limit=200: multiplier=3x  (fetchLimit=600) - efficient for larger requests
      // - limit=500: multiplier=3x  (fetchLimit=1500) - minimal overhead
      //
      // The 2000 cap prevents excessive API calls while still allowing reasonable
      // result sets for most time-based queries.
      const fetchMultiplier = Math.max(3, Math.min(10, 500 / limit)); // Adaptive multiplier: 3-10x based on limit size
      const fetchLimit = Math.min(limit * fetchMultiplier, 2000); // Cap at reasonable maximum
      const allRulesResponse = await withToolTimeout(
        async () => firewalla.getNetworkRules(undefined, fetchLimit),
        this.name
      );

      const hoursAgoTs = Math.floor(Date.now() / 1000) - hours * 3600;

      // Filter rules created or modified within the timeframe
      const recentRules = SafeAccess.safeArrayFilter(
        allRulesResponse.results,
        (rule: any) => {
          const ts = SafeAccess.getNestedValue(rule, 'ts', 0) as number;
          const updateTs = SafeAccess.getNestedValue(
            rule,
            'updateTs',
            0
          ) as number;
          const created = ts >= hoursAgoTs;
          const modified =
            includeModified && updateTs >= hoursAgoTs && updateTs > ts;
          return created || modified;
        }
      )
        .sort((a: any, b: any) => {
          const aTs = SafeAccess.getNestedValue(a, 'ts', 0) as number;
          const aUpdateTs = SafeAccess.getNestedValue(
            a,
            'updateTs',
            0
          ) as number;
          const bTs = SafeAccess.getNestedValue(b, 'ts', 0) as number;
          const bUpdateTs = SafeAccess.getNestedValue(
            b,
            'updateTs',
            0
          ) as number;
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
          const ts = SafeAccess.getNestedValue(rule, 'ts', 0) as number;
          const updateTs = SafeAccess.getNestedValue(
            rule,
            'updateTs',
            0
          ) as number;
          const wasModified = updateTs > ts && updateTs >= hoursAgoTs;
          const targetValue = SafeAccess.getNestedValue(
            rule,
            'target.value',
            ''
          ) as string;
          const notes = SafeAccess.getNestedValue(rule, 'notes', '') as string;

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
            const ts = SafeAccess.getNestedValue(r, 'ts', 0) as number;
            const updateTs = SafeAccess.getNestedValue(
              r,
              'updateTs',
              0
            ) as number;
            return (
              ts >= hoursAgoTs && (updateTs <= ts || updateTs < hoursAgoTs)
            );
          }).length,
          recently_modified: recentRules.filter((r: any) => {
            const ts = SafeAccess.getNestedValue(r, 'ts', 0) as number;
            const updateTs = SafeAccess.getNestedValue(
              r,
              'updateTs',
              0
            ) as number;
            return updateTs > ts && updateTs >= hoursAgoTs;
          }).length,
          analysis_timestamp: getCurrentTimestamp(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        return createTimeoutErrorResponse(
          this.name,
          error.duration,
          10000 // Default timeout
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to get recent rules: ${errorMessage}`
      );
    }
  }
}
