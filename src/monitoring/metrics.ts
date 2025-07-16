/**
 * Minimal metrics helper – counts, timings – kept in memory.
 * Swappable later for StatsD/Prometheus without touching call-sites.
 */

// Tags parameter removed for simplification - kept for future StatsD/Prometheus compatibility

class InMemoryMetrics {
  private counters = new Map<string, number>();
  private timings = new Map<string, number[]>();
  private readonly MAX_TIMING_VALUES = 1000; // Limit to prevent memory leaks

  count(name: string, delta = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  timing(name: string, value: number): void {
    if (!this.timings.has(name)) {
      this.timings.set(name, []);
    }
    const values = this.timings.get(name)!;
    values.push(value);

    // Keep only the most recent values to prevent unbounded growth
    if (values.length > this.MAX_TIMING_VALUES) {
      values.splice(0, values.length - this.MAX_TIMING_VALUES);
    }
  }

  /* Exposed for health endpoint / tests */
  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      timings: Object.fromEntries(
        [...this.timings].map(([k, values]) => {
          const sorted = [...values].sort((a, b) => a - b);
          const count = values.length;

          return [
            k,
            {
              count,
              // Add basic statistics
              min: count > 0 ? sorted[0] : 0,
              max: count > 0 ? sorted[count - 1] : 0,
              avg: count > 0 ? values.reduce((a, b) => a + b, 0) / count : 0,
              p50: count > 0 ? sorted[Math.floor(count * 0.5)] : 0,
              p95: count > 0 ? sorted[Math.floor(count * 0.95)] : 0,
              p99: count > 0 ? sorted[Math.floor(count * 0.99)] : 0,
            },
          ];
        })
      ),
    };
  }

  /* Clear all metrics - useful for testing and debugging */
  clear(): void {
    this.counters.clear();
    this.timings.clear();
  }
}

export const metrics = new InMemoryMetrics();
