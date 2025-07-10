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
  createBulkOperationResponse,
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

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        pauseOperation,
        firewalla,
        'pause_rules'
      );

      // Add duration to the result for reference
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: this.name,
                pause_duration_minutes: duration,
                ...result,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule pause failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
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

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        resumeOperation,
        firewalla,
        'resume_rules'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule resume failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk enable multiple firewall rules
 */
export class BulkEnableRulesHandler extends BaseToolHandler {
  name = 'bulk_enable_rules';
  description =
    'Enable multiple firewall rules in a single operation. Requires array of rule IDs. Permanently enables specified rules.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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

      // Define the enable operation for individual rules
      const enableOperation: BulkOperationFunction = async (ruleId: string) => {
        try {
          // Use resume as enable operation (they are equivalent in Firewalla)
          return withToolTimeout(
            async () => firewalla.resumeRule(ruleId),
            `${this.name}_item`,
            5000
          );
        } catch (error) {
          throw new Error(
            `Failed to enable rule ${ruleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        enableOperation,
        firewalla,
        'enable_rules'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule enable failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk disable multiple firewall rules
 */
export class BulkDisableRulesHandler extends BaseToolHandler {
  name = 'bulk_disable_rules';
  description =
    'Disable multiple firewall rules in a single operation. Requires array of rule IDs. Permanently disables specified rules.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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

      // Define the disable operation for individual rules
      const disableOperation: BulkOperationFunction = async (
        ruleId: string
      ) => {
        try {
          // Use pause with long duration as disable operation
          return withToolTimeout(
            async () => firewalla.pauseRule(ruleId, 1440), // Pause for 24 hours
            `${this.name}_item`,
            5000
          );
        } catch (error) {
          throw new Error(
            `Failed to disable rule ${ruleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        disableOperation,
        firewalla,
        'disable_rules'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule disable failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk update multiple firewall rules with custom properties
 */
export class BulkUpdateRulesHandler extends BaseToolHandler {
  name = 'bulk_update_rules';
  description =
    'Update multiple firewall rules with custom properties in a single operation';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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

      // Validate update options
      if (!options || Object.keys(options).length === 0) {
        return createErrorResponse(
          this.name,
          'Update options are required for bulk update',
          ErrorType.VALIDATION_ERROR,
          undefined,
          ['options parameter must contain properties to update']
        );
      }

      // Define the update operation for individual rules
      const updateOperation: BulkOperationFunction = async (ruleId: string) => {
        try {
          // Note: Update functionality not available in current Firewalla client
          throw new Error(
            'Update operation not supported by current Firewalla client'
          );
        } catch (error) {
          throw new Error(
            `Failed to update rule ${ruleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        updateOperation,
        firewalla,
        'update_rules'
      );

      // Add update options to the result for reference
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: this.name,
                update_options: options,
                ...result,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk delete multiple firewall rules
 */
export class BulkDeleteRulesHandler extends BaseToolHandler {
  name = 'bulk_delete_rules';
  description =
    'Delete multiple firewall rules in a single operation. Requires array of rule IDs and confirm=true parameter. Use with caution as this permanently removes rules.';
  category = 'rule' as const;

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
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

      // Define the delete operation for individual rules
      const deleteOperation: BulkOperationFunction = async (ruleId: string) => {
        try {
          // Note: Delete functionality not available in current Firewalla client
          throw new Error(
            'Delete operation not supported by current Firewalla client'
          );
        } catch (error) {
          throw new Error(
            `Failed to delete rule ${ruleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        deleteOperation,
        firewalla,
        'delete_rules'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk rule deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}
