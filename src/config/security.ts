import crypto from 'crypto';

export class SecurityManager {
  private static readonly ALLOWED_ORIGINS = [
    'claude.ai',
    'claude-code',
    'localhost',
  ];

  private static readonly RATE_LIMITS = {
    DEFAULT: 100, // requests per minute
    SENSITIVE: 10, // requests per minute for sensitive operations
  };

  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  constructor() {
    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanupRateLimits(), 5 * 60 * 1000);
  }

  validateInput(input: unknown): boolean {
    if (typeof input === 'string') {
      // Check for common injection patterns
      const dangerousPatterns = [
        /<script\b/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /\$\(/,
        /`[^`]*`/,
        /(union|select|insert|update|delete|drop|create|alter)\s+/i,
      ];

      return !dangerousPatterns.some(pattern => pattern.test(input));
    }

    return true;
  }

  sanitizeString(input: string): string {
    return input
      .replace(/[<>\"'&]/g, (match) => {
        const map: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
          '&': '&amp;',
        };
        return map[match] || match;
      })
      .trim();
  }

  checkRateLimit(clientId: string, operation = 'default'): boolean {
    const limit = operation === 'sensitive' 
      ? SecurityManager.RATE_LIMITS.SENSITIVE 
      : SecurityManager.RATE_LIMITS.DEFAULT;

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    const key = `${clientId}:${operation}`;
    const current = this.requestCounts.get(key);

    if (!current || current.resetTime < windowStart) {
      this.requestCounts.set(key, { count: 1, resetTime: now });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count++;
    return true;
  }

  private cleanupRateLimits(): void {
    const cutoff = Date.now() - 60000; // 1 minute ago
    
    for (const [key, value] of this.requestCounts.entries()) {
      if (value.resetTime < cutoff) {
        this.requestCounts.delete(key);
      }
    }
  }

  validateOrigin(origin?: string): boolean {
    if (!origin) return true; // Allow requests without origin (local tools)
    
    return SecurityManager.ALLOWED_ORIGINS.some(allowed => 
      origin.includes(allowed)
    );
  }

  hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  maskSensitiveData(data: string, showChars = 4): string {
    if (data.length <= showChars * 2) {
      return '*'.repeat(data.length);
    }
    
    const start = data.substring(0, showChars);
    const end = data.substring(data.length - showChars);
    const middle = '*'.repeat(data.length - showChars * 2);
    
    return `${start}${middle}${end}`;
  }

  validateEnvironmentVars(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const required = ['FIREWALLA_MSP_TOKEN', 'FIREWALLA_BOX_ID'];
    
    for (const envVar of required) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      } else if (process.env[envVar]!.length < 10) {
        errors.push(`Environment variable ${envVar} appears to be too short`);
      }
    }

    // Validate token format (basic check)
    const token = process.env.FIREWALLA_MSP_TOKEN;
    if (token && !/^[A-Za-z0-9_-]+$/.test(token)) {
      errors.push('FIREWALLA_MSP_TOKEN contains invalid characters');
    }

    return { valid: errors.length === 0, errors };
  }

  createSecureHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; script-src 'none';",
    };
  }

  logSecurityEvent(event: string, details: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      details: this.sanitizeLogData(details),
    };

    // In production, this should go to a proper security log
    process.stderr.write(`SECURITY_EVENT: ${JSON.stringify(logEntry)}\\n`);
  }

  private sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret')) {
        sanitized[key] = this.maskSensitiveData(String(value));
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}