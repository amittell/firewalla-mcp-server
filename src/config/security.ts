import crypto from 'crypto';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import { logger } from '../monitoring/logger.js';

/**
 * Security policy configuration for Firewalla MCP Server
 */
export interface SecurityPolicy {
  /** Enable RBAC enforcement */
  enableRBAC: boolean;
  /** Enable audit logging */
  enableAuditLogging: boolean;
  /** Enable input sanitization */
  enableInputSanitization: boolean;
  /** Enable rate limiting */
  enableRateLimit: boolean;
  /** Enable origin validation */
  enableOriginValidation: boolean;
  /** Default box ID for convenience tools */
  defaultBoxId?: string;
  /** Require explicit box ID (no defaults) */
  requireExplicitBoxId: boolean;
  /** Maximum risk score for operations */
  maxRiskScore: number;
  /** Enable security warnings for broad-scope operations */
  enableScopeWarnings: boolean;
  /** Rate limit configuration */
  rateLimits: {
    default: number;
    sensitive: number;
    admin: number;
  };
  /** IP and domain validation settings */
  validation: {
    /** Validate IP addresses */
    validateIPs: boolean;
    /** Validate domain names */
    validateDomains: boolean;
    /** Block private IP ranges in certain contexts */
    blockPrivateIPs: boolean;
    /** Block localhost/loopback addresses */
    blockLoopback: boolean;
  };
}

/**
 * Default security policy - secure by default
 */
