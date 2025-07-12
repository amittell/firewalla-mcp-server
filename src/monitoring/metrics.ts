/**
 * Minimal metrics helper – counts, timings – kept in memory.
 * Swappable later for StatsD/Prometheus without touching call-sites.
 */

type Tags = Record<string, string | number | boolean>;

class InMemoryMetrics {
  private counters = new Map<string, number>();
  private timings = new Map<string, number[]>();

  count(name: string, delta = 1, _tags?: Tags): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  timing(name: string, value: number, _tags?: Tags): void {
    if (!this.timings.has(name)) {
      this.timings.set(name, []);
    }
    this.timings.get(name)!.push(value);
  }

  /* Exposed for health endpoint / tests */
  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      timings: Object.fromEntries(
        [...this.timings].map(([k, v]) => [k, { count: v.length }])
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
