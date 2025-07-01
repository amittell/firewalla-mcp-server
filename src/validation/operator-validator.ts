/**
 * Operator Validator for Firewalla MCP Server
 * Provides operator compatibility checking with field types
 */

import { SEARCH_FIELDS } from '../search/types.js';

type EntityType = keyof typeof SEARCH_FIELDS;

/**
 * Field data types for operator compatibility
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'enum' | 'ip' | 'timestamp' | 'array';

/**
 * Query operators
 */
export type QueryOperator = ':' | '=' | '!=' | '>' | '<' | '>=' | '<=' | '~' | 'contains' | 'startswith' | 'endswith' | 'in' | 'not_in' | 'range';

/**
 * Operator validation result
 */
export interface OperatorValidation {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  validOperators?: QueryOperator[];
  fieldType?: FieldType;
}

/**
 * Operator compatibility matrix
 */
interface OperatorCompatibility {
  [fieldType: string]: QueryOperator[];
}

export class OperatorValidator {
  private static readonly FIELD_TYPE_MAP: Record<string, FieldType> = {
    // String fields
    'source_ip': 'ip',
    'destination_ip': 'ip',
    'device_ip': 'ip',
    'protocol': 'enum',
    'direction': 'enum',
    'action': 'enum',
    'status': 'enum',
    'type': 'enum',
    'severity': 'enum',
    'name': 'string',
    'description': 'string',
    'target_value': 'string',
    'target_type': 'enum',
    'network_name': 'string',
    'group_name': 'string',
    'mac_vendor': 'string',
    'category': 'string',
    'user_agent': 'string',
    'application': 'string',
    'domain_category': 'enum',
    'ssl_subject': 'string',
    'ssl_issuer': 'string',
    'country': 'string',
    'city': 'string',
    'isp': 'string',
    'organization': 'string',
    
    // Numeric fields
    'bytes': 'number',
    'hit_count': 'number',
    'total_download': 'number',
    'total_upload': 'number',
    'session_duration': 'number',
    'frequency_score': 'number',
    'geographic_risk_score': 'number',
    'target_count': 'number',
    
    // Boolean fields
    'blocked': 'boolean',
    'online': 'boolean',
    'is_cloud_provider': 'boolean',
    'is_proxy': 'boolean',
    'is_vpn': 'boolean',
    
    // Timestamp fields
    'timestamp': 'timestamp',
    'created_at': 'timestamp',
    'updated_at': 'timestamp',
    'last_updated': 'timestamp',
    
    // Array/list fields
    'owner': 'array'
  };

  private static readonly OPERATOR_COMPATIBILITY: OperatorCompatibility = {
    'string': [':', '=', '!=', '~', 'contains', 'startswith', 'endswith'],
    'number': [':', '=', '!=', '>', '<', '>=', '<=', 'range'],
    'boolean': [':', '='],
    'enum': [':', '=', '!=', 'in', 'not_in'],
    'ip': [':', '=', '!=', '~', 'contains'],
    'timestamp': [':', '=', '!=', '>', '<', '>=', '<=', 'range'],
    'array': [':', '=', 'contains', 'in']
  };

  private static readonly OPERATOR_DESCRIPTIONS: Record<QueryOperator, string> = {
    ':': 'Equals (standard field query)',
    '=': 'Equals (alternative syntax)',
    '!=': 'Not equals',
    '>': 'Greater than',
    '<': 'Less than',
    '>=': 'Greater than or equal',
    '<=': 'Less than or equal',
    '~': 'Contains/matches pattern',
    'contains': 'Contains substring',
    'startswith': 'Starts with string',
    'endswith': 'Ends with string',
    'in': 'Value in list',
    'not_in': 'Value not in list',
    'range': 'Value in range [min TO max]'
  };

  /**
   * Validate operator compatibility with field
   */
  static validateOperator(
    field: string, 
    operator: string, 
    entityType: EntityType
  ): OperatorValidation {
    if (!field || typeof field !== 'string') {
      return {
        isValid: false,
        error: 'Field name is required for operator validation'
      };
    }

    if (!operator || typeof operator !== 'string') {
      return {
        isValid: false,
        error: 'Operator is required for validation'
      };
    }

    const fieldType = this.getFieldType(field, entityType);
    if (!fieldType) {
      return {
        isValid: false,
        error: `Unknown field '${field}' for entity type '${entityType}'`,
        suggestion: `Check field name spelling or refer to ${entityType} field documentation`
      };
    }

    const normalizedOperator = this.normalizeOperator(operator);
    if (!normalizedOperator) {
      return {
        isValid: false,
        error: `Unknown operator '${operator}'`,
        suggestion: 'Valid operators include: :, =, !=, >, <, >=, <=, ~, contains, range',
        validOperators: this.getAllValidOperators(),
        fieldType
      };
    }

    const compatibleOperators = this.OPERATOR_COMPATIBILITY[fieldType];
    if (!compatibleOperators || !compatibleOperators.includes(normalizedOperator)) {
      return {
        isValid: false,
        error: this.createCompatibilityError(field, operator, fieldType),
        suggestion: this.suggestAlternativeOperators(fieldType),
        validOperators: compatibleOperators,
        fieldType
      };
    }

    return {
      isValid: true,
      fieldType
    };
  }

