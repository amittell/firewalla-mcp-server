# Field Naming Conventions - Firewalla MCP Server

This document outlines the standardized field naming conventions used throughout the Firewalla MCP Server codebase to ensure consistency and maintainability.

## Core Principles

1. **Consistency First**: Use the same field name across all interfaces for the same semantic meaning
2. **Unix Timestamps**: All timestamps should be `number` type representing Unix timestamps (seconds since epoch)
3. **IP Address Fields**: Use `ip` consistently, never `ip_address` or `ipAddress`
4. **Boolean Status**: Use consistent boolean field names for status indicators

## Timestamp Fields

### Standard Convention
- **Type**: `number` (Unix timestamp in seconds)
- **Format**: Seconds since Unix epoch (January 1, 1970, 00:00:00 UTC)
- **Field Names**:
  - `ts` - Primary timestamp (when event occurred)
  - `lastSeen` - Last activity timestamp
  - `updateTs` - Last update timestamp
  - `resumeTs` - Resume/activation timestamp

### Examples
```typescript
interface Device {
  lastSeen?: number; // ✅ Correct
}

interface Box {
  lastSeen?: number; // ✅ Fixed in v2.0.0 (was string)
}

interface NetworkRule {
  ts: number;        // ✅ Creation timestamp
  updateTs: number;  // ✅ Last modification timestamp
  resumeTs?: number; // ✅ Optional resume timestamp
}
```

## IP Address Fields

### Standard Convention
- **Field Name**: `ip` (not `ip_address`, `ipAddress`, or `IP`)
- **Type**: `string`
- **Format**: IPv4 dotted decimal notation

### Examples
```typescript
interface Device {
  ip: string; // ✅ Correct
}

interface BandwidthUsage {
  ip: string; // ✅ Correct (fixed from ip_address)
}
```

## Status and Boolean Fields

### Standard Convention
- **Online Status**: `online: boolean`
- **Active Status**: `active: boolean` 
- **Blocked Status**: `block: boolean` (for flows)
- **Reserved Status**: `ipReserved: boolean`

### Examples
```typescript
interface Device {
  online: boolean;     // ✅ Device connectivity status
  ipReserved: boolean; // ✅ IP reservation status
}

interface Flow {
  block: boolean; // ✅ Whether flow was blocked
}
```

## Identifier Fields

### Standard Convention
- **Global IDs**: `gid` - Firewalla box global identifier
- **Generic IDs**: `id` - Entity-specific identifier
- **Device IDs**: `device_id` - When referencing devices from other entities

### Examples
```typescript
interface Device {
  id: string;  // ✅ Device identifier
  gid: string; // ✅ Parent box identifier
}

interface BandwidthUsage {
  device_id: string; // ✅ Reference to device
}
```

## Count and Metric Fields

### Standard Convention
- **Byte Counts**: Use full words (`bytes_uploaded`, `bytes_downloaded`, `total_bytes`)
- **Item Counts**: Use descriptive names (`device_count`, `rule_count`, `alarm_count`)
- **Hit Counts**: `hit.count` for nested structures

### Examples
```typescript
interface BandwidthUsage {
  bytes_uploaded: number;   // ✅ Clear metric name
  bytes_downloaded: number; // ✅ Clear metric name
  total_bytes: number;      // ✅ Clear metric name
}

interface Box {
  deviceCount: number; // ✅ Device count on box
  ruleCount: number;   // ✅ Rule count on box
  alarmCount: number;  // ✅ Alarm count on box
}
```

## Network and Nested Object Fields

### Standard Convention
- **Network Objects**: `network: { id: string; name: string }`
- **Group Objects**: `group: { id: string; name: string }`
- **Device Objects**: `device: { id: string; ip: string; name: string }`

### Examples
```typescript
interface Device {
  network: {
    id: string;   // ✅ Network identifier
    name: string; // ✅ Network display name
  };
  group?: {
    id: string;   // ✅ Group identifier  
    name: string; // ✅ Group display name
  };
}
```

## Migration Guide

### Breaking Changes in v2.0.0

1. **Box.lastSeen Type Change**
   ```typescript
   // Before v2.0.0
   interface Box {
     lastSeen?: string; // ❌ String type
   }
   
   // After v2.0.0
   interface Box {
     lastSeen?: number; // ✅ Unix timestamp
   }
   ```

2. **BandwidthUsage.ip Field**
   ```typescript
   // Before v2.0.0
   interface BandwidthUsage {
     ip_address: string; // ❌ Inconsistent naming
   }
   
   // After v2.0.0
   interface BandwidthUsage {
     ip: string; // ✅ Consistent with Device.ip
   }
   ```

### Code Migration Examples

#### Timestamp Handling
```typescript
// Before - string handling
const lastSeenFormatted = box.lastSeen; // string

// After - Unix timestamp handling
const lastSeenFormatted = unixToISOString(box.lastSeen); // number -> string
```

#### IP Address Access
```typescript
// Before - inconsistent field names
const deviceIP = device.ip;
const usageIP = usage.ip_address; // ❌ Different field name

// After - consistent field names
const deviceIP = device.ip;
const usageIP = usage.ip; // ✅ Same field name
```

## Validation Rules

### TypeScript Interfaces
- All timestamp fields must be `number` type
- All IP fields must be named `ip` and be `string` type
- All boolean status fields should use descriptive names
- Nested objects should follow consistent structure patterns

### API Response Mapping
- Ensure API responses map to correct field names
- Convert string timestamps to numbers during parsing
- Maintain consistency between input and output field names

## Tools and Enforcement

### ESLint Rules
- Custom rules enforce timestamp type consistency
- Field naming pattern validation
- Required field documentation

### TypeScript Strict Mode
- Enables compile-time validation of field types
- Prevents inconsistent field usage
- Enforces proper type guards and assertions

### Testing Requirements
- Unit tests must validate field naming consistency
- Integration tests should verify API mapping correctness
- Type safety tests ensure no `any` type leakage

## Future Considerations

### Discriminated Unions
For complex conditional objects like `Alarm`, consider implementing discriminated unions:

```typescript
// Future enhancement - discriminated union for type safety
type Alarm = 
  | (BaseAlarm & { type: 1; device: DeviceInfo; remote: RemoteInfo })
  | (BaseAlarm & { type: 4; dataPlan: DataPlanInfo; transfer: TransferInfo })
  // ... other combinations
```

### Generic Type Improvements
Replace `Record<string, any>` with more specific types:

```typescript
// Current
aggregations?: Record<string, any>;

// Improved
aggregations?: Record<string, number | string | boolean | Record<string, unknown>>;
```

## References

- [TypeScript Handbook - Interfaces](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [Firewalla API Documentation](https://docs.firewalla.com/api/)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)