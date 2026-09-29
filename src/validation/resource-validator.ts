/**
 * The "resource not found" answer the rule tools give (see
 * createResourceNotFoundResponse)
 */

import { ErrorType, createErrorResponse } from './error-handler.js';

/**
 * Resource types that can be validated
 */
export type ResourceType = 
  | 'rule' 
  | 'alarm' 
  | 'device' 
  | 'target_list' 
  | 'box'
  | 'flow';

/**
 * Resource existence check result
 */
export interface ResourceExistenceResult {
  exists: boolean;
  resourceId: string;
  resourceType: ResourceType;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** The not-found answer of a tool whose resource does not exist */
export class ResourceValidator {
  /**
   * Create standardized "resource not found" error response
   */
  static createResourceNotFoundResponse(
    toolName: string,
    resourceType: ResourceType,
    resourceId: string,
    existenceCheck?: ResourceExistenceResult
  ) {
    return createErrorResponse(
      toolName,
      `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found`,
      ErrorType.API_ERROR,
      {
        resource_type: resourceType,
        resource_id: resourceId,
        existence_check: existenceCheck,
        troubleshooting: [
          `Verify that ${resourceType} '${resourceId}' exists`,
          `Check if the ${resourceType} ID is correct`,
          `Ensure you have permission to access this ${resourceType}`,
          `The ${resourceType} may have been deleted or moved`,
        ],
        documentation: `/docs/firewalla-api-reference.md#${resourceType}-operations`,
      },
      [`${resourceType} with ID '${resourceId}' not found`]
    );
  }

}