  /**
   * Get field type for validation
   */
  private static getFieldType(field: string, entityType: EntityType): FieldType | null {
    const validFields = SEARCH_FIELDS[entityType];
    if (!validFields || !validFields.includes(field)) {
      return null;
    }

    return this.FIELD_TYPE_MAP[field] || 'string';
  }

  /**
   * Normalize operator to standard form
   */
  private static normalizeOperator(operator: string): QueryOperator | null {
    const normalized = operator.trim().toLowerCase();
    
    // Direct mappings
    const operatorMap: Record<string, QueryOperator> = {
      ':': ':',
      '=': '=',
      '!=': '!=',
      '<>': '!=',
      '>': '>',
      '<': '<',
      '>=': '>=',
      '<=': '<=',
      '~': '~',
      'contains': 'contains',
      'like': 'contains',
      'startswith': 'startswith',
      'starts_with': 'startswith',
      'endswith': 'endswith',
      'ends_with': 'endswith',
      'in': 'in',
      'not_in': 'not_in',
      'not in': 'not_in',
      'range': 'range'
    };

    return operatorMap[normalized] || null;
  }

  /**
   * Create detailed compatibility error message
   */
  private static createCompatibilityError(
    field: string, 
    operator: string, 
    fieldType: FieldType
  ): string {
    switch (fieldType) {
      case 'string':
        if (['>', '<', '>=', '<='].includes(operator)) {
          return `Comparison operator '${operator}' cannot be used with string field '${field}'. Use equality operators (:, =, !=) or pattern matching (~, contains) instead.`;
        }
        break;
        
      case 'boolean':
        if (operator !== ':' && operator !== '=') {
          return `Operator '${operator}' is not valid for boolean field '${field}'. Use exact values only (field:true or field:false).`;
        }
        break;
        
      case 'enum':
        if (['>', '<', '>=', '<=', '~'].includes(operator)) {
          return `Operator '${operator}' is not valid for enum field '${field}'. Use exact values (:, =) or list matching (in, not_in) instead.`;
        }
        break;
        
      case 'number':
        if (['~', 'contains', 'startswith', 'endswith'].includes(operator)) {
          return `Text operator '${operator}' cannot be used with numeric field '${field}'. Use comparison operators (>, <, >=, <=) or equality (:, =) instead.`;
        }
        break;
        
      case 'timestamp':
        if (['~', 'contains', 'startswith', 'endswith'].includes(operator)) {
          return `Text operator '${operator}' cannot be used with timestamp field '${field}'. Use comparison operators for date ranges or exact matching (:, =).`;
        }
        break;
        
      case 'array':
        if (['>', '<', '>=', '<=', '~', 'startswith', 'endswith'].includes(operator)) {
          return `Operator '${operator}' is not valid for array field '${field}'. Use contains or in operators for array matching.`;
        }
        break;
        
      default:
        return `Operator '${operator}' is not compatible with field '${field}' of type ${fieldType}.`;
    }
    
    return `Operator '${operator}' is not compatible with field '${field}' of type ${fieldType}.`;
  }

  /**
   * Suggest alternative operators for field type
   */
  private static suggestAlternativeOperators(fieldType: FieldType): string {
    const operators = this.OPERATOR_COMPATIBILITY[fieldType];
    if (!operators || operators.length === 0) {
      return 'No valid operators available for this field type';
    }

    const examples = operators.slice(0, 4).map(op => {
      const desc = this.OPERATOR_DESCRIPTIONS[op];
      return `${op} (${desc})`;
    }).join(', ');

    return `Try using: ${examples}${operators.length > 4 ? '...' : ''}`;
  }

  /**
   * Get all valid operators
   */
  private static getAllValidOperators(): QueryOperator[] {
    const allOperators = new Set<QueryOperator>();
    
    Object.values(this.OPERATOR_COMPATIBILITY).forEach(operators => {
      operators.forEach(op => allOperators.add(op));
    });
    
    return Array.from(allOperators);
  }

