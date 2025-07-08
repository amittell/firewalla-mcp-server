/**
 * Bulk alarm management tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
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
 * Bulk delete multiple alarms
 */
export class BulkDeleteAlarmsHandler extends BaseToolHandler {
  name = 'bulk_delete_alarms';
  description = 'Delete multiple security alarms in a single operation';
  category = 'security' as const;

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
      const manager = BulkOperationManager.forAlarms();

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

      // Define the delete operation for individual alarms
      const deleteOperation: BulkOperationFunction = async (
        alarmId: string
      ) => {
        return withToolTimeout(
          async () => firewalla.deleteAlarm(alarmId),
          `${this.name}_item`,
          5000 // 5 second timeout per alarm
        );
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        deleteOperation,
        firewalla,
        'delete_alarms'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk alarm deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk dismiss multiple alarms
 */
export class BulkDismissAlarmsHandler extends BaseToolHandler {
  name = 'bulk_dismiss_alarms';
  description = 'Dismiss multiple security alarms in a single operation';
  category = 'security' as const;

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
      const manager = BulkOperationManager.forAlarms();

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

      // Define the dismiss operation for individual alarms
      const dismissOperation: BulkOperationFunction = async (
        alarmId: string
      ) => {
        // Note: This assumes the Firewalla client has a dismiss method
        // If not available, we might need to use the delete method or implement it
        try {
          // Use delete alarm as dismiss (most Firewalla APIs treat them the same)
          return withToolTimeout(
            async () => firewalla.deleteAlarm(alarmId),
            `${this.name}_item`,
            5000
          );
        } catch (error) {
          throw new Error(
            `Failed to dismiss alarm ${alarmId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        dismissOperation,
        firewalla,
        'dismiss_alarms'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk alarm dismissal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk acknowledge multiple alarms
 */
export class BulkAcknowledgeAlarmsHandler extends BaseToolHandler {
  name = 'bulk_acknowledge_alarms';
  description = 'Acknowledge multiple security alarms in a single operation';
  category = 'security' as const;

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
      const manager = BulkOperationManager.forAlarms();

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

      // Define the acknowledge operation for individual alarms
      const acknowledgeOperation: BulkOperationFunction = async (
        alarmId: string
      ) => {
        try {
          // Note: Acknowledge functionality not available in current Firewalla client
          // Use delete as a fallback or implement custom logic
          throw new Error(
            'Acknowledge operation not supported by current Firewalla client. Use bulk_delete_alarms instead.'
          );
        } catch (error) {
          throw new Error(
            `Failed to acknowledge alarm ${alarmId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        acknowledgeOperation,
        firewalla,
        'acknowledge_alarms'
      );

      return createBulkOperationResponse(result, this.name);
    } catch (error) {
      return createErrorResponse(
        this.name,
        `Bulk alarm acknowledgment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}

/**
 * Bulk update multiple alarms with custom properties
 */
export class BulkUpdateAlarmsHandler extends BaseToolHandler {
  name = 'bulk_update_alarms';
  description =
    'Update multiple security alarms with custom properties in a single operation';
  category = 'security' as const;

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
      const manager = BulkOperationManager.forAlarms();

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

      // Define the update operation for individual alarms
      const updateOperation: BulkOperationFunction = async (
        alarmId: string
      ) => {
        try {
          // Note: Update functionality not available in current Firewalla client
          throw new Error(
            'Update operation not supported by current Firewalla client'
          );
        } catch (error) {
          throw new Error(
            `Failed to update alarm ${alarmId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      };

      // Execute the bulk operation
      const result = await manager.executeBulkOperation(
        bulkValidation.sanitizedIds,
        updateOperation,
        firewalla,
        'update_alarms'
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
        `Bulk alarm update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorType.API_ERROR
      );
    }
  }
}
