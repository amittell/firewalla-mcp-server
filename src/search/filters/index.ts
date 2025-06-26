/**
 * Filter Factory and Registry
 * Centralized management of all search filters
 */

import { QueryNode, FieldQuery, WildcardQuery } from '../types.js';
import { Filter, FilterContext, FilterResult } from './base.js';
import { TimeRangeFilter } from './time.js';

/**
 * Determines whether a query node is a field query.
 *
 * @param node - The query node to check
 * @returns True if the node is of type 'field' and contains both 'field' and 'value' properties.
 */
function isFieldQuery(node: QueryNode): node is FieldQuery {
  return node.type === 'field' && 'field' in node && 'value' in node;
}

/**
 * Determines whether a query node is a wildcard query.
 *
 * @param node - The query node to check
 * @returns True if the node is of type 'wildcard' and contains both 'field' and 'pattern' properties.
 */
function isWildcardQuery(node: QueryNode): node is WildcardQuery {
  return node.type === 'wildcard' && 'field' in node && 'pattern' in node;
}

// IP address filtering with proper validation and subnet matching
class IpAddressFilter implements Filter {
  readonly name = 'ip_address';
  
  canHandle(node: QueryNode): boolean {
    if (isFieldQuery(node) || isWildcardQuery(node)) {
      return ['source_ip', 'destination_ip', 'ip', 'device_ip'].includes(node.field);
    }
    return false;
  }
  
  apply(node: QueryNode, _context: FilterContext): FilterResult {
    // Enhanced IP filtering with proper validation
    if (isWildcardQuery(node)) {
      return {
        apiParams: {},
        postProcessing: (items: any[]) => items.filter(item => {
          const value = this.getNestedValue(item, node.field);
          const ipString = String(value || '');
          
          // Validate IP address format first
          if (!this.isValidIpAddress(ipString)) {
            return false;
          }
          
          return this.matchWildcardIp(ipString, node.pattern);
        }),
        cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
      };
    }
    
    if (isFieldQuery(node)) {
      return {
        apiParams: {},
        postProcessing: (items: any[]) => items.filter(item => {
          const value = this.getNestedValue(item, node.field);
          const ipString = String(value || '');
          const queryString = String(node.value);
          
          // Handle CIDR notation for exact matching
          if (queryString.includes('/')) {
            return this.matchCidr(ipString, queryString);
          }
          
          // Validate both IPs for exact match
          if (!this.isValidIpAddress(ipString) || !this.isValidIpAddress(queryString)) {
            return false;
          }
          
          return ipString === queryString;
        }),
        cacheKeyComponent: `${this.name}:${JSON.stringify(node)}`
      };
    }
    
    return { apiParams: {} };
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  /**
   * Validates if a string is a valid IPv4 or IPv6 address
   */
  private isValidIpAddress(ip: string): boolean {
    if (!ip || typeof ip !== 'string') {
      return false;
    }
    
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.');
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }
    
    // IPv6 validation (basic)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
    return ipv6Regex.test(ip);
  }
  
  /**
   * Enhanced wildcard matching for IP addresses with subnet support
   */
  private matchWildcardIp(ip: string, pattern: string): boolean {
    // Handle CIDR notation in pattern
    if (pattern.includes('/')) {
      return this.matchCidr(ip, pattern);
    }
    
    // Handle common IP wildcard patterns
    if (pattern.includes('*')) {
      // Convert IP wildcard to regex (e.g., 192.168.*.* or 10.0.0.*)
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '\\d{1,3}');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(ip);
    }
    
    return ip === pattern;
  }
  
  /**
   * CIDR subnet matching
   */
  private matchCidr(ip: string, cidr: string): boolean {
    if (!this.isValidIpAddress(ip)) {
      return false;
    }
    
    const [network, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    
    if (!this.isValidIpAddress(network) || isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    
    // Convert IPs to 32-bit integers for comparison
    const ipInt = this.ipToInt(ip);
    const networkInt = this.ipToInt(network);
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    
    return (ipInt & mask) === (networkInt & mask);
  }
  
  /**
   * Convert IPv4 address to 32-bit integer
   */
  private ipToInt(ip: string): number {
    const parts = ip.split('.').map(part => parseInt(part, 10));
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }
}

class SeverityFilter implements Filter {
  readonly name = 'severity';
  
  canHandle(node: QueryNode): boolean {
    return isFieldQuery(node) && node.field === 'severity';
  }
  
  apply(node: QueryNode, _context: FilterContext): FilterResult {
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
  
  apply(node: QueryNode, _context: FilterContext): FilterResult {
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
              process.stderr.write(`Applying ${filter.name} after existing filters\n`);
            }
            const intermediate = existingPostProcessing(items);
            const final = filterResult.postProcessing!(intermediate);
            if (context.debug) {
              process.stderr.write(`${filter.name}: ${items.length} → ${intermediate.length} → ${final.length} items\n`);
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