  /**
   * Get detailed operator information
   */
  static getOperatorInfo(operator: string): {
    description: string;
    examples: string[];
    compatibleTypes: FieldType[];
  } | null {
    const normalizedOperator = this.normalizeOperator(operator);
    if (!normalizedOperator) {
      return null;
    }

    const description = this.OPERATOR_DESCRIPTIONS[normalizedOperator];
    const compatibleTypes: FieldType[] = [];
    
    Object.entries(this.OPERATOR_COMPATIBILITY).forEach(([type, operators]) => {
      if (operators.includes(normalizedOperator)) {
        compatibleTypes.push(type as FieldType);
      }
    });

    const examples = this.generateOperatorExamples(normalizedOperator);

    return {
      description,
      examples,
      compatibleTypes
    };
  }

  /**
   * Generate usage examples for operator
   */
  private static generateOperatorExamples(operator: QueryOperator): string[] {
    const examples: Record<QueryOperator, string[]> = {
      ':': ['protocol:tcp', 'severity:high', 'blocked:true'],
      '=': ['protocol=tcp', 'severity=high', 'blocked=true'],
      '!=': ['protocol!=udp', 'severity!=low', 'blocked!=false'],
      '>': ['bytes>1000000', 'hit_count>10', 'session_duration>300'],
      '<': ['bytes<50000', 'hit_count<5', 'session_duration<60'],
      '>=': ['bytes>=1000000', 'hit_count>=10', 'severity>=medium'],
      '<=': ['bytes<=50000', 'hit_count<=5', 'severity<=medium'],
      '~': ['description~"suspicious"', 'target_value~"*.com"', 'source_ip~"192.168.*"'],
      'contains': ['description:contains:"malware"', 'user_agent:contains:"Chrome"'],
      'startswith': ['target_value:startswith:"www."', 'name:startswith:"dev"'],
      'endswith': ['target_value:endswith:".com"', 'name:endswith:"_backup"'],
      'in': ['severity:in:["high","critical"]', 'protocol:in:["tcp","udp"]'],
      'not_in': ['action:not_in:["allow","permit"]', 'type:not_in:["info"]'],
      'range': ['bytes:[1000 TO 50000]', 'timestamp:[2024-01-01 TO 2024-01-31]']
    };

    return examples[operator] || [];
  }

  /**
   * Validate complex operator expressions
   */
  static validateComplexExpression(
    expression: string, 
    entityType: EntityType
  ): {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Extract field:operator:value patterns
    const fieldOperatorPattern = /(\w+)\s*([!<>=~:]+)\s*([^)\s]+)/g;
    let match;

    while ((match = fieldOperatorPattern.exec(expression)) !== null) {
      const [, field, operator, value] = match;
      
      const validation = this.validateOperator(field, operator, entityType);
      if (!validation.isValid && validation.error) {
        errors.push(validation.error);
        if (validation.suggestion) {
          suggestions.push(validation.suggestion);
        }
      }

      // Additional value validation based on field type
      if (validation.fieldType) {
        const valueValidation = this.validateOperatorValue(value, operator, validation.fieldType);
        if (!valueValidation.isValid) {
          errors.push(valueValidation.error || 'Invalid value for operator');
          if (valueValidation.suggestion) {
            suggestions.push(valueValidation.suggestion);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions
    };
  }

  /**
   * Validate operator value compatibility
   */
  private static validateOperatorValue(
    value: string, 
    operator: string, 
    fieldType: FieldType
  ): { isValid: boolean; error?: string; suggestion?: string } {
    // Remove quotes if present
    const cleanValue = value.replace(/^["']|["']$/g, '');

    switch (fieldType) {
      case 'number':
        if (['>', '<', '>=', '<='].includes(operator)) {
          if (isNaN(Number(cleanValue))) {
            return {
              isValid: false,
              error: `Numeric comparison requires a valid number, got '${cleanValue}'`,
              suggestion: `Use a numeric value like: bytes>${operator === '>' ? '1000000' : '50000'}`
            };
          }
        }
        break;

      case 'boolean':
        if (!['true', 'false'].includes(cleanValue.toLowerCase())) {
          return {
            isValid: false,
            error: `Boolean field requires 'true' or 'false', got '${cleanValue}'`,
            suggestion: 'Use: field:true or field:false'
          };
        }
        break;

      case 'timestamp':
        if (['>', '<', '>=', '<='].includes(operator)) {
          // Basic timestamp format validation
          if (!/^\d{4}-\d{2}-\d{2}/.test(cleanValue)) {
            return {
              isValid: false,
              error: `Timestamp comparison requires date format, got '${cleanValue}'`,
              suggestion: 'Use format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS'
            };
          }
        }
        break;
    }

    return { isValid: true };
  }
}