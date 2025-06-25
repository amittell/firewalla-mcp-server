/**
 * Filter Factory and Registry
 * Centralized management of all search filters
 */

import { QueryNode, FieldQuery, WildcardQuery } from '../types.js';
import { Filter, FilterContext, FilterResult } from './base.js';
import { TimeRangeFilter } from './time.js';

// Simplified IP and other filters for now
class IpAddressFilter implements Filter {
  readonly name = 'ip_address';
  
  canHandle(node: QueryNode): boolean {
    if (node.type === 'field' || node.type === 'wildcard') {
      const fieldNode = node as FieldQuery | WildcardQuery;
      return ['source_ip', 'destination_ip', 'ip', 'device_ip'].includes(fieldNode.field);
    }
    return false;
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    // Simplified - just pass through for post-processing
    if (node.type === 'wildcard') {
      const wildcardNode = node as WildcardQuery;
      return {
        apiParams: {},
        postProcessing: (items: any[]) => items.filter(item => {
          const value = this.getNestedValue(item, wildcardNode.field);
          return this.matchWildcard(String(value || ''), wildcardNode.pattern);
        }),
        cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
      };
    }
    
    const fieldNode = node as FieldQuery;
    return {
      apiParams: {},
      postProcessing: (items: any[]) => items.filter(item => {
        const value = this.getNestedValue(item, fieldNode.field);
        return String(value || '') === fieldNode.value;
      }),
      cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
    };
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
    return node.type === 'field' && node.field === 'severity';
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    return {
      apiParams: { severity: (node as any).value },
      cacheKeyComponent: `${this.name}:${(node as any).value}`
    };
  }
}

class ProtocolFilter implements Filter {
  readonly name = 'protocol';
  
  canHandle(node: QueryNode): boolean {
    return node.type === 'field' && node.field === 'protocol';
  }
  
  apply(node: QueryNode, context: FilterContext): FilterResult {
    return {
      apiParams: { protocol: (node as any).value },
      cacheKeyComponent: `${this.name}:${(node as any).value}`
    };
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