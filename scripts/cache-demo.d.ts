#!/usr/bin/env node
/**
 * @fileoverview Demo script for the Intelligent Caching System
 *
 * Demonstrates the key features of the intelligent caching system
 * including strategy-based caching, smart invalidation, and monitoring.
 */
import { InvalidationManager } from '../src/cache/invalidation-manager.js';
declare const _default: {
    mockConfig: {
        mspToken: string;
        mspId: string;
        mspBaseUrl: string;
        boxId: string;
        apiTimeout: number;
        rateLimit: number;
        cacheTtl: number;
        defaultPageSize: number;
        maxPageSize: number;
    };
    demonstrateStrategies: () => Record<import("../src/cache/cache-strategies.js").EntityType, {
        ttl: number;
        backgroundRefresh: boolean;
    }>;
    demonstrateInvalidation: InvalidationManager;
};
export default _default;
//# sourceMappingURL=cache-demo.d.ts.map