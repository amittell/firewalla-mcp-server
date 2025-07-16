/**
 * @fileoverview Role-Based Access Control (RBAC) System for Firewalla MCP Server
 *
 * Implements comprehensive RBAC with inheritance for convenience tools,
 * preventing privilege escalation and ensuring enterprise-grade security.
 *
 * Key Features:
 * - Permission inheritance mapping convenience tools to core tools
 * - Audit logging with correlation IDs for compliance
 * - Zero-trust security model with explicit permission grants
 * - Defense in depth with multiple validation layers
 *
 * @version 1.0.0
 * @since 2024-01-15
 */

import crypto from 'crypto';
import { getCurrentTimestamp } from '../utils/timestamp.js';
import { logger } from '../monitoring/logger.js';

/**
 * Permission levels in order of increasing privilege
 */
export enum PermissionLevel {
  NONE = 0,
  READ = 1,
  WRITE = 2,
  ADMIN = 3,
}

/**
 * Core tool categories for permission organization
 */
export enum ToolCategory {
  SECURITY = 'security',
  NETWORK = 'network',
  DEVICE = 'device',
  RULE_MANAGEMENT = 'rule_management',
  ANALYTICS = 'analytics',
  SYSTEM = 'system',
}

/**
 * Individual permission for a specific operation
 */
export interface Permission {
  /** Unique permission identifier */
  id: string;
  /** Human-readable permission name */
  name: string;
  /** Detailed permission description */
  description: string;
  /** Required permission level */
  level: PermissionLevel;
  /** Tool category this permission belongs to */
  category: ToolCategory;
  /** Core tool this permission controls */
  coreTool: string;
  /** Whether this permission is sensitive (requires extra validation) */
  sensitive?: boolean;
  /** Scope limitations for this permission */
  scope?: {
    /** Global scope allowed */
    global?: boolean;
    /** Device-specific scope allowed */
    device?: boolean;
    /** Group scope allowed */
    group?: boolean;
    /** Network scope allowed */
    network?: boolean;
  };
}

/**
 * Role definition with associated permissions
 */
export interface Role {
  /** Role identifier */
  id: string;
  /** Role display name */
  name: string;
  /** Role description */
  description: string;
  /** Permissions granted to this role */
  permissions: string[];
  /** Whether this role can be inherited by other roles */
  inheritable?: boolean;
  /** Maximum scope this role can operate on */
  maxScope?: 'device' | 'group' | 'network' | 'global';
}

/**
 * User context for permission checks
 */
export interface UserContext {
  /** User identifier */
  userId: string;
  /** Assigned roles */
  roles: string[];
  /** Session identifier */
  sessionId?: string;
  /** Client origin */
  origin?: string;
  /** Additional user attributes */
  attributes?: Record<string, any>;
}

/**
 * Audit log entry for security compliance
 */
export interface AuditLogEntry {
  /** Unique correlation ID for tracking */
  correlationId: string;
  /** Timestamp of the event */
  timestamp: string;
  /** User who performed the action */
  userId: string;
  /** Action that was performed */
  action: string;
  /** Tool that was called */
  tool: string;
  /** Core tools that were accessed */
  coreTools: string[];
  /** Convenience tool that was used (if applicable) */
  convenienceTool?: string;
  /** Required permissions for the action */
  requiredPermissions: string[];
  /** Whether access was granted */
  accessGranted: boolean;
  /** Reason for access denial (if applicable) */
  denialReason?: string;
  /** Tool parameters (sanitized) */
  parameters: Record<string, any>;
  /** Session information */
  session?: {
    sessionId: string;
    origin?: string;
    userAgent?: string;
  };
  /** Security risk score (0-100) */
  riskScore: number;
}

/**
 * RBAC configuration and permission definitions
 */
