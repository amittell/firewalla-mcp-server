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
  description =
    'Delete multiple security alarms in a single operation. Requires array of alarm IDs. Use with caution as this permanently removes alarms.';
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