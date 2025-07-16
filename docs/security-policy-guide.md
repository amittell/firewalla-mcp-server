# Security Policy Guide - Firewalla MCP Server

## Overview

This guide provides comprehensive security policies, procedures, and guidelines for the Firewalla MCP Server, focusing on enterprise-grade security for convenience tools with Role-Based Access Control (RBAC), audit logging, and defense-in-depth protections.

## Security Architecture

### 1. RBAC Inheritance System

The Firewalla MCP Server implements a sophisticated RBAC system that maps convenience tool permissions to underlying core tool permissions, preventing privilege escalation.

#### Permission Hierarchy

```
PermissionLevel.NONE (0)     - No access
PermissionLevel.READ (1)     - Read-only operations
PermissionLevel.WRITE (2)    - Read and write operations  
PermissionLevel.ADMIN (3)    - Full administrative access
```

#### Tool Categories

- **SECURITY**: Security monitoring and alarm management
- **NETWORK**: Network traffic and bandwidth analysis
- **DEVICE**: Device status and management
- **RULE_MANAGEMENT**: Firewall rule creation and modification
- **ANALYTICS**: Advanced search and analytics
- **SYSTEM**: System administration functions

#### Convenience Tool Permission Mappings

| Convenience Tool | Required Core Permissions | Risk Level |
|------------------|---------------------------|------------|
| `simple_get_active_alarms` | `security.alarms.read` | Low |
| `get_bandwidth_usage` | `network.bandwidth.read`, `network.flows.read` | Low |
| `pause_rule` | `rules.read`, `rules.modify` | Medium |
| `resume_rule` | `rules.read`, `rules.modify` | Medium |
| `get_online_devices` | `device.status.read` | Low |
| `get_offline_devices` | `device.status.read` | Low |
| `block_ip` | `rules.read`, `rules.create` | High |
| `block_domain` | `rules.read`, `rules.create` | High |

### 2. Role Definitions

#### Viewer Role
- **Permissions**: Read-only access to security, network, and device information
- **Use Cases**: Security monitoring, network analysis, reporting
- **Risk Level**: Low
- **Max Scope**: Global

#### Operator Role  
- **Permissions**: Alarm management and basic rule operations
- **Use Cases**: SOC operations, incident response, rule management
- **Risk Level**: Medium
- **Max Scope**: Global

#### Admin Role
- **Permissions**: Full access including bulk operations and system administration
- **Use Cases**: Security administration, policy management, system configuration
- **Risk Level**: High
- **Max Scope**: Global

### 3. Security Policies

#### Default Security Policy

```typescript
{
  enableRBAC: true,                    // Enforce RBAC for all operations
  enableAuditLogging: true,            // Log all operations for compliance
  enableInputSanitization: true,      // Sanitize all inputs
  enableRateLimit: true,               // Prevent abuse
  enableOriginValidation: true,        // Validate request origins
  requireExplicitBoxId: false,         // Allow default box ID for convenience
  maxRiskScore: 80,                    // Maximum allowed operation risk score
  enableScopeWarnings: true,           // Warn about broad-scope operations
  rateLimits: {
    default: 100,                      // 100 requests/minute for normal operations
    sensitive: 10,                     // 10 requests/minute for sensitive operations
    admin: 5                           // 5 requests/minute for admin operations
  },
  validation: {
    validateIPs: true,                 // Validate IP address formats
    validateDomains: true,             // Validate domain name formats
    blockPrivateIPs: false,            // Allow private IPs (for local networks)
    blockLoopback: true                // Block loopback addresses
  }
}
```

### 4. Environment Variables

#### Required Variables

- `FIREWALLA_MSP_TOKEN`: MSP API access token
- `FIREWALLA_BOX_ID`: Primary box identifier

#### Optional Security Variables

- `FIREWALLA_DEFAULT_BOX_ID`: Default box for convenience tools
- `RBAC_ENABLED`: Enable/disable RBAC (default: true)
- `AUDIT_LOGGING_ENABLED`: Enable/disable audit logging (default: true)
- `MAX_RISK_SCORE`: Maximum allowed risk score (default: 80)

#### Box ID Validation

The system validates that `FIREWALLA_DEFAULT_BOX_ID` follows UUID format:
```
^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$
```

## Audit Logging

### 1. Audit Log Structure