export class RBACConfiguration {
  /** Core permission definitions */
  private static readonly PERMISSIONS: Record<string, Permission> = {
    // Security permissions
    'security.alarms.read': {
      id: 'security.alarms.read',
      name: 'Read Security Alarms',
      description: 'View and search security alarms and threats',
      level: PermissionLevel.READ,
      category: ToolCategory.SECURITY,
      coreTool: 'get_active_alarms',
      scope: { global: true, device: true, group: true, network: true },
    },
    'security.alarms.write': {
      id: 'security.alarms.write',
      name: 'Manage Security Alarms',
      description: 'Delete, dismiss, or modify security alarms',
      level: PermissionLevel.WRITE,
      category: ToolCategory.SECURITY,
      coreTool: 'delete_alarm',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },
    'security.alarms.bulk': {
      id: 'security.alarms.bulk',
      name: 'Bulk Alarm Operations',
      description: 'Perform bulk operations on multiple alarms',
      level: PermissionLevel.WRITE,
      category: ToolCategory.SECURITY,
      coreTool: 'bulk_delete_alarms',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },

    // Network permissions
    'network.flows.read': {
      id: 'network.flows.read',
      name: 'Read Network Flows',
      description: 'View network traffic flows and statistics',
      level: PermissionLevel.READ,
      category: ToolCategory.NETWORK,
      coreTool: 'search_flows',
      scope: { global: true, device: true, group: true, network: true },
    },
    'network.bandwidth.read': {
      id: 'network.bandwidth.read',
      name: 'Read Bandwidth Usage',
      description: 'View bandwidth usage statistics and trends',
      level: PermissionLevel.READ,
      category: ToolCategory.NETWORK,
      coreTool: 'get_bandwidth_usage',
      scope: { global: true, device: true, group: true, network: true },
    },

    // Device permissions
    'device.status.read': {
      id: 'device.status.read',
      name: 'Read Device Status',
      description: 'View device online/offline status and information',
      level: PermissionLevel.READ,
      category: ToolCategory.DEVICE,
      coreTool: 'get_device_status',
      scope: { global: true, device: true, group: true, network: true },
    },

    // Rule management permissions
    'rules.read': {
      id: 'rules.read',
      name: 'Read Firewall Rules',
      description: 'View firewall rules and configurations',
      level: PermissionLevel.READ,
      category: ToolCategory.RULE_MANAGEMENT,
      coreTool: 'search_rules',
      scope: { global: true, device: true, group: true, network: true },
    },
    'rules.create': {
      id: 'rules.create',
      name: 'Create Firewall Rules',
      description: 'Create new firewall rules and blocking policies',
      level: PermissionLevel.WRITE,
      category: ToolCategory.RULE_MANAGEMENT,
      coreTool: 'create_rule',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },
    'rules.modify': {
      id: 'rules.modify',
      name: 'Modify Firewall Rules',
      description: 'Pause, resume, enable, or disable firewall rules',
      level: PermissionLevel.WRITE,
      category: ToolCategory.RULE_MANAGEMENT,
      coreTool: 'pause_rule',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },
    'rules.delete': {
      id: 'rules.delete',
      name: 'Delete Firewall Rules',
      description: 'Permanently delete firewall rules',
      level: PermissionLevel.WRITE,
      category: ToolCategory.RULE_MANAGEMENT,
      coreTool: 'delete_rule',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },
    'rules.bulk': {
      id: 'rules.bulk',
      name: 'Bulk Rule Operations',
      description: 'Perform bulk operations on multiple rules',
      level: PermissionLevel.WRITE,
      category: ToolCategory.RULE_MANAGEMENT,
      coreTool: 'bulk_pause_rules',
      sensitive: true,
      scope: { global: true, device: true, group: true, network: true },
    },

    // Analytics permissions
    'analytics.search': {
      id: 'analytics.search',
      name: 'Advanced Analytics',
      description: 'Perform advanced searches and analytics',
      level: PermissionLevel.READ,
      category: ToolCategory.ANALYTICS,
      coreTool: 'search_cross_reference',
      scope: { global: true, device: true, group: true, network: true },
    },

    // System permissions
    'system.admin': {
      id: 'system.admin',
      name: 'System Administration',
      description: 'Administrative access to system functions',
      level: PermissionLevel.ADMIN,
      category: ToolCategory.SYSTEM,
      coreTool: 'system_admin',
      sensitive: true,
      scope: { global: true },
    },
  };

  /** Role definitions */
  private static readonly ROLES: Record<string, Role> = {
    viewer: {
      id: 'viewer',
      name: 'Security Viewer',
      description: 'Read-only access to security and network information',
      permissions: [
        'security.alarms.read',
        'network.flows.read',
        'network.bandwidth.read',
        'device.status.read',
        'rules.read',
        'analytics.search',
      ],
      inheritable: true,
      maxScope: 'global',
    },
    operator: {
      id: 'operator',
      name: 'Security Operator',
      description: 'Can manage alarms and basic rule operations',
      permissions: [
        'security.alarms.read',
        'security.alarms.write',
        'network.flows.read',
        'network.bandwidth.read',
        'device.status.read',
        'rules.read',
        'rules.modify',
        'analytics.search',
      ],
      inheritable: true,
      maxScope: 'global',
    },
    admin: {
      id: 'admin',
      name: 'Security Administrator',
      description: 'Full access to all security and rule management functions',
      permissions: [
        'security.alarms.read',
        'security.alarms.write',
        'security.alarms.bulk',
        'network.flows.read',
        'network.bandwidth.read',
        'device.status.read',
        'rules.read',
        'rules.create',
        'rules.modify',
        'rules.delete',
        'rules.bulk',
        'analytics.search',
        'system.admin',
      ],
      inheritable: false,
      maxScope: 'global',
    },
  };

