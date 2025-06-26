/**
 * Base types and interfaces for MCP tool handlers
 */

import { FirewallaClient } from '../../firewalla/client.js';

export interface ToolArgs {
  [key: string]: any;
}

export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolHandler {
  /**
   * Execute the tool with given arguments
   */
  execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
  
  /**
   * Tool metadata
   */
  name: string;
  description: string;
  category: 'security' | 'network' | 'device' | 'rule' | 'analytics' | 'search';
}

/**
 * Base class for tool handlers with common validation and error handling
 */
export abstract class BaseToolHandler implements ToolHandler {
  abstract name: string;
  abstract description: string;
  abstract category: 'security' | 'network' | 'device' | 'rule' | 'analytics' | 'search';
  
  abstract execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
  
  /**
   * Create a success response
   */
  protected createSuccessResponse(data: any): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
  
  /**
   * Create an error response
   */
  protected createErrorResponse(message: string, details?: any): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message,
            tool: this.name,
            ...(details && { details })
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}