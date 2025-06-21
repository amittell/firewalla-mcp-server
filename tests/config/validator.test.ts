import { ConfigValidator } from '../../src/config/validator';
import { FirewallaConfig } from '../../src/types';

describe('ConfigValidator', () => {
  describe('validateConfig', () => {
    let validConfig: FirewallaConfig;

    beforeEach(() => {
      validConfig = {
        mspToken: 'valid-token-1234567890abcdef',
        mspBaseUrl: 'https://msp.firewalla.com',
        boxId: 'valid-box-id-123',
        apiTimeout: 30000,
        rateLimit: 100,
        cacheTtl: 300,
      };
    });

    it('should validate a correct configuration', () => {
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing MSP token', () => {
      validConfig.mspToken = '';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MSP token is required');
    });

    it('should warn about short MSP token', () => {
      validConfig.mspToken = 'short';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('MSP token appears to be shorter than expected');
    });

    it('should detect invalid MSP token characters', () => {
      validConfig.mspToken = 'invalid@token#with$symbols!';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MSP token contains invalid characters');
    });

    it('should detect invalid MSP base URL', () => {
      validConfig.mspBaseUrl = 'not-a-url';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MSP base URL is not a valid URL');
    });

    it('should warn about HTTP in production', () => {
      validConfig.mspBaseUrl = 'http://production.api.com';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('Using HTTP instead of HTTPS for production API');
    });

    it('should accept HTTP for localhost', () => {
      validConfig.mspBaseUrl = 'http://localhost:3000';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).not.toContain('Using HTTP instead of HTTPS for production API');
    });

    it('should detect missing box ID', () => {
      validConfig.boxId = '';
      const result = ConfigValidator.validateConfig(validConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box ID is required');
    });

    it('should validate API timeout bounds', () => {
      validConfig.apiTimeout = 0;
      let result = ConfigValidator.validateConfig(validConfig);
      expect(result.errors).toContain('API timeout must be greater than 0');

      validConfig.apiTimeout = 4000;
      result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('API timeout is very low, may cause timeouts');

      validConfig.apiTimeout = 70000;
      result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('API timeout is very high, may cause delays');
    });

    it('should validate rate limit bounds', () => {
      validConfig.rateLimit = 0;
      let result = ConfigValidator.validateConfig(validConfig);
      expect(result.errors).toContain('Rate limit must be greater than 0');

      validConfig.rateLimit = 1500;
      result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('Rate limit is very high, may exceed API limits');
    });

    it('should validate cache TTL bounds', () => {
      validConfig.cacheTtl = -1;
      let result = ConfigValidator.validateConfig(validConfig);
      expect(result.errors).toContain('Cache TTL cannot be negative');

      validConfig.cacheTtl = 4000;
      result = ConfigValidator.validateConfig(validConfig);
      expect(result.warnings).toContain('Cache TTL is over 1 hour, data may become stale');
    });
  });

  describe('validateToolArguments', () => {
    it('should validate get_active_alarms arguments', () => {
      let result = ConfigValidator.validateToolArguments('get_active_alarms', {
        severity: 'high',
        limit: 25,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validateToolArguments('get_active_alarms', {
        severity: 'invalid',
      });
      expect(result.errors).toContain('Invalid severity level');

      result = ConfigValidator.validateToolArguments('get_active_alarms', {
        limit: 150,
      });
      expect(result.errors).toContain('Limit must be a number between 1 and 100');
    });

    it('should validate get_flow_data arguments', () => {
      let result = ConfigValidator.validateToolArguments('get_flow_data', {
        start_time: '2023-01-01T00:00:00.000Z',
        end_time: '2023-01-01T23:59:59.000Z',
        limit: 50,
        page: 2,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validateToolArguments('get_flow_data', {
        start_time: 'invalid-date',
      });
      expect(result.errors).toContain('start_time must be a valid ISO 8601 date');

      result = ConfigValidator.validateToolArguments('get_flow_data', {
        page: 0,
      });
      expect(result.errors).toContain('Page must be a number greater than 0');
    });

    it('should validate get_bandwidth_usage arguments', () => {
      let result = ConfigValidator.validateToolArguments('get_bandwidth_usage', {
        period: '24h',
        top: 10,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validateToolArguments('get_bandwidth_usage', {});
      expect(result.errors).toContain('Period is required');

      result = ConfigValidator.validateToolArguments('get_bandwidth_usage', {
        period: 'invalid',
      });
      expect(result.errors).toContain('Period must be one of: 1h, 24h, 7d, 30d');

      result = ConfigValidator.validateToolArguments('get_bandwidth_usage', {
        period: '24h',
        top: 100,
      });
      expect(result.errors).toContain('Top must be a number between 1 and 50');
    });

    it('should validate pause_rule arguments', () => {
      let result = ConfigValidator.validateToolArguments('pause_rule', {
        rule_id: 'rule-123',
        duration: 60,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validateToolArguments('pause_rule', {});
      expect(result.errors).toContain('Rule ID is required');

      result = ConfigValidator.validateToolArguments('pause_rule', {
        rule_id: 'rule-123',
        duration: 2000,
      });
      expect(result.errors).toContain('Duration must be a number between 1 and 1440 minutes');
    });

    it('should validate get_target_lists arguments', () => {
      let result = ConfigValidator.validateToolArguments('get_target_lists', {
        list_type: 'cloudflare',
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validateToolArguments('get_target_lists', {
        list_type: 'invalid',
      });
      expect(result.errors).toContain('List type must be one of: cloudflare, crowdsec, all');
    });
  });

  describe('validateResourceURI', () => {
    it('should validate correct resource URIs', () => {
      const validURIs = [
        'firewalla://summary',
        'firewalla://devices',
        'firewalla://metrics/security',
        'firewalla://topology',
        'firewalla://threats/recent',
      ];

      validURIs.forEach(uri => {
        const result = ConfigValidator.validateResourceURI(uri);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid resource URIs', () => {
      const result = ConfigValidator.validateResourceURI('firewalla://invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid resource URI: firewalla://invalid');
    });
  });

  describe('validatePromptArguments', () => {
    it('should validate security_report arguments', () => {
      let result = ConfigValidator.validatePromptArguments('security_report', {
        period: '24h',
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validatePromptArguments('security_report', {
        period: 'invalid',
      });
      expect(result.errors).toContain('Period must be one of: 24h, 7d, 30d');
    });

    it('should validate threat_analysis arguments', () => {
      let result = ConfigValidator.validatePromptArguments('threat_analysis', {
        severity_threshold: 'high',
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validatePromptArguments('threat_analysis', {
        severity_threshold: 'low',
      });
      expect(result.errors).toContain('Severity threshold must be one of: medium, high, critical');
    });

    it('should validate bandwidth_analysis arguments', () => {
      let result = ConfigValidator.validatePromptArguments('bandwidth_analysis', {
        period: '24h',
        threshold_mb: 100,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validatePromptArguments('bandwidth_analysis', {});
      expect(result.errors).toContain('Period is required');

      result = ConfigValidator.validatePromptArguments('bandwidth_analysis', {
        period: '24h',
        threshold_mb: -5,
      });
      expect(result.errors).toContain('Threshold MB must be a positive number');
    });

    it('should validate device_investigation arguments', () => {
      let result = ConfigValidator.validatePromptArguments('device_investigation', {
        device_id: 'device-123',
        lookback_hours: 48,
      });
      expect(result.valid).toBe(true);

      result = ConfigValidator.validatePromptArguments('device_investigation', {});
      expect(result.errors).toContain('Device ID is required');

      result = ConfigValidator.validatePromptArguments('device_investigation', {
        device_id: 'device-123',
        lookback_hours: 200,
      });
      expect(result.errors).toContain('Lookback hours must be between 1 and 168 (7 days)');
    });

    it('should validate network_health_check arguments', () => {
      const result = ConfigValidator.validatePromptArguments('network_health_check', {});
      expect(result.valid).toBe(true);
    });

    it('should reject unknown prompts', () => {
      const result = ConfigValidator.validatePromptArguments('unknown_prompt', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown prompt: unknown_prompt');
    });
  });
});