Every operation generates a comprehensive audit log entry:

```typescript
{
  correlationId: string,              // Unique tracking identifier
  timestamp: string,                  // ISO timestamp
  userId: string,                     // User identifier
  action: string,                     // Action performed
  tool: string,                       // Tool that was called
  coreTools: string[],               // Core tools accessed
  convenienceTool?: string,          // Convenience tool used
  requiredPermissions: string[],     // Required permissions
  accessGranted: boolean,            // Whether access was granted
  denialReason?: string,             // Reason for denial
  parameters: Record<string, any>,   // Sanitized parameters
  session?: {                        // Session information
    sessionId: string,
    origin?: string,
    userAgent?: string
  },
  riskScore: number                  // Security risk score (0-100)
}
```

### 2. Correlation ID Tracking

Each operation receives a unique correlation ID for end-to-end tracking:
- Generated using crypto.randomBytes(8).toString('hex')
- Used across all audit logs for the same operation
- Enables complete audit trails for compliance

### 3. Audit Log Analysis

#### High-Risk Operation Detection
- Operations with risk score > 70 trigger additional logging
- Failed high-risk operations generate security alerts
- Patterns of denied access are monitored for potential attacks

#### Compliance Reporting
- Audit logs support regulatory compliance requirements
- Complete wrapper → core tool mapping for audit trails
- User action tracking with permissions and outcomes

## Input Validation and Sanitization

### 1. Input Sanitization

All string inputs are validated against dangerous patterns:
- Script injection: `<script`, `javascript:`, `on\w+=`
- Command injection: `$(`, backticks, shell metacharacters
- SQL injection: `union`, `select`, `insert`, `update`, `delete`

### 2. IP Address Validation

#### Format Validation
- IPv4 dotted decimal notation validation
- Range checking (0-255 for each octet)
- Support for private IP ranges (configurable blocking)

