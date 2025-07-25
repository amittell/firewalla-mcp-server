/**
 * Bulk rule management tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  createErrorResponse,
  ErrorType,
} from '../../validation/error-handler.js';
import {
  BulkOperationManager,
  validateBulkOperationArgs,
  type BulkOperationFunction,
} from '../../utils/bulk-operation-manager.js';
import { withToolTimeout } from '../../utils/timeout-manager.js';

/**
 * Bulk pause multiple firewall rules
 */
export class BulkPauseRulesHandler extends BaseToolHandler {
  name = 'bulk_pause_rules';
  description =
    'Pause multiple firewall rules in a single operation. Requires array of rule IDs. Optional duration parameter (default 60 minutes).';
  category = 'rule' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in bulk rule operations
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'bulk_rules',
        entity_type: 'bulk_rule_pause',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // Validate bulk operation arguments
    const validation = validateBulkOperationArgs(args);
    if (!validation.isValid) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        validation.errors
      );
    }

    const { ids, options } = validation.sanitizedArgs;
    const manager = BulkOperationManager.forRules();

    // Validate the IDs array
    const bulkValidation = manager.validateBulkParams(ids);
    if (!bulkValidation.isValid) {
      return createErrorResponse(
        this.name,
        'Bulk operation validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        bulkValidation.errors
      );
    }

    // Validate duration parameter if provided
    let duration = 60; // Default 60 minutes
    if (options?.duration !== undefined) {
      const durationValidation = ParameterValidator.validateNumber(
        options.duration,
        'duration',
        { min: 1, max: 1440, integer: true }
      );
      if (!durationValidation.isValid) {
        return createErrorResponse(
          this.name,
          'Duration validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          durationValidation.errors
        );
      }
      duration = durationValidation.sanitizedValue as number;
    }

    // Define the pause operation for individual rules
    const pauseOperation: BulkOperationFunction = async (ruleId: string) => {
      return withToolTimeout(
        async () => firewalla.pauseRule(ruleId, duration),
        `${this.name}_item`,
        5000 // 5 second timeout per rule
      );
    };

    // Execute the bulk operation
    const startTime = Date.now();

    const result = await manager.executeBulkOperation(
      bulkValidation.sanitizedIds,
      pauseOperation,
      firewalla,
      'pause_rules'
    );

    const unifiedResponseData = {
      operation: this.name,
      pause_duration_minutes: duration,
      bulk_operation_result: result,
      timestamp: new Date().toISOString(),
    };

    const executionTime = Date.now() - startTime;
    return this.createUnifiedResponse(unifiedResponseData, {
      executionTimeMs: executionTime,
    });
  }
}

/**
 * Bulk resume multiple firewall rules
 */
export class BulkResumeRulesHandler extends BaseToolHandler {
  name = 'bulk_resume_rules';
  description =
    'Resume multiple paused firewall rules in a single operation. Requires array of rule IDs. Re-enables previously paused rules.';
  category = 'rule' as const;

  constructor() {
    super({
      enableGeoEnrichment: false, // No IP fields in bulk rule operations
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'bulk_rules',
        entity_type: 'bulk_rule_resume',
        supports_geographic_enrichment: false,
        supports_field_normalization: true,
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    // Validate bulk operation arguments
    const validation = validateBulkOperationArgs(args);
    if (!validation.isValid) {
      return createErrorResponse(
        this.name,
        'Parameter validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        validation.errors
      );
    }

    const { ids } = validation.sanitizedArgs;
    const manager = BulkOperationManager.forRules();

    // Validate the IDs array
    const bulkValidation = manager.validateBulkParams(ids);
    if (!bulkValidation.isValid) {
      return createErrorResponse(
        this.name,
        'Bulk operation validation failed',
        ErrorType.VALIDATION_ERROR,
        undefined,
        bulkValidation.errors
      );
    }

    // Define the resume operation for individual rules
    const resumeOperation: BulkOperationFunction = async (ruleId: string) => {
      return withToolTimeout(
        async () => firewalla.resumeRule(ruleId),
        `${this.name}_item`,
        5000 // 5 second timeout per rule
      );
    };

    // Execute the bulk operation
    const startTime = Date.now();

    const result = await manager.executeBulkOperation(
      bulkValidation.sanitizedIds,
      resumeOperation,
      firewalla,
      'resume_rules'
    );

    const unifiedResponseData = {
      operation: this.name,
      bulk_operation_result: result,
      timestamp: new Date().toISOString(),
    };

    const executionTime = Date.now() - startTime;
    return this.createUnifiedResponse(unifiedResponseData, {
      executionTimeMs: executionTime,
    });
  }
}
