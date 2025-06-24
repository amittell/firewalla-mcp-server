export interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: Record<string, string>;
  timestamp: number;
  help?: string;
}

export class MetricsCollector {
  private metrics = new Map<string, Metric>();
  private histograms = new Map<string, number[]>();

  // Counter metrics
  incrementCounter(name: string, labels?: Record<string, string>, increment = 1): void {
    const key = this.createKey(name, labels);
    const existing = this.metrics.get(key);
    
    this.metrics.set(key, {
      name,
      value: (existing?.value || 0) + increment,
      type: 'counter',
      timestamp: Date.now(),
      ...(labels && { labels }),
    });
  }

  // Gauge metrics
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    
    this.metrics.set(key, {
      name,
      value,
      type: 'gauge',
      timestamp: Date.now(),
      ...(labels && { labels }),
    });
  }

  // Histogram metrics
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    
    const values = this.histograms.get(key)!;
    values.push(value);
    
    // Keep only last 1000 observations to prevent memory growth
    if (values.length > 1000) {
      values.shift();
    }
    
    // Calculate histogram statistics
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    
    this.metrics.set(key, {
      name,
      value: sum / count, // Mean as the primary value
      type: 'histogram',
      labels: {
        ...(labels || {}),
        count: count.toString(),
        p50: this.percentile(sorted, 0.5).toString(),
        p95: this.percentile(sorted, 0.95).toString(),
        p99: this.percentile(sorted, 0.99).toString(),
      },
      timestamp: Date.now(),
    });
  }

  // Timer helper for measuring durations
  startTimer(name: string, labels?: Record<string, string>): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.observeHistogram(name, duration, labels);
    };
  }

  // Get all metrics
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  // Get metrics in Prometheus format
  getPrometheusFormat(): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, Metric[]>();
    
    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }
    
    // Format each metric group
    for (const [name, metrics] of metricsByName) {
      const firstMetric = metrics[0];
      if (!firstMetric) {continue;}
      
      // Add help comment if available
      if (firstMetric.help) {
        lines.push(`# HELP ${name} ${firstMetric.help}`);
      }
      
      // Add type comment
      lines.push(`# TYPE ${name} ${firstMetric.type}`);
      
      // Add metric lines
      for (const metric of metrics) {
        const labelString = this.formatLabels(metric.labels);
        lines.push(`${name}${labelString} ${metric.value} ${metric.timestamp}`);
      }
      
      lines.push(''); // Empty line between metric groups
    }
    
    return lines.join('\\n');
  }

  // Clear all metrics (useful for testing)
  clear(): void {
    this.metrics.clear();
    this.histograms.clear();
  }

  // Get specific metric
  getMetric(name: string, labels?: Record<string, string>): Metric | undefined {
    const key = this.createKey(name, labels);
    return this.metrics.get(key);
  }

  private createKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }
    
    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `{${labelPairs}}`;
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) {return 0;}
    
    const index = Math.ceil(sortedArray.length * p) - 1;
    const value = sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
    return value ?? 0;
  }
}

// Pre-defined metrics for common use cases
export class FirewallaMetrics {
  constructor(/* eslint-disable-next-line no-unused-vars */ private collector: MetricsCollector) {}

  // API metrics
  recordApiRequest(method: string, endpoint: string, statusCode: number, duration: number): void {
    this.collector.incrementCounter('firewalla_api_requests_total', {
      method,
      endpoint,
      status_code: statusCode.toString(),
    });
    
    this.collector.observeHistogram('firewalla_api_request_duration_ms', duration, {
      method,
      endpoint,
    });
  }

  recordApiError(method: string, endpoint: string, errorType: string): void {
    this.collector.incrementCounter('firewalla_api_errors_total', {
      method,
      endpoint,
      error_type: errorType,
    });
  }

  // Cache metrics
  recordCacheOperation(operation: string, hit: boolean): void {
    this.collector.incrementCounter('firewalla_cache_operations_total', {
      operation,
      result: hit ? 'hit' : 'miss',
    });
  }

  setCacheSize(size: number): void {
    this.collector.setGauge('firewalla_cache_size', size);
  }

  // MCP metrics
  recordMcpRequest(type: string, name: string, duration: number, success: boolean): void {
    this.collector.incrementCounter('firewalla_mcp_requests_total', {
      type, // tool, resource, prompt
      name,
      success: success.toString(),
    });
    
    this.collector.observeHistogram('firewalla_mcp_request_duration_ms', duration, {
      type,
      name,
    });
  }

  // Security metrics
  recordSecurityEvent(eventType: string, severity: string): void {
    this.collector.incrementCounter('firewalla_security_events_total', {
      event_type: eventType,
      severity,
    });
  }

  recordRateLimitHit(clientId: string): void {
    this.collector.incrementCounter('firewalla_rate_limit_hits_total', {
      client_id: clientId,
    });
  }

  // System metrics
  recordMemoryUsage(heapUsed: number, heapTotal: number): void {
    this.collector.setGauge('firewalla_memory_heap_used_bytes', heapUsed);
    this.collector.setGauge('firewalla_memory_heap_total_bytes', heapTotal);
  }

  recordUptime(seconds: number): void {
    this.collector.setGauge('firewalla_uptime_seconds', seconds);
  }

  // Health check metrics
  recordHealthCheck(component: string, success: boolean, duration: number): void {
    this.collector.incrementCounter('firewalla_health_checks_total', {
      component,
      success: success.toString(),
    });
    
    this.collector.observeHistogram('firewalla_health_check_duration_ms', duration, {
      component,
    });
  }
}

// Global metrics instances
export const metricsCollector = new MetricsCollector();
export const firewallMetrics = new FirewallaMetrics(metricsCollector);