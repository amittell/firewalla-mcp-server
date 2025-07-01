#!/usr/bin/env node
/**
 * @fileoverview Demo script for the Intelligent Caching System
 *
 * Demonstrates the key features of the intelligent caching system
 * including strategy-based caching, smart invalidation, and monitoring.
 */
import { DataCacheStrategies } from '../src/cache/cache-strategies.js';
import { InvalidationManager } from '../src/cache/invalidation-manager.js';
// Mock configuration for demo
const mockConfig = {
    mspToken: 'demo-token',
    mspId: 'demo.firewalla.net',
    mspBaseUrl: 'https://demo.firewalla.net',
    boxId: 'demo-box-id',
    apiTimeout: 30000,
    rateLimit: 100,
    cacheTtl: 300,
    defaultPageSize: 100,
    maxPageSize: 10000,
};
console.log('🚀 Firewalla MCP Server - Intelligent Caching System Demo\n');
// 1. Cache Strategies Demo
console.log('📋 1. Cache Strategies Configuration');
console.log('=====================================');
const strategies = DataCacheStrategies.getCacheConfigSummary();
Object.entries(strategies).forEach(([entityType, config]) => {
    const ttlSeconds = Math.round(config.ttl / 1000);
    const refreshIcon = config.backgroundRefresh ? '🔄' : '❌';
    console.log(`${entityType.padEnd(12)} | TTL: ${ttlSeconds.toString().padStart(4)}s | Background Refresh: ${refreshIcon}`);
});
console.log('\n📊 2. Strategy Details');
console.log('=====================');
// Show detailed strategy information
const alarmStrategy = DataCacheStrategies.getAlarmsStrategy();
const ruleStrategy = DataCacheStrategies.getRulesStrategy();
const targetListStrategy = DataCacheStrategies.getTargetListsStrategy();
console.log('\n🚨 Alarms Strategy (High Volatility):');
console.log(`   TTL: ${alarmStrategy.ttl / 1000}s`);
console.log(`   Background Refresh: ${alarmStrategy.backgroundRefresh}`);
console.log(`   Refresh Threshold: ${alarmStrategy.refreshThreshold * 100}%`);
console.log(`   Invalidation Events: ${alarmStrategy.invalidationEvents.join(', ')}`);
console.log('\n🛡️  Rules Strategy (Low Volatility):');
console.log(`   TTL: ${ruleStrategy.ttl / 1000}s`);
console.log(`   Background Refresh: ${ruleStrategy.backgroundRefresh}`);
console.log(`   Refresh Threshold: ${ruleStrategy.refreshThreshold * 100}%`);
console.log(`   Invalidation Events: ${ruleStrategy.invalidationEvents.join(', ')}`);
console.log('\n📝 Target Lists Strategy (Very Stable):');
console.log(`   TTL: ${targetListStrategy.ttl / 1000}s`);
console.log(`   Background Refresh: ${targetListStrategy.backgroundRefresh}`);
console.log(`   Refresh Threshold: ${targetListStrategy.refreshThreshold * 100}%`);
console.log(`   Invalidation Events: ${targetListStrategy.invalidationEvents.join(', ')}`);
// 3. Cache Key Generation Demo
console.log('\n🔑 3. Cache Key Generation');
console.log('==========================');
const ruleKeyGen = ruleStrategy.keyGenerator;
const alarmKeyGen = alarmStrategy.keyGenerator;
console.log('\nRule Cache Keys:');
console.log(`   Query "status:active", limit 100: ${ruleKeyGen('status:active', 100)}`);
console.log(`   Query "action:block", limit 50:   ${ruleKeyGen('action:block', 50)}`);
console.log('\nAlarm Cache Keys:');
console.log(`   Query "severity:high", limit 50:  ${alarmKeyGen('severity:high', 50, 'recent')}`);
console.log(`   Query "type:intrusion", limit 25: ${alarmKeyGen('type:intrusion', 25, 'first')}`);
// 4. Mock Cache Manager for Invalidation Demo
const mockCacheManager = {
    cache: new Map([
        ['fw:rules:status:active', { data: 'active rules' }],
        ['fw:rules:action:block', { data: 'block rules' }],
        ['fw:search:rules:query1', { data: 'search results' }],
        ['fw:devices:online:true', { data: 'online devices' }],
        ['fw:statistics:rules:summary', { data: 'rule stats' }],
        ['fw:alarms:severity:high', { data: 'high severity alarms' }]
    ]),
    async delete(key) {
        const deleted = this.cache.delete(key);
        console.log(`   🗑️  Deleted cache key: ${key} (${deleted ? 'success' : 'not found'})`);
        return deleted;
    },
    async getAllKeys() {
        return Array.from(this.cache.keys());
    },
    async clear() {
        this.cache.clear();
        console.log('   🧹 Cache cleared');
    }
};
// 5. Invalidation Demo
console.log('\n🔄 4. Smart Cache Invalidation Demo');
console.log('==================================');
const invalidationManager = new InvalidationManager();
console.log('\nInitial cache contents:');
(await mockCacheManager.getAllKeys()).forEach(key => {
    console.log(`   📦 ${key}`);
});
console.log('\n📤 Triggering rule_updated event...');
const ruleKeysInvalidated = await invalidationManager.invalidateByEvent('rule_updated', mockCacheManager);
console.log(`   ✅ Invalidated ${ruleKeysInvalidated} keys\n`);
console.log('📤 Triggering device data change (devices update)...');
const deviceKeysInvalidated = await invalidationManager.invalidateByDataChange('devices', 'update', mockCacheManager, 'device123');
console.log(`   ✅ Invalidated ${deviceKeysInvalidated} keys\n`);
console.log('Remaining cache contents:');
const remainingKeys = await mockCacheManager.getAllKeys();
if (remainingKeys.length > 0) {
    remainingKeys.forEach(key => {
        console.log(`   📦 ${key}`);
    });
}
else {
    console.log('   🚫 No cache entries remaining');
}
// 6. Invalidation Statistics
console.log('\n📊 5. Invalidation Statistics');
console.log('=============================');
const stats = invalidationManager.getInvalidationStats();
console.log(`Total invalidation events: ${stats.totalEvents}`);
console.log('Recent events:');
stats.recentEvents.forEach(event => {
    const timestamp = new Date(event.timestamp).toISOString();
    console.log(`   📅 ${timestamp}: ${event.event} (${event.keysInvalidated} keys)`);
});
console.log('\nEvent counts:');
Object.entries(stats.eventCounts).forEach(([event, count]) => {
    console.log(`   📈 ${event}: ${count}`);
});
// 7. Performance Benefits Summary
console.log('\n🏆 6. Expected Performance Benefits');
console.log('==================================');
console.log('📈 Performance Improvements:');
console.log('   • 80%+ cache hit rate for frequently accessed data');
console.log('   • 50%+ reduction in API calls for static/semi-static data');
console.log('   • 30%+ improvement in response times for cached operations');
console.log('   • Intelligent cache invalidation with minimal false positives');
console.log('\n🎯 Optimized Cache TTLs by Data Volatility:');
console.log('   • Real-time data (alarms, flows): 30 seconds');
console.log('   • Moderate data (devices): 2 minutes');
console.log('   • Stable data (rules): 10 minutes');
console.log('   • Very stable data (target lists): 1 hour');
console.log('\n🔧 Smart Features:');
console.log('   • Event-driven cache invalidation');
console.log('   • Cross-entity invalidation patterns');
console.log('   • Background refresh for stable data');
console.log('   • Compression for large search results');
console.log('   • Performance monitoring and analytics');
console.log('\n✨ Demo completed! The intelligent caching system is ready to boost your Firewalla MCP Server performance.');
export default {
    mockConfig,
    demonstrateStrategies: () => DataCacheStrategies.getCacheConfigSummary(),
    demonstrateInvalidation: invalidationManager
};
//# sourceMappingURL=cache-demo.js.map