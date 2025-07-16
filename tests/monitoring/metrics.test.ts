import { metrics } from '../../src/monitoring/metrics.js';

describe('InMemoryMetrics', () => {
  beforeEach(() => {
    // Clear metrics before each test
    metrics.clear();
  });

  describe('count', () => {
    it('should increment counter by 1 by default', () => {
      metrics.count('test.counter');
      const snapshot = metrics.snapshot();
      expect(snapshot.counters['test.counter']).toBe(1);
    });

    it('should increment counter by specified delta', () => {
      metrics.count('test.counter', 5);
      const snapshot = metrics.snapshot();
      expect(snapshot.counters['test.counter']).toBe(5);
    });

    it('should accumulate multiple counts', () => {
      metrics.count('test.counter', 2);
      metrics.count('test.counter', 3);
      metrics.count('test.counter');
      const snapshot = metrics.snapshot();
      expect(snapshot.counters['test.counter']).toBe(6);
    });

    it('should handle multiple different counters', () => {
      metrics.count('counter1', 1);
      metrics.count('counter2', 2);
      const snapshot = metrics.snapshot();
      expect(snapshot.counters['counter1']).toBe(1);
      expect(snapshot.counters['counter2']).toBe(2);
    });
  });

  describe('timing', () => {
    it('should record single timing', () => {
      metrics.timing('test.timing', 100);
      const snapshot = metrics.snapshot();
      expect(snapshot.timings['test.timing']).toEqual({ count: 1 });
    });

    it('should record multiple timings', () => {
      metrics.timing('test.timing', 100);
      metrics.timing('test.timing', 200);
      metrics.timing('test.timing', 300);
      const snapshot = metrics.snapshot();
      expect(snapshot.timings['test.timing']).toEqual({ count: 3 });
    });

    it('should handle multiple different timings', () => {
      metrics.timing('timing1', 100);
      metrics.timing('timing2', 200);
      metrics.timing('timing2', 300);
      const snapshot = metrics.snapshot();
      expect(snapshot.timings['timing1']).toEqual({ count: 1 });
      expect(snapshot.timings['timing2']).toEqual({ count: 2 });
    });
  });

  describe('snapshot', () => {
    it('should return empty snapshot when no metrics recorded', () => {
      const snapshot = metrics.snapshot();
      expect(snapshot).toEqual({
        counters: {},
        timings: {}
      });
    });

    it('should return complete snapshot with mixed metrics', () => {
      metrics.count('counter1', 10);
      metrics.count('counter2', 20);
      metrics.timing('timing1', 100);
      metrics.timing('timing1', 200);
      
      const snapshot = metrics.snapshot();
      expect(snapshot).toEqual({
        counters: {
          counter1: 10,
          counter2: 20
        },
        timings: {
          timing1: { count: 2 }
        }
      });
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      metrics.count('counter', 5);
      metrics.timing('timing', 100);
      
      metrics.clear();
      
      const snapshot = metrics.snapshot();
      expect(snapshot).toEqual({
        counters: {},
        timings: {}
      });
    });
  });
});