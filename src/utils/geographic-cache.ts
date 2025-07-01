/**
 * Geographic cache management for IP geolocation lookups
 * Provides efficient caching with LRU eviction and TTL management
 */

import { GeographicData } from '../types.js';

export interface GeographicCacheEntry {
  data: GeographicData | null;
  timestamp: number;
}

export interface GeographicCacheConfig {
  maxSize: number;
  ttlMs: number;
  enableStats: boolean;
}

export interface GeographicCacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

export class GeographicCache {
  private cache = new Map<string, GeographicCacheEntry>();
  private config: GeographicCacheConfig;
  private stats = {
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
  };

  constructor(config: Partial<GeographicCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 10000,
      ttlMs: config.ttlMs || 3600000, // 1 hour default
      enableStats: config.enableStats || process.env.NODE_ENV === 'development',
    };
  }

  /**
   * Get geographic data from cache if available and not expired
   */
  get(ip: string): GeographicData | null | undefined {
    const entry = this.cache.get(ip);
    if (!entry) {
      if (this.config.enableStats) {
        this.stats.missCount++;
      }
      return undefined; // Not found in cache
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(ip);
      if (this.config.enableStats) {
        this.stats.missCount++;
      }
      return undefined; // Expired
    }

    // Move to end (LRU behavior)
    this.cache.delete(ip);
    this.cache.set(ip, entry);

    if (this.config.enableStats) {
      this.stats.hitCount++;
    }

    return entry.data;
  }

  /**
   * Set geographic data in cache
   */
  set(ip: string, data: GeographicData | null): void {
    // Remove oldest entries if at capacity
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        if (this.config.enableStats) {
          this.stats.evictionCount++;
        }
      }
    }

    this.cache.set(ip, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if IP is in cache (regardless of expiration)
   */
  has(ip: string): boolean {
    return this.cache.has(ip);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): GeographicCacheStats {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate: totalRequests > 0 ? this.stats.hitCount / totalRequests : 0,
      evictionCount: this.stats.evictionCount,
    };
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [ip, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(ip);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Get current configuration
   */
  getConfig(): GeographicCacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<GeographicCacheConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };

    // If max size reduced, remove excess entries
    if (this.cache.size > this.config.maxSize) {
      const entriesToRemove = this.cache.size - this.config.maxSize;
      const entries = Array.from(this.cache.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(entries[i]);
        if (this.config.enableStats) {
          this.stats.evictionCount++;
        }
      }
    }
  }
}