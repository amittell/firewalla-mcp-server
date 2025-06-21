import { SecurityManager } from '../../src/config/security';

describe('SecurityManager', () => {
  let security: SecurityManager;

  beforeEach(() => {
    security = new SecurityManager();
  });

  describe('validateInput', () => {
    it('should accept safe strings', () => {
      expect(security.validateInput('safe string')).toBe(true);
      expect(security.validateInput('user@example.com')).toBe(true);
      expect(security.validateInput('192.168.1.1')).toBe(true);
    });

    it('should reject dangerous patterns', () => {
      expect(security.validateInput('<script>alert("xss")</script>')).toBe(false);
      expect(security.validateInput('javascript:void(0)')).toBe(false);
      expect(security.validateInput('onclick=malicious()')).toBe(false);
      expect(security.validateInput('SELECT * FROM users')).toBe(false);
      expect(security.validateInput('$(document).ready')).toBe(false);
    });

    it('should accept non-string input', () => {
      expect(security.validateInput(123)).toBe(true);
      expect(security.validateInput({ key: 'value' })).toBe(true);
      expect(security.validateInput(null)).toBe(true);
    });
  });

  describe('sanitizeString', () => {
    it('should escape HTML entities', () => {
      expect(security.sanitizeString('<div>test</div>')).toBe('&lt;div&gt;test&lt;/div&gt;');
      expect(security.sanitizeString('test "quotes" & ampersand')).toBe('test &quot;quotes&quot; &amp; ampersand');
      expect(security.sanitizeString("test 'single' quotes")).toBe('test &#39;single&#39; quotes');
    });

    it('should trim whitespace', () => {
      expect(security.sanitizeString('  test  ')).toBe('test');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      expect(security.checkRateLimit('client1')).toBe(true);
      expect(security.checkRateLimit('client1')).toBe(true);
    });

    it('should block requests exceeding rate limit', () => {
      const clientId = 'heavy-client';
      
      // Exceed the rate limit
      for (let i = 0; i < 102; i++) {
        security.checkRateLimit(clientId);
      }
      
      expect(security.checkRateLimit(clientId)).toBe(false);
    });

    it('should handle sensitive operations with lower limits', () => {
      const clientId = 'sensitive-client';
      
      // Fill up sensitive operation limit (10)
      for (let i = 0; i < 10; i++) {
        expect(security.checkRateLimit(clientId, 'sensitive')).toBe(true);
      }
      
      expect(security.checkRateLimit(clientId, 'sensitive')).toBe(false);
    });

    it('should reset rate limits after time window', () => {
      const clientId = 'time-test-client';
      
      // Mock time progression
      const originalDateNow = Date.now;
      let mockTime = 1000000;
      Date.now = jest.fn(() => mockTime);
      
      // Fill rate limit
      for (let i = 0; i < 100; i++) {
        security.checkRateLimit(clientId);
      }
      expect(security.checkRateLimit(clientId)).toBe(false);
      
      // Advance time by 61 seconds
      mockTime += 61000;
      expect(security.checkRateLimit(clientId)).toBe(true);
      
      Date.now = originalDateNow;
    });
  });

  describe('validateOrigin', () => {
    it('should allow valid origins', () => {
      expect(security.validateOrigin('https://claude.ai')).toBe(true);
      expect(security.validateOrigin('claude-code')).toBe(true);
      expect(security.validateOrigin('localhost:3000')).toBe(true);
      expect(security.validateOrigin(undefined)).toBe(true);
    });

    it('should reject invalid origins', () => {
      expect(security.validateOrigin('https://malicious.com')).toBe(false);
      expect(security.validateOrigin('evil-site.net')).toBe(false);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask long strings correctly', () => {
      expect(security.maskSensitiveData('abcdefghijklmnop', 4)).toBe('abcd********mnop');
      expect(security.maskSensitiveData('secret123456', 2)).toBe('se********56');
    });

    it('should mask short strings completely', () => {
      expect(security.maskSensitiveData('abc', 4)).toBe('***');
      expect(security.maskSensitiveData('short')).toBe('*****');
    });
  });

  describe('validateEnvironmentVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should validate required environment variables', () => {
      process.env.FIREWALLA_MSP_TOKEN = 'valid-token-123456789';
      process.env.FIREWALLA_BOX_ID = 'valid-box-id-123';

      const result = security.validateEnvironmentVars();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing environment variables', () => {
      delete process.env.FIREWALLA_MSP_TOKEN;
      delete process.env.FIREWALLA_BOX_ID;

      const result = security.validateEnvironmentVars();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required environment variable: FIREWALLA_MSP_TOKEN');
      expect(result.errors).toContain('Missing required environment variable: FIREWALLA_BOX_ID');
    });

    it('should detect short environment variables', () => {
      process.env.FIREWALLA_MSP_TOKEN = 'short';
      process.env.FIREWALLA_BOX_ID = 'short';

      const result = security.validateEnvironmentVars();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Environment variable FIREWALLA_MSP_TOKEN appears to be too short');
      expect(result.errors).toContain('Environment variable FIREWALLA_BOX_ID appears to be too short');
    });

    it('should detect invalid token format', () => {
      process.env.FIREWALLA_MSP_TOKEN = 'invalid@token#format!';
      process.env.FIREWALLA_BOX_ID = 'valid-box-id-123';

      const result = security.validateEnvironmentVars();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('FIREWALLA_MSP_TOKEN contains invalid characters');
    });
  });

  describe('createSecureHeaders', () => {
    it('should create comprehensive security headers', () => {
      const headers = security.createSecureHeaders();
      
      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
      expect(headers).toHaveProperty('X-Frame-Options', 'DENY');
      expect(headers).toHaveProperty('X-XSS-Protection', '1; mode=block');
      expect(headers).toHaveProperty('Strict-Transport-Security');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });
  });

  describe('logSecurityEvent', () => {
    let originalStderrWrite: typeof process.stderr.write;
    let loggedMessages: string[];

    beforeEach(() => {
      loggedMessages = [];
      originalStderrWrite = process.stderr.write;
      process.stderr.write = jest.fn((message: string) => {
        loggedMessages.push(message);
        return true;
      });
    });

    afterEach(() => {
      process.stderr.write = originalStderrWrite;
    });

    it('should log security events with sanitized data', () => {
      security.logSecurityEvent('test_event', {
        user: 'testuser',
        token: 'secret-token-123',
        action: 'login',
      });

      expect(loggedMessages).toHaveLength(1);
      const logEntry = JSON.parse(loggedMessages[0].replace('SECURITY_EVENT: ', ''));
      
      expect(logEntry.event).toBe('test_event');
      expect(logEntry.details.user).toBe('testuser');
      expect(logEntry.details.token).toMatch(/\*+/); // Should be masked
      expect(logEntry.details.action).toBe('login');
    });
  });

  describe('hashSensitiveData', () => {
    it('should produce consistent hashes', () => {
      const data = 'sensitive-data-123';
      const hash1 = security.hashSensitiveData(data);
      const hash2 = security.hashSensitiveData(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 character hex string
      expect(hash1).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = security.hashSensitiveData('data1');
      const hash2 = security.hashSensitiveData('data2');
      
      expect(hash1).not.toBe(hash2);
    });
  });
});