  /**
   * Convenience tool to core tool permission mapping
   * This defines which core permissions are required for each convenience tool
   */
  private static readonly CONVENIENCE_TOOL_PERMISSIONS: Record<
    string,
    string[]
  > = {
    // get_active_alarms convenience tool requires alarm read permissions
    simple_get_active_alarms: ['security.alarms.read'],

    // get_bandwidth_usage convenience tool requires network read permissions
    get_bandwidth_usage: ['network.bandwidth.read', 'network.flows.read'],

    // pause_rule convenience tool requires rule modification permissions
    pause_rule: ['rules.read', 'rules.modify'],

    // resume_rule convenience tool requires rule modification permissions
    resume_rule: ['rules.read', 'rules.modify'],

    // get_online_devices convenience tool requires device read permissions
    get_online_devices: ['device.status.read'],

    // get_offline_devices convenience tool requires device read permissions
    get_offline_devices: ['device.status.read'],

    // block_ip convenience tool requires rule creation permissions
    block_ip: ['rules.read', 'rules.create'],

    // block_domain convenience tool requires rule creation permissions
    block_domain: ['rules.read', 'rules.create'],
  };

  /**
   * Get all defined permissions
   */
  static getPermissions(): Record<string, Permission> {
    return { ...this.PERMISSIONS };
  }

  /**
   * Get all defined roles
   */
  static getRoles(): Record<string, Role> {
    return { ...this.ROLES };
  }

  /**
   * Get required permissions for a convenience tool
   */
  static getConvenienceToolPermissions(toolName: string): string[] {
    return this.CONVENIENCE_TOOL_PERMISSIONS[toolName] || [];
  }

  /**
   * Get all convenience tool mappings
   */
  static getConvenienceToolMappings(): Record<string, string[]> {
    return { ...this.CONVENIENCE_TOOL_PERMISSIONS };
  }
}

/**
 * RBAC Manager for permission validation and audit logging
 */
export class RBACManager {
  private auditLogs: AuditLogEntry[] = [];
  private correlationIds = new Set<string>();

  /**
   * Generate unique correlation ID for audit tracking
   */
  private generateCorrelationId(): string {
    let correlationId: string;
    do {
      correlationId = crypto.randomBytes(8).toString('hex');
    } while (this.correlationIds.has(correlationId));

    this.correlationIds.add(correlationId);
    return correlationId;
  }

