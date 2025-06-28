/**
 * @fileoverview Base types and interfaces for MCP tool handlers
 *
 * Provides foundational classes and interfaces for implementing MCP tools that
 * interact with Firewalla firewall data. Includes standardized error handling,
 * response formatting, and validation patterns for consistent tool behavior.
 *
 * The base infrastructure ensures all tools follow MCP protocol standards while
 * providing consistent error reporting and response structure across the entire
 * tool ecosystem.
 *
 * @version 1.0.0
 * @author Firewalla MCP Server Team
 * @since 2024-01-01
 */

import type { FirewallaClient } from '../../firewalla/client.js';

/**
 * Generic arguments interface for MCP tool execution
 *
 * Flexible key-value structure that allows tools to accept various parameter types
 * while maintaining type safety through individual tool implementations.
 */
export type ToolArgs = Record<string, unknown>;

/**
 * Standardized response structure for MCP tool execution
 *
 * All tools must return responses in this format for consistent MCP protocol compliance.
 * The content array supports multiple response blocks with different types and formatting.
 */
export interface ToolResponse {
  /** @description Array of content blocks containing tool output */
  content: Array<{
    /** @description Content type (typically 'text' for JSON responses) */
    type: string;
    /** @description The actual content text (usually JSON.stringify result) */
    text: string;
  }>;
  /** @description Optional flag indicating if the response represents an error condition */
  isError?: boolean;
  /** @description Additional metadata or context for the response */
  [key: string]: unknown;
}

/**
 * Interface defining the contract for all MCP tool handlers
 *
 * Provides the foundation for implementing interactive tools that can be invoked
 * by Claude through the MCP protocol to access and manipulate Firewalla data.
 */
export interface ToolHandler {
  /**
   * Execute the tool with given arguments and return formatted response
   *
   * @param args - Tool-specific arguments provided by the MCP client
   * @param firewalla - Authenticated Firewalla client for API access
   * @returns Promise resolving to formatted tool response
   */
  execute: (
    args: ToolArgs,
    firewalla: FirewallaClient
  ) => Promise<ToolResponse>;

  /** @description Unique tool identifier used in MCP tool registration */
  name: string;

  /** @description Human-readable description of tool functionality */
  description: string;

  /** @description Tool category for organizational and filtering purposes */
  category: 'security' | 'network' | 'device' | 'rule' | 'analytics' | 'search';
}

/**
 * Base class for tool handlers with common validation and error handling
 *
 * Provides standardized implementation patterns for MCP tools including:
 * - Consistent response formatting for success and error cases
 * - JSON serialization with proper error handling
 * - Tool metadata structure validation
 * - Common utility methods for response construction
 *
 * All concrete tool implementations should extend this class to ensure
 * uniform behavior across the tool ecosystem.
 *
 * @abstract
 * @implements {ToolHandler}
 */
export abstract class BaseToolHandler implements ToolHandler {
  /** @description Tool identifier - must be implemented by concrete classes */
  abstract name: string;

  /** @description Tool description - must be implemented by concrete classes */
  abstract description: string;

  /** @description Tool category - must be implemented by concrete classes */
  abstract category:
    | 'security'
    | 'network'
    | 'device'
    | 'rule'
    | 'analytics'
    | 'search';

  /**
   * Execute the tool logic - must be implemented by concrete classes
   *
   * @param args - Tool arguments from MCP client
   * @param firewalla - Firewalla API client instance
   * @returns Promise resolving to tool response
   */
  abstract execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse>;

  /**
   * Create a standardized success response with JSON-formatted data
   *
   * @param data - The data to include in the response
   * @returns Formatted success response compliant with MCP protocol
   * @protected
   */
  protected createSuccessResponse(data: any): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Create a standardized error response with diagnostic information
   *
   * @param message - Human-readable error message
   * @param details - Optional additional error context or debugging information
   * @returns Formatted error response with isError flag set
   * @protected
   */
  protected createErrorResponse(message: string, details?: any): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: true,
              message,
              tool: this.name,
              ...(details && { details }),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
