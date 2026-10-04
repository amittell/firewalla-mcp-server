/**
 * Minimal metrics helper – counts, timings – kept in memory.
 * Swappable later for StatsD/Prometheus without touching call-sites.
 */
declare class InMemoryMetrics {
    private counters;
    private timings;
    private readonly MAX_TIMING_VALUES;
    count(name: string, delta?: number): void;
    timing(name: string, value: number): void;
    snapshot(): {
        counters: {
            [k: string]: number;
        };
        timings: {
            [k: string]: {
                count: number;
                min: number;
                max: number;
                avg: number;
                p50: number;
                p95: number;
                p99: number;
            };
        };
    };
    clear(): void;
}
export declare const metrics: InMemoryMetrics;
export {};
//# sourceMappingURL=metrics.d.ts.map