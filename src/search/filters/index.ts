/**
 * Filter Factory and Registry
 * Centralized management of all search filters
 */

import { QueryNode, FieldQuery, WildcardQuery } from '../types.js';
import { Filter, FilterContext, FilterResult } from './base.js';
import { TimeRangeFilter } from './time.js';

// Type guard functions for better type safety
function isFieldQuery(node: QueryNode): node is FieldQuery {
  return node.type === 'field' && 'field' in node && 'value' in node;
}

function isWildcardQuery(node: QueryNode): node is WildcardQuery {
  return node.type === 'wildcard' && 'field' in node && 'pattern' in node;
}

// Simplified IP and other filters for now
class IpAddressFilter implements Filter {
  readonly name = 'ip_address';
  
  canHandle(node: QueryNode): boolean {
    if (isFieldQuery(node) || isWildcardQuery(node)) {
      return ['source_ip', 'destination_ip', 'ip', 'device_ip'].includes(node.field);
    }
    return false;
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    // Simplified - just pass through for post-processing
    if (isWildcardQuery(node)) {
      return {
        apiParams: {},
        postProcessing: (items: any[]) => items.filter(item => {
          const value = this.getNestedValue(item, node.field);
          return this.matchWildcard(String(value || ''), node.pattern);
        }),
        cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
      };
    }
    
    if (isFieldQuery(node)) {
      return {
        apiParams: {},
        postProcessing: (items: any[]) => items.filter(item => {
          const value = this.getNestedValue(item, node.field);
          return String(value || '') === String(node.value);
        }),
        cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
      };
    }
    
    return { apiParams: {} };
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private matchWildcard(value: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
  }
}

class SeverityFilter implements Filter {
  readonly name = 'severity';
  private readonly severityOrder = ['low', 'medium', 'high', 'critical'];
  
  canHandle(node: QueryNode): boolean {
    return isFieldQuery(node) && node.field === 'severity';
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    if (isFieldQuery(node)) {
      return {
        apiParams: { severity: node.value },
        cacheKeyComponent: `${this.name}:${node.value}`
      };
    }
    return { apiParams: {} };
  }
}

class ProtocolFilter implements Filter {
  readonly name = 'protocol';
  
  canHandle(node: QueryNode): boolean {
    return isFieldQuery(node) && node.field === 'protocol';
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    if (isFieldQuery(node)) {
      return {
        apiParams: { protocol: node.value },
        cacheKeyComponent: `${this.name}:${node.value}`
      };
    }
    return { apiParams: {} };
  }
}

/**
 * Filter Factory for managing and applying filters
 */
export class FilterFactory {
  private filters: Filter[] = [
    new TimeRangeFilter(),
    new IpAddressFilter(),
    new SeverityFilter(),
    new ProtocolFilter()
  ];
  
  /**
   * Apply all relevant filters to a query node
   */
  applyFilters(node: QueryNode, context: FilterContext): FilterResult {
    const result: FilterResult = {
      apiParams: {},
      postProcessing: undefined,
      cacheKeyComponent: ''
    };
    
    const applicableFilters = this.filters.filter(filter => filter.canHandle(node));
    
    for (const filter of applicableFilters) {
      const filterResult = filter.apply(node, context);
      
      // Merge API parameters
      Object.assign(result.apiParams, filterResult.apiParams);
      
      // Combine post-processing functions with debugging support
      if (filterResult.postProcessing) {
        const existingPostProcessing = result.postProcessing;
        if (existingPostProcessing) {
          result.postProcessing = (items: any[]) => {
            if (context.debug) {
              console.log(`Applying ${filter.name} after existing filters`);
            }
            const intermediate = existingPostProcessing(items);
            const final = filterResult.postProcessing!(intermediate);
            if (context.debug) {
              console.log(`${filter.name}: ${items.length} → ${intermediate.length} → ${final.length} items`);
            }
            return final;
          };
        } else {
          result.postProcessing = filterResult.postProcessing;
        }
      }
      
      // Combine cache keys
      if (filterResult.cacheKeyComponent) {
        result.cacheKeyComponent += (result.cacheKeyComponent ? '|' : '') + filterResult.cacheKeyComponent;
      }
    }
    
    return result;
  }
  
  /**
   * Register a new filter
   */
  registerFilter(filter: Filter): void {
    this.filters.push(filter);
  }
}

// Export singleton instance
export const filterFactory = new FilterFactory();