#### Security Checks
- Private IP range detection (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- Loopback address detection (127.x.x.x, ::1)
- Broadcast address warnings (x.x.x.255, 255.255.255.255)

### 3. Domain Name Validation

#### Format Validation
- RFC-compliant domain name format
- Length validation (max 253 characters)
- Label length validation (max 63 characters per label)

#### Security Checks
- Localhost domain detection
- Wildcard domain warnings
- Internationalized domain name (IDN) handling

## Risk Assessment

### 1. Risk Score Calculation

Risk scores (0-100) are calculated based on:

#### Tool Risk Factors
- **Write Operations**: +30 points (block_ip, block_domain, pause_rule, resume_rule)
- **Read Operations**: +10 points (get_active_alarms, get_bandwidth_usage)

#### Permission Risk Factors
- **Admin permissions**: +30 points
- **Write permissions**: +20 points  
- **Read permissions**: +5 points
- **Sensitive operations**: +20 points

#### Scope Risk Factors
- **Global scope**: +25 points
- **Network scope**: +15 points
- **Group scope**: +10 points
- **Device scope**: +5 points

#### Context Risk Factors
- **Unknown origin**: +15 points
- **Bulk operations (>100 items)**: +10 points
- **After-hours access**: +10 points

### 2. Risk Mitigation

#### High-Risk Operations (>80)
- Blocked by default
- Require explicit administrative approval
- Generate security alerts
- Enhanced audit logging

#### Medium-Risk Operations (50-80)
- Additional validation checks
- Scope warnings
- Enhanced logging

#### Low-Risk Operations (<50)
- Standard processing
- Basic audit logging

## Security Warnings

### 1. Scope Warnings

Global scope operations generate warnings:
```
WARNING: block_ip will be applied globally to all devices. 
Consider using device-specific or group-specific scope for better security.
```

### 2. Parameter Warnings

- Broadcast IP addresses
- Wildcard domains
- Large bulk operations
- After-hours access

## Implementation Guidelines

### 1. Convenience Tool Security

All convenience tools must:

1. **Extend SecureConvenienceHandler**
   ```typescript
   export class MyToolHandler extends SecureConvenienceHandler {
     protected async executeSecure(args, firewalla, securityContext) {
       // Implementation with security context
     }
   }
   ```

2. **Use createSecureSuccessResponse**
   ```typescript
   return this.createSecureSuccessResponse(data, securityContext);
   ```

3. **Implement proper input validation**
   ```typescript
   protected async validateInputs(args: ToolArgs) {
     // Custom validation logic
     return await super.validateInputs(args);
   }
   ```

### 2. Permission Mapping

When adding new convenience tools:

1. **Define required core permissions**
   ```typescript
   // In rbac.ts CONVENIENCE_TOOL_PERMISSIONS
   'my_convenience_tool': ['category.operation.level']
   ```

2. **Add permission definition**
   ```typescript
   // In rbac.ts PERMISSIONS
   'category.operation.level': {
     id: 'category.operation.level',
     name: 'Operation Name',
     description: 'Operation description',
     level: PermissionLevel.WRITE,
     category: ToolCategory.CATEGORY,
     coreTool: 'core_tool_name',
     sensitive: true
   }
   ```

### 3. Audit Integration

Audit logging is automatic for tools extending SecureConvenienceHandler:

- Permission checks are automatically logged
- Correlation IDs are automatically generated
- Security context is preserved throughout execution
- Failed operations are logged with detailed error context

## Monitoring and Alerting

### 1. Security Metrics

Monitor these key security metrics:

- **Permission Denials**: Rate of RBAC permission denials
- **High-Risk Operations**: Frequency of high-risk operation attempts
- **Failed Authentication**: Authentication failure patterns
- **Anomalous Access**: Unusual access patterns or origins

### 2. Alert Conditions

Generate security alerts for:

- **Multiple Permission Denials**: >5 denials in 10 minutes from same user
- **High-Risk Operation Attempts**: Any blocked high-risk operation
- **Unusual Access Patterns**: Access from new origins or unusual times
- **Bulk Operation Abuse**: Excessive bulk operations

### 3. Compliance Reporting

Generate regular compliance reports including:

- **Access Log Summary**: All tool access with permissions
- **Permission Change Audit**: Role and permission modifications
- **Security Incident Summary**: All security-related events
- **Risk Assessment Report**: Risk score distributions and trends

## Security Best Practices

### 1. Principle of Least Privilege

- Grant minimum required permissions
- Use device/group scope instead of global when possible
- Regular permission audits and cleanup
- Time-limited elevated access

### 2. Defense in Depth

- Multiple validation layers (input, permission, risk)
- Comprehensive audit logging
- Real-time monitoring and alerting
- Automated threat detection

### 3. Zero Trust Model

- Explicit permission grants required
- No implicit trust relationships
- Continuous validation of access
- Assume breach mentality

## Troubleshooting

### 1. Permission Denied Errors

Check the following:

1. **User Roles**: Verify user has required roles
2. **Permission Mapping**: Confirm tool has correct permission mapping
3. **Risk Score**: Check if operation exceeds maximum risk score
4. **Input Validation**: Verify all inputs pass validation

### 2. Audit Log Issues

Common issues:

1. **Missing Correlation ID**: Ensure using SecureConvenienceHandler
2. **Incomplete Logs**: Check audit logging is enabled
3. **Permission Mapping**: Verify convenience tool permission mapping

### 3. Security Configuration

Configuration issues:

1. **Environment Variables**: Verify all required variables are set
2. **Box ID Format**: Ensure UUIDs are correctly formatted
3. **Policy Conflicts**: Check for conflicting security policy settings

## Migration Guide

### 1. Existing Tools

To add security to existing convenience tools:

1. **Change Base Class**
   ```typescript
   // Before
   export class MyHandler extends BaseToolHandler {
   
   // After  
   export class MyHandler extends SecureConvenienceHandler {
   ```

2. **Update Execute Method**
   ```typescript
   // Before
   async execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse> {
   
   // After
   protected async executeSecure(args: ToolArgs, firewalla: FirewallaClient, 
                                 securityContext: SecurityContext): Promise<ToolResponse> {
   ```

3. **Update Response Creation**
   ```typescript
   // Before
   return this.createSuccessResponse(data);
   
   // After
   return this.createSecureSuccessResponse(data, securityContext);
   ```

### 2. Testing Security

Test security implementation:

1. **Permission Tests**: Verify RBAC enforcement
2. **Input Validation Tests**: Test malicious input handling
3. **Audit Log Tests**: Verify audit log generation
4. **Risk Assessment Tests**: Test risk score calculations

This comprehensive security framework ensures enterprise-grade protection while maintaining usability for convenience tools.