  /**
   * Calculate security risk score for an operation
   */
  private calculateRiskScore(
    tool: string,
    permissions: string[],
    userContext: UserContext,
    parameters: Record<string, any>
  ): number {
    let score = 0;

    // Base risk from tool sensitivity
    const sensitiveTools = [
      'block_ip',
      'block_domain',
      'pause_rule',
      'resume_rule',
    ];
    if (sensitiveTools.includes(tool)) {
      score += 30;
    }

    // Risk from permission level
    const allPermissions = RBACConfiguration.getPermissions();
    permissions.forEach(permId => {
      const perm = allPermissions[permId];
      if (perm) {
        score += perm.level * 10;
        if (perm.sensitive) {
          score += 20;
        }
      }
    });

    // Risk from scope
    const scope = parameters.scope?.type || 'global';
    if (scope === 'global') {
      score += 25;
    }

    // Risk from origin
    if (!userContext.origin || userContext.origin === 'unknown') {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Check if user has required permissions for a tool
   */
  checkPermission(
    userContext: UserContext,
    toolName: string,
    parameters: Record<string, any> = {}
  ): {
    granted: boolean;
    correlationId: string;
    requiredPermissions: string[];
    missingPermissions: string[];
    denialReason?: string;
  } {
    const correlationId = this.generateCorrelationId();
    const requiredPermissions =
      RBACConfiguration.getConvenienceToolPermissions(toolName);

    if (requiredPermissions.length === 0) {
      logger.warn(`No permission mapping found for tool: ${toolName}`, {
        correlationId,
        tool: toolName,
        userId: userContext.userId,
      });

      return {
        granted: false,
        correlationId,
        requiredPermissions: [],
        missingPermissions: [],
        denialReason: 'Tool not found in permission mapping',
      };
    }

    // Get user's effective permissions from roles
    const userPermissions = this.getUserPermissions(userContext);
    const missingPermissions = requiredPermissions.filter(
      perm => !userPermissions.includes(perm)
    );

    const granted = missingPermissions.length === 0;
    const riskScore = this.calculateRiskScore(
      toolName,
      requiredPermissions,
      userContext,
      parameters
    );

    // Log the permission check
    this.logAuditEvent({
      correlationId,
      timestamp: getCurrentTimestamp(),
      userId: userContext.userId,
      action: 'permission_check',
      tool: toolName,
      coreTools: this.getCoreToolsForPermissions(requiredPermissions),
      convenienceTool: toolName,
      requiredPermissions,
      accessGranted: granted,
      denialReason: granted
        ? undefined
        : `Missing permissions: ${missingPermissions.join(', ')}`,
      parameters: this.sanitizeParameters(parameters),
      session: userContext.sessionId
        ? {
            sessionId: userContext.sessionId,
            origin: userContext.origin,
          }
        : undefined,
      riskScore,
    });

    return {
      granted,
      correlationId,
      requiredPermissions,
      missingPermissions,
      denialReason: granted
        ? undefined
        : `Missing permissions: ${missingPermissions.join(', ')}`,
    };
  }

  /**
   * Get effective permissions for a user based on their roles
   */
  private getUserPermissions(userContext: UserContext): string[] {
    const roles = RBACConfiguration.getRoles();
    const permissions = new Set<string>();

    userContext.roles.forEach(roleId => {
      const role = roles[roleId];
      if (role) {
        role.permissions.forEach(perm => permissions.add(perm));
      }
    });

    return Array.from(permissions);
  }

  /**
   * Get core tools associated with permissions
   */
  private getCoreToolsForPermissions(permissions: string[]): string[] {
    const allPermissions = RBACConfiguration.getPermissions();
    const coreTools = new Set<string>();

    permissions.forEach(permId => {
      const perm = allPermissions[permId];
      if (perm) {
        coreTools.add(perm.coreTool);
      }
    });

    return Array.from(coreTools);
  }

  /**
   * Sanitize parameters for audit logging (remove sensitive data)
   */
  private sanitizeParameters(
    parameters: Record<string, any>
  ): Record<string, any> {
    const sanitized: Record<string, any> = {};

    Object.entries(parameters).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();

      if (
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret')
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = `${value.substring(0, 97)}...`;
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }

  /**
   * Log audit event for compliance
   */
  private logAuditEvent(entry: AuditLogEntry): void {
    this.auditLogs.push(entry);

    // Log to console with structured format
    logger.info('RBAC Audit Event', {
      correlationId: entry.correlationId,
      userId: entry.userId,
      action: entry.action,
      tool: entry.tool,
      accessGranted: entry.accessGranted,
      riskScore: entry.riskScore,
      timestamp: entry.timestamp,
    });

    // In production, this should also:
    // 1. Send to centralized audit logging system
    // 2. Trigger alerts for high-risk denied access
    // 3. Store in persistent audit database

    if (!entry.accessGranted && entry.riskScore > 70) {
      logger.warn('High-risk access denied', {
        correlationId: entry.correlationId,
        userId: entry.userId,
        tool: entry.tool,
        riskScore: entry.riskScore,
        reason: entry.denialReason,
      });
    }
  }

  /**
   * Get audit logs (for compliance reporting)
   */
  getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs];
  }

  /**
   * Get audit logs for a specific correlation ID
   */
  getAuditLogsByCorrelation(correlationId: string): AuditLogEntry[] {
    return this.auditLogs.filter(log => log.correlationId === correlationId);
  }

  /**
   * Get audit logs for a specific user
   */
  getAuditLogsByUser(userId: string): AuditLogEntry[] {
    return this.auditLogs.filter(log => log.userId === userId);
  }

  /**
   * Clear audit logs (for testing)
   */
  clearAuditLogs(): void {
    this.auditLogs = [];
    this.correlationIds.clear();
  }
}

/**
 * Singleton RBAC manager instance
 */
export const rbacManager = new RBACManager();
