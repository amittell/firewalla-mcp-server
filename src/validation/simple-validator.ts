/**
 * Unified validation system using Zod
 * Replaces 6 separate validation systems with a single, simple approach
 */

import { z } from 'zod';

// Basic schemas for common parameter types
export const BaseSchemas = {
  limit: z.number().int().min(1).max(10000),
  query: z.string().min(1).max(1000),
  entityType: z.enum(['flows', 'alarms', 'rules', 'devices', 'target_lists']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional(),
  cursor: z.string().optional(),
  groupBy: z.string().optional(),
  id: z.string().min(1),
  ipAddress: z.string().ip().optional(),
  field: z.string().min(1),
  operator: z.enum([':', '=', '>', '<', '>=', '<=', '!=', 'contains']),
  correlationField: z.string().min(1)
};

// MCP tool parameter schemas
export const ToolSchemas = {
  getActiveAlarms: z.object({
    limit: BaseSchemas.limit,
    severity: BaseSchemas.severity,
    cursor: BaseSchemas.cursor,
    groupBy: BaseSchemas.groupBy
  }),

  getFlowData: z.object({
    limit: BaseSchemas.limit,
    start_time: z.string().datetime().optional(),
    end_time: z.string().datetime().optional(),
    cursor: BaseSchemas.cursor
  }),

  getDeviceStatus: z.object({
    limit: BaseSchemas.limit,
    box_id: z.string().optional(),
    group_id: z.string().optional(),
    cursor: BaseSchemas.cursor
  }),

  getBandwidthUsage: z.object({
    limit: BaseSchemas.limit,
    period: z.enum(['1h', '24h', '7d', '30d'])
  }),

  searchFlows: z.object({
    query: BaseSchemas.query,
    limit: BaseSchemas.limit,
    time_range: BaseSchemas.timeRange,
    group_by: BaseSchemas.groupBy
  }),

  searchAlarms: z.object({
    query: BaseSchemas.query,
    limit: BaseSchemas.limit,
    min_severity: BaseSchemas.severity
  }),

  searchRules: z.object({
    query: BaseSchemas.query,
    limit: BaseSchemas.limit,
    actions: z.array(z.enum(['allow', 'block', 'timelimit'])).optional()
  }),

  pauseRule: z.object({
    rule_id: z.string().min(1),
    duration: z.number().int().min(1).max(1440).optional()
  }),

  resumeRule: z.object({
    rule_id: z.string().min(1)
  }),

  // Cross-reference validation
  crossReference: z.object({
    primary_query: BaseSchemas.query,
    secondary_queries: z.array(z.string()),
    correlation_field: BaseSchemas.correlationField,
    limit: BaseSchemas.limit
  }),

  // Enhanced correlation validation
  enhancedCorrelation: z.object({
    primary_query: BaseSchemas.query,
    secondary_queries: z.array(z.string()),
    correlation_params: z.object({
      correlationFields: z.array(z.string()).max(5),
      correlationType: z.enum(['AND', 'OR'])
    }),
    limit: BaseSchemas.limit
  })
};

/**
 * Simple validation function that returns clear error messages
 */
export function validateParams<T>(schema: z.ZodSchema<T>, params: unknown): { 
  success: true; 
  data: T 
} | { 
  success: false; 
  error: string 
} {
  const result = schema.safeParse(params);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Extract first error for simple message
  const firstError = result.error.errors[0];
  const field = firstError.path.join('.');
  const {message} = firstError;
  
  return { 
    success: false, 
    error: `${field}: ${message}` 
  };
}

/**
 * Validate tool parameters and return standardized error format
 */
export function validateToolParams(
  toolName: keyof typeof ToolSchemas, 
  params: unknown
): {
  error?: boolean;
  message?: string;
  tool?: string;
  validation_errors?: string[];
} | null {
  const schema = ToolSchemas[toolName];
  if (!schema) {
    return {
      error: true,
      message: `Unknown tool: ${toolName}`,
      tool: toolName,
      validation_errors: [`Tool '${toolName}' is not recognized`]
    };
  }

  const validation = validateParams(schema, params);
  if (!validation.success) {
    return {
      error: true,
      message: validation.error,
      tool: toolName,
      validation_errors: [validation.error]
    };
  }

  return null; // No errors
}

/**
 * Simple query syntax validation - basic checks only
 */
export function validateQuerySyntax(query: string): { 
  valid: boolean; 
  error?: string 
} {
  if (!query || query.trim().length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  // Basic syntax checks
  const openParens = (query.match(/\(/g) || []).length;
  const closeParens = (query.match(/\)/g) || []).length;
  
  if (openParens !== closeParens) {
    return { valid: false, error: 'Mismatched parentheses in query' };
  }

  const openQuotes = (query.match(/"/g) || []).length;
  if (openQuotes % 2 !== 0) {
    return { valid: false, error: 'Mismatched quotes in query' };
  }

  return { valid: true };
}

/**
 * Simple field validation - check if field exists for entity type
 */
export function validateField(field: string, entityType: string): {
  valid: boolean;
  error?: string;
} {
  // Common fields that exist across all entity types
  const commonFields = ['id', 'timestamp', 'ts', 'created', 'updated'];
  
  // Entity-specific fields (simplified list)
  const entityFields: Record<string, string[]> = {
    flows: ['source_ip', 'destination_ip', 'protocol', 'port', 'blocked', 'bytes'],
    alarms: ['severity', 'type', 'status', 'resolved', 'device_ip'],
    rules: ['action', 'target_value', 'direction', 'enabled', 'hit_count'],
    devices: ['name', 'mac', 'ip', 'online', 'device_type', 'vendor'],
    target_lists: ['category', 'owner', 'targets', 'enabled']
  };

  const validFields = [...commonFields, ...(entityFields[entityType] || [])];
  
  if (!validFields.includes(field)) {
    return { 
      valid: false, 
      error: `Field '${field}' is not valid for entity type '${entityType}'` 
    };
  }

  return { valid: true };
}

/**
 * Simple operator validation - check if operator is valid for field
 */
export function validateOperator(field: string, operator: string): {
  valid: boolean;
  error?: string;
} {
  // String fields support these operators
  const stringOperators = [':', '=', '!=', 'contains'];
  
  // Numeric fields support these operators  
  const numericOperators = [':', '=', '!=', '>', '<', '>=', '<='];
  
  // Determine field type (simplified)
  const numericFields = ['port', 'bytes', 'hit_count', 'severity_level'];
  const isNumeric = numericFields.some(nf => field.includes(nf));
  
  const validOperators = isNumeric ? numericOperators : stringOperators;
  
  if (!validOperators.includes(operator)) {
    return {
      valid: false,
      error: `Operator '${operator}' is not valid for field '${field}'`
    };
  }

  return { valid: true };
}