const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  enableRBAC: true,
  enableAuditLogging: true,
  enableInputSanitization: true,
  enableRateLimit: true,
  enableOriginValidation: true,
  requireExplicitBoxId: false, // Allow default for convenience
  maxRiskScore: 80,
  enableScopeWarnings: true,
  rateLimits: {
    default: 100,
    sensitive: 10,
    admin: 5,
  },
  validation: {
    validateIPs: true,
    validateDomains: true,
    blockPrivateIPs: false, // Allow private IPs for local network management
    blockLoopback: true,
  },
};

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

  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private securityPolicy: SecurityPolicy;

  constructor(policy?: Partial<SecurityPolicy>) {
    // Merge provided policy with defaults
    this.securityPolicy = { ...DEFAULT_SECURITY_POLICY, ...policy };

    // Initialize default box ID from environment if not provided
    if (!this.securityPolicy.defaultBoxId) {
      this.securityPolicy.defaultBoxId = process.env.FIREWALLA_DEFAULT_BOX_ID;
    }

    // Clean up old entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupRateLimits(),
      5 * 60 * 1000
    );

    // Log security policy initialization
    logger.info('SecurityManager initialized', {
      rbac_enabled: this.securityPolicy.enableRBAC,
      audit_enabled: this.securityPolicy.enableAuditLogging,
      input_sanitization: this.securityPolicy.enableInputSanitization,
      rate_limiting: this.securityPolicy.enableRateLimit,
      origin_validation: this.securityPolicy.enableOriginValidation,
      has_default_box_id: !!this.securityPolicy.defaultBoxId,
      max_risk_score: this.securityPolicy.maxRiskScore,
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
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
      .replace(/[<>"'&]/g, match => {
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
    const limit =
      operation === 'sensitive'
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
    if (!origin) {
      return true;
    } // Allow requests without origin (local tools)

    // Parse the origin URL to get hostname for secure validation
    try {
      const url = new URL(
        origin.startsWith('http') ? origin : `https://${origin}`
      );
      const { hostname } = url;

      return SecurityManager.ALLOWED_ORIGINS.some(allowed => {
        // For localhost, allow exact match and any port
        if (allowed === 'localhost') {
          return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1'
          );
        }

        // For other domains, require exact match or proper subdomain match
        if (allowed === 'claude.ai') {
          return hostname === 'claude.ai' || hostname.endsWith('.claude.ai');
        }

        // For claude-code (local application identifier), allow as-is
        if (allowed === 'claude-code') {
          return origin === 'claude-code';
        }

        // For any other allowed origins, require exact hostname match
        return hostname === allowed || hostname.endsWith(`.${allowed}`);
      });
    } catch {
      // If URL parsing fails, fall back to basic string validation for special cases
      return SecurityManager.ALLOWED_ORIGINS.some(allowed => {
        if (allowed === 'claude-code' && origin === 'claude-code') {
          return true;
        }
        return false; // Reject malformed origins
      });
    }
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

  validateEnvironmentVars(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const required = ['FIREWALLA_MSP_TOKEN', 'FIREWALLA_BOX_ID'];

    for (const envVar of required) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      } else if (process.env[envVar].length < 10) {
        errors.push(`Environment variable ${envVar} appears to be too short`);
      }
    }

    // Validate token format (basic check)
    const token = process.env.FIREWALLA_MSP_TOKEN;
    if (token && !/^[A-Za-z0-9_-]+$/.test(token)) {
      errors.push('FIREWALLA_MSP_TOKEN contains invalid characters');
    }

    // Check for FIREWALLA_DEFAULT_BOX_ID if convenience tools are used
    if (!process.env.FIREWALLA_DEFAULT_BOX_ID) {
      warnings.push(
        'FIREWALLA_DEFAULT_BOX_ID not set - convenience tools will require explicit box_id parameters'
      );
    } else {
      // Validate default box ID format
      const defaultBoxId = process.env.FIREWALLA_DEFAULT_BOX_ID;
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          defaultBoxId
        )
      ) {
        warnings.push(
          'FIREWALLA_DEFAULT_BOX_ID does not appear to be a valid UUID format'
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
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
    const timestamp = getCurrentTimestamp();
    const logEntry = {
      timestamp,
      event,
      details: this.sanitizeLogData(details),
    };

    // In production, this should go to a proper security log
    process.stderr.write(`SECURITY_EVENT: ${JSON.stringify(logEntry)}\\n`);
  }

  private sanitizeLogData(
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret')
      ) {
        sanitized[key] = this.maskSensitiveData(String(value));
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get current security policy
   */
  getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy };
  }

  /**
   * Update security policy
   */
  updateSecurityPolicy(updates: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...updates };
    logger.info('Security policy updated', updates);
  }

  /**
   * Validate IP address format and check against security policy
   */
  validateIPAddress(ip: string): {
    valid: boolean;
    error?: string;
    warning?: string;
  } {
    if (!this.securityPolicy.validation.validateIPs) {
      return { valid: true };
    }

    // Basic IPv4 format validation
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(ip)) {
      return { valid: false, error: 'Invalid IPv4 address format' };
    }

    // Check for private IP ranges if blocked
    if (this.securityPolicy.validation.blockPrivateIPs) {
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
      ];

      if (privateRanges.some(range => range.test(ip))) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }
    }

    // Check for loopback addresses if blocked
    if (this.securityPolicy.validation.blockLoopback) {
      if (ip === '127.0.0.1' || ip.startsWith('127.') || ip === '::1') {
        return { valid: false, error: 'Loopback addresses are not allowed' };
      }
    }

    // Warning for broadcast addresses
    if (ip.endsWith('.255') || ip === '255.255.255.255') {
      return {
        valid: true,
        warning: 'Broadcast address detected - verify this is intentional',
      };
    }

    return { valid: true };
  }

  /**
   * Validate domain name format and check against security policy
   */
  validateDomainName(domain: string): {
    valid: boolean;
    error?: string;
    warning?: string;
  } {
    if (!this.securityPolicy.validation.validateDomains) {
      return { valid: true };
    }

    // Basic domain format validation
    const domainRegex =
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain name format' };
    }

    // Check domain length
    if (domain.length > 253) {
      return {
        valid: false,
        error: 'Domain name too long (max 253 characters)',
      };
    }

    // Warning for localhost domains
    if (domain === 'localhost' || domain.endsWith('.localhost')) {
      return {
        valid: true,
        warning: 'Localhost domain detected - verify this is intentional',
      };
    }

    // Warning for wildcard domains
    if (domain.startsWith('*.')) {
      return {
        valid: true,
        warning:
          'Wildcard domain detected - ensure proper validation is in place',
      };
    }

    return { valid: true };
  }

  /**
   * Check if an operation is allowed based on security policy and risk score
   */
  isOperationAllowed(riskScore: number): { allowed: boolean; reason?: string } {
    if (riskScore > this.securityPolicy.maxRiskScore) {
      return {
        allowed: false,
        reason: `Operation risk score (${riskScore}) exceeds maximum allowed (${this.securityPolicy.maxRiskScore})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Generate security warning for broad-scope operations
   */
  generateScopeWarning(scope: string, operation: string): string | null {
    if (!this.securityPolicy.enableScopeWarnings) {
      return null;
    }

    if (scope === 'global') {
      return `WARNING: ${operation} will be applied globally to all devices. Consider using device-specific or group-specific scope for better security.`;
    }

    return null;
  }

  /**
   * Get default box ID for convenience tools
   */
  getDefaultBoxId(): string | undefined {
    return this.securityPolicy.defaultBoxId;
  }

  /**
   * Check if explicit box ID is required
   */
  requiresExplicitBoxId(): boolean {
    return this.securityPolicy.requireExplicitBoxId;
  }
}
