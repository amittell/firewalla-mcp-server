# Firewalla MSP API Reference

## Overview

This document provides comprehensive documentation for the Firewalla MSP (Managed Service Provider) API v2. It includes all verified endpoints, data models, request/response formats, and practical examples to serve as the definitive reference for development.

**Base URL Pattern**: `https://{msp_domain}/v2/`

**Authentication**: All requests require a personal access token in the Authorization header:
```text
Authorization: Token {your_personal_access_token}
```text

## Table of Contents

1. [API Endpoints](#api-endpoints)
   - [Alarm Management](#alarm-management)
   - [Box Management](#box-management)
   - [Device Management](#device-management)
   - [Flow Management](#flow-management)
   - [Rule Management](#rule-management)
   - [Statistics](#statistics)
   - [Target Lists](#target-lists)
   - [Trends](#trends)
2. [Data Models](#data-models)
3. [Search Functionality](#search-functionality)
4. [Code Examples](#code-examples)
5. [Error Handling](#error-handling)

---

## API Endpoints

### Alarm Management

#### Get Alarms
Retrieve alarms with filtering and pagination support.

**Endpoint**: `GET https://{msp_domain}/v2/alarms`

**Query Parameters**:
- `query` (string, optional): Search query for filtering alarms
- `groupBy` (string, optional): Group alarms by specified fields (comma-separated)
- `sortBy` (string, optional): Sort alarms (default: `ts:desc`)
- `limit` (number, optional): Maximum results (default: 200, max: 500)
- `cursor` (string, optional): Pagination cursor for next page

**Response (200 Success)**:
```json
{
  "count": 42,
  "results": [
    {
      "ts": 1641024000,
      "gid": "00000000-0000-0000-0000-000000000000",
      "aid": 12345,
      "type": 1,
      "status": 1,
      "message": "Security activity detected",
      "device": {
        "id": "mac:AA:BB:CC:DD:EE:FF",
        "name": "My Device",
        "ip": "192.168.1.100"
      }
    }
  ],
  "next_cursor": "cursor_token_here"
}
```text

#### Get Specific Alarm
Retrieve detailed information about a specific alarm.

**Endpoint**: `GET https://{msp_domain}/v2/alarms/{gid}/{aid}`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (string, required): Alarm ID

**Response (200 Success)**: Returns detailed alarm JSON with device information

#### Delete Alarm
Delete a specific alarm.

**Endpoint**: `DELETE https://{msp_domain}/v2/alarms/{gid}/{aid}`

**Path Parameters**:
- `gid` (string, required): Box ID
- `aid` (string, required): Alarm ID

**Response (200 Success)**: Confirmation of successful deletion

### Box Management

#### Get Boxes
Retrieve list of Firewalla boxes.

**Endpoint**: `GET https://{msp_domain}/v2/boxes`

**Query Parameters**:
- `group` (string, optional): Get boxes within a specific group (requires group ID)

**Response (200 Success)**:
```json
[
  {
    "gid": "00000000-0000-0000-0000-000000000000",
    "name": "My Firewalla",
    "model": "gold",
    "mode": "router",
    "online": true,
    "version": "1.975",
    "license": "license_code_here",
    "publicIP": "203.0.113.1",
    "location": "United States",
    "lastSeen": 1641024000,
    "group": "group_id_here",
    "deviceCount": 25,
    "ruleCount": 10,
    "alarmCount": 3
  }
]
```text

### Device Management

#### Get Devices
Retrieve list of devices on the network.

**Endpoint**: `GET https://{msp_domain}/v2/devices`

**Query Parameters**:
- `box` (string, optional): Get devices under a specific Firewalla box (requires box ID)
- `group` (string, optional): Get devices under a specific box group (requires group ID)

**Response (200 Success)**:
```json
[
  {
    "id": "mac:AA:BB:CC:DD:EE:FF",
    "gid": "00000000-0000-0000-0000-000000000000",
    "name": "My iPhone",
    "ip": "192.168.120.1",
    "macVendor": "Apple Inc.",
    "online": true,
    "lastSeen": 1641024000,
    "ipReserved": false,
    "network": {
      "id": "network_id",
      "name": "Home Office"
    },
    "group": {
      "id": "group_id",
      "name": "Kids"
    },
    "totalDownload": 1048576,
    "totalUpload": 524288
  }
]
```text

### Flow Management

#### Get Flows
Retrieve network traffic flow information.

**Endpoint**: `GET https://{msp_domain}/v2/flows`

**Query Parameters**:
- `query` (string, optional): Search query for flows
- `groupBy` (string, optional): Group flows by specified values (e.g., "domain,box")
- `sortBy` (string, optional): Sort flows (default: "ts:desc")
- `limit` (number, optional): Maximum results (default: 200, max: 500)
- `cursor` (string, optional): Pagination support

**Response (200 Success)**:
```json
{
  "count": 150,
  "results": [
    {
      "ts": 1641024000,
      "gid": "00000000-0000-0000-0000-000000000000",
      "protocol": "tcp",
      "direction": "outbound",
      "block": false,
      "blockType": null,
      "download": 1048576,
      "upload": 262144,
      "duration": 300,
      "count": 5,
      "device": {
        "id": "mac:AA:BB:CC:DD:EE:FF",
        "ip": "192.168.1.100",
        "name": "My Device"
      },
      "source": {
        "id": "192.168.1.100",
        "name": "My Device",
        "ip": "192.168.1.100"
      },
      "destination": {
        "id": "example.com",
        "name": "example.com",
        "ip": "93.184.216.34"
      },
      "region": "US",
      "category": {
        "name": "social"
      },
      "network": {
        "id": "network_id",
        "name": "Home Network"
      }
    }
  ],
  "next_cursor": "cursor_token_here"
}
```text

### Rule Management

#### Get Rules
Retrieve list of firewall rules.

**Endpoint**: `GET https://{msp_domain}/v2/rules`

**Query Parameters**:
- `query` (string, optional): Search conditions for filtering rules

**Response (200 Success)**:
```json
{
  "count": 10,
  "results": [
    {
      "id": "rule_id_here",
      "gid": "00000000-0000-0000-0000-000000000000",
      "action": "block",
      "direction": "bidirection",
      "target": {
        "type": "domain",
        "value": "example.com"
      },
      "scope": {
        "type": "device",
        "value": "mac:AA:BB:CC:DD:EE:FF"
      },
      "status": "active",
      "protocol": "tcp",
      "notes": "Block social media",
      "ts": 1641024000,
      "updateTs": 1641024000
    }
  ]
}
```text

#### Pause Rule
Temporarily disable an active firewall rule for a specified duration.

**Endpoint**: `POST https://{msp_domain}/v2/rules/{id}/pause`

**Path Parameters**:
- `id` (string, required): Rule ID

**Request Body**:
```json
{
  "duration": 60,
  "box": "box_gid_here"
}
```text

**Parameters**:
- `duration` (number, optional): Duration in minutes to pause the rule (default: 60, range: 1-1440)
- `box` (string, required): Box GID for context

**Response (200 Success)**:
```json
{
  "success": true,
  "message": "Rule rule_123 paused for 60 minutes"
}
```text

**Example Request**:
```bash
curl -X POST "https://yourdomain.firewalla.net/v2/rules/rule_123/pause" \
  -H "Authorization: Token your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"duration": 30, "box": "box_gid_here"}'
```text

#### Resume Rule
Resume a previously paused firewall rule, restoring it to active state.

**Endpoint**: `POST https://{msp_domain}/v2/rules/{id}/resume`

**Path Parameters**:
- `id` (string, required): Rule ID

**Request Body**:
```json
{
  "box": "box_gid_here"
}
```text

**Parameters**:
- `box` (string, required): Box GID for context

**Response (200 Success)**:
```json
{
  "success": true,
  "message": "Rule rule_123 resumed successfully"
}
```text

**Example Request**:
```bash
curl -X POST "https://yourdomain.firewalla.net/v2/rules/rule_123/resume" \
  -H "Authorization: Token your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"box": "box_gid_here"}'
```text

### Statistics

#### Get Statistics
Retrieve various statistics about your Firewalla deployment.

**Endpoint**: `GET https://{msp_domain}/v2/stats/{type}`

**Path Parameters**:
- `type` (string, required): Statistics type
  - `topBoxesByBlockedFlows`: Top boxes by blocked flows
  - `topBoxesBySecurityAlarms`: Top boxes by security alarms
  - `topRegionsByBlockedFlows`: Top regions by blocked flows

**Query Parameters**:
- `group` (string, optional): Get statistics for specific box group
- `limit` (number, optional): Maximum number of results (default: 5)

**Response (200 Success)**:
```json
[
  {
    "meta": {
      "gid": "00000000-0000-0000-0000-000000000000",
      "name": "My Firewalla",
      "model": "gold"
    },
    "value": 1250
  }
]
```text

#### Get Simple Statistics
Retrieve basic statistics overview.

**Endpoint**: `GET https://{msp_domain}/v2/stats/simple`

**Query Parameters**:
- `group` (string, optional): Get statistics for specific box group

**Response (200 Success)**:
```json
{
  "onlineBoxes": 5,
  "offlineBoxes": 1,
  "alarms": 42,
  "rules": 25
}
```text

### Target Lists

#### Get All Target Lists
Retrieve all target lists.

**Endpoint**: `GET https://{msp_domain}/v2/target-lists`

**Response (200 Success)**:
```json
[
  {
    "id": "target_list_id",
    "name": "Social Media Sites",
    "owner": "global",
    "targets": [
      "facebook.com",
      "*.twitter.com",
      "instagram.com"
    ],
    "category": "social",
    "notes": "Popular social media platforms",
    "lastUpdated": 1641024000
  }
]
```text

#### Get Specific Target List
Retrieve a specific target list by ID.

**Endpoint**: `GET https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Response (200 Success)**: Detailed JSON of the specific target list

#### Create Target List
Create a new target list.

**Endpoint**: `POST https://{msp_domain}/v2/target-lists`

**Request Body**:
```json
{
  "name": "Gaming Sites",
  "owner": "global",
  "targets": [
    "steam.com",
    "*.gaming.com"
  ],
  "category": "games",
  "notes": "Gaming platforms"
}
```text

**Response (200 Success)**: Returns created target list with generated ID

#### Update Target List
Update an existing target list.

**Endpoint**: `PATCH https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Request Body**: Updated target list details (same format as create)

**Response (200 Success)**: Returns updated target list

#### Delete Target List
Delete a target list.

**Endpoint**: `DELETE https://{msp_domain}/v2/target-lists/{id}`

**Path Parameters**:
- `id` (string, required): Target list ID

**Response (200 Success)**: Confirmation of successful deletion

### Trends

#### Get Trends
Retrieve trend data for various metrics.

**Endpoint**: `GET https://{msp_domain}/v2/trends/{type}`

**Path Parameters**:
- `type` (string, required): Trend type
  - `flows`: Blocked flows per day
  - `alarms`: Alarms generated per day
  - `rules`: Rules created per day

**Query Parameters**:
- `group` (string, optional): Get trends for a specific box group

**Response (200 Success)**:
```json
[
  {
    "ts": 1641024000,
    "value": 125
  },
  {
    "ts": 1641110400,
    "value": 98
  }
]
```text

---

## Data Models

### Alarm Model

```typescript
interface Alarm {
  ts: number;                    // Unix timestamp of alarm generation
  gid: string;                   // Unique Firewalla box identifier
  aid: number;                   // Unique alarm identifier
  type: AlarmType;               // Alarm type (1-16)
  status: AlarmStatus;           // Alarm status (1=Active, 2=Archived)
  message: string;               // Descriptive alarm text
  device?: Device;               // Device details (when type != 4)
  remote?: Host;                 // Remote host info (when type in [1,2,8,9,10,16])
  direction?: "inbound" | "outbound" | "local"; // Traffic direction
  transfer?: TransferData;       // Data transfer details
  dataPlan?: DataPlan;          // Data plan info
  vpn?: VpnDetails;             // VPN connection details
  port?: PortInfo;              // Port opening information
  wan?: WanInfo;                // Internet connectivity data
}

enum AlarmType {
  SECURITY_ACTIVITY = 1,
  ABNORMAL_UPLOAD = 2,
  LARGE_BANDWIDTH_USAGE = 3,
  MONTHLY_DATA_PLAN = 4,
  NEW_DEVICE = 5,
  DEVICE_BACK_ONLINE = 6,
  DEVICE_OFFLINE = 7,
  VIDEO_ACTIVITY = 8,
  GAMING_ACTIVITY = 9,
  PORN_ACTIVITY = 10,
  VPN_ACTIVITY = 11,
  VPN_CONNECTION_RESTORED = 12,
  VPN_CONNECTION_ERROR = 13,
  OPEN_PORT = 14,
  INTERNET_CONNECTIVITY_UPDATE = 15,
  LARGE_UPLOAD = 16
}

enum AlarmStatus {
  ACTIVE = 1,
  ARCHIVED = 2
}
```text

### Box Model

```typescript
interface Box {
  gid: string;                   // Unique box identifier
  name: string;                  // Box display name
  model: string;                 // Box model
  mode: "router" | "bridge" | "dhcp" | "simple"; // Monitoring mode
  version: string;               // Firewalla software version
  online: boolean;               // Box connection status
  lastSeen?: number;             // Unix timestamp of last online time
  license: string;               // Box license code
  publicIP: string;              // Box's public IP address
  group?: string;                // Group ID (nullable)
  location: string;              // Geographical location based on public IP
  deviceCount: number;           // Number of devices on the box
  ruleCount: number;             // Number of rules on the box
  alarmCount: number;            // Number of alarms on the box
}
```text

### Device Model

```typescript
interface Device {
  id: DeviceID;                  // Unique identifier
  gid: string;                   // ID of Firewalla box
  name: string;                  // Device display name
  ip: string;                    // Device IP address
  macVendor?: string;            // MAC address vendor
  online: boolean;               // Device connection status
  lastSeen?: number;             // Unix timestamp of last seen
  ipReserved: boolean;           // IP reservation status
  network: Network;              // Network object
  group?: Group;                 // Group object
  totalDownload: number;         // Bytes downloaded in 24 hours
  totalUpload: number;           // Bytes uploaded in 24 hours
}

type DeviceID =
  | `ovpn:${string}`             // OpenVPN client with profile ID
  | `wg_peer:${string}`          // WireGuard client with profile ID
  | `mac:${string}`;             // MAC address (default)

interface Network {
  id: string;                    // Network identifier
  name: string;                  // Network name
}

interface Group {
  id: string;                    // Group identifier
  name: string;                  // Group name
}
```text

### Flow Model

```typescript
interface Flow {
  ts: number;                    // Unix timestamp of flow end
  gid: string;                   // Firewalla box identifier
  protocol: "tcp" | "udp";       // Network protocol
  direction: "inbound" | "outbound" | "local"; // Traffic direction
  block: boolean;                // Indicates blocked flow
  blockType?: "ip" | "dns";      // Type of block
  download?: number;             // Bytes downloaded
  upload?: number;               // Bytes uploaded
  duration?: number;             // Flow duration in seconds
  count: number;                 // TCP connections/UDP sessions
  device: Device;                // Device object
  source?: Host;                 // Source host information
  destination?: Host;            // Destination host information
  region?: string;               // 2-letter ISO 3166 country code
  category?: Category;           // Content category
  network: Network;              // Network object
}

interface Host {
  id: string;                    // Host identifier
  name: string;                  // Host name
  ip: string;                    // Host IP address
}

interface Category {
  name: "ad" | "edu" | "games" | "gamble" | "intel" | "p2p" |
        "porn" | "private" | "social" | "shopping" | "video" | "vpn";
}
```text

### Rule Model

```typescript
interface Rule {
  id: string;                    // Unique rule identifier
  gid?: string;                  // Firewalla box ID
  action: "allow" | "block" | "timelimit"; // Rule action (default: "block")
  target: Target;                // Rule target details
  direction: "bidirection" | "inbound" | "outbound"; // Traffic direction (default: "bidirection")
  group?: string;                // Firewalla box group ID (default: "global")
  scope?: Scope;                 // Local rule application scope
  notes?: string;                // Descriptive text
  status?: "active" | "paused";  // Rule status
  schedule?: Schedule;           // Rule activation schedule
  protocol?: "tcp" | "udp";      // Traffic protocol
  resumeTs?: number;             // Auto-resume timestamp for paused rules
  ts: number;                    // Rule creation timestamp
  updateTs: number;              // Last rule update timestamp
}

interface Target {
  type: string;                  // Target type
  value: string;                 // Target value
}

interface Scope {
  type: string;                  // Scope type
  value: string;                 // Scope value
}
```text

### Target List Model

```typescript
interface TargetList {
  id: string;                    // Unique system-generated identifier (immutable)
  name: string;                  // Readable name (required, max 24 chars)
  owner: "global" | string;      // "global" or box gid (required, immutable)
  targets: string[];             // Array of domains, IPs, or CIDR ranges
  category?: "ad" | "edu" | "games" | "gamble" | "intel" | "p2p" |
            "porn" | "private" | "social" | "shopping" | "video" | "vpn";
  notes?: string;                // Additional description
  lastUpdated: number;           // Unix timestamp of last modification (immutable)
}
```text

### Statistics Models

```typescript
interface Statistic {
  meta: Region | Box;            // Region or Box metadata
  value: number;                 // Numeric statistic value
}

interface Region {
  code: string;                  // 2-letter ISO 3166 country code
}

interface SimpleStatistics {
  onlineBoxes: number;           // Number of online Firewalla boxes
  offlineBoxes: number;          // Number of offline Firewalla boxes
  alarms: number;                // Number of generated alarms
  rules: number;                 // Number of created rules
}
```text

### Trend Model

```typescript
interface Trend {
  ts: number;                    // Unix timestamp paired with the data
  value: number;                 // Data point in the time series
}
```text

---

## Search Functionality

The Firewalla MSP API supports advanced search capabilities across multiple resources (Alarms, Flows, Rules) with a flexible query syntax.

### Search Query Syntax

#### Basic Searches
```text
# Field-specific searches
box.name:"Gold Plus"
mac:"AA:BB:CC:DD:EE:FF"
protocol:tcp
```text

#### Numeric Searches
```text
# Comparison operators
Total:>50MB
bytes:>=1000000
count:<10

# Range searches
duration:[300 TO 600]
```text

#### Wildcard Searches
```text
# Use * for wildcards
domain:*.facebook.com
ip:192.168.*
name:*laptop*
```text

#### Quoted Searches
```text
# Exact phrase matching
message:"security threat detected"
device.name:"John's iPhone"
```text

### Supported Units

The API supports various data units:
- **B**: Bytes
- **KB**: Kilobytes
- **MB**: Megabytes
- **GB**: Gigabytes
- **TB**: Terabytes

### Search Qualifiers

Common search qualifiers across different resources:

#### Device Qualifiers
- `mac`: MAC address
- `ip`: IP address
- `name`: Device name
- `online`: Online status (true/false)
- `vendor`: MAC vendor

#### Flow Qualifiers
- `protocol`: tcp/udp
- `direction`: inbound/outbound/local
- `blocked`: true/false
- `bytes`: Data transfer amount
- `domain`: Destination domain
- `region`: Country code

#### Alarm Qualifiers
- `type`: Alarm type number
- `severity`: Alarm severity
- `resolved`: Resolution status
- `source_ip`: Source IP address

#### Rule Qualifiers
- `action`: allow/block/timelimit
- `target`: Rule target
- `status`: active/paused

### Pagination Support

All search endpoints support pagination via the `cursor` parameter:

```javascript
// First request
GET /v2/flows?query=protocol:tcp&limit=100

// Next page using cursor from response
GET /v2/flows?query=protocol:tcp&limit=100&cursor=next_cursor_token
```text

---

## Code Examples

### Node.js with Axios

#### Basic Setup
```javascript
const axios = require('axios');

const config = {
  mspDomain: 'your-domain.firewalla.net',
  token: 'your_personal_access_token'
};

const apiClient = axios.create({
  baseURL: `https://${config.mspDomain}/v2`,
  headers: {
    'Authorization': `Token ${config.token}`,
    'Content-Type': 'application/json'
  }
});
```text

#### Get Active Alarms
```javascript
async function getActiveAlarms(limit = 100) {
  try {
    const response = await apiClient.get('/alarms', {
      params: {
        query: 'status:1',  // Active alarms only
        limit: limit,
        sortBy: 'ts:desc'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alarms:', error.response?.data || error.message);
    throw error;
  }
}
```text

#### Get Device Bandwidth Usage
```javascript
async function getTopBandwidthUsers(boxId, limit = 10) {
  try {
    const response = await apiClient.get('/devices', {
      params: {
        box: boxId,
        query: 'online:true',
        sortBy: 'totalDownload:desc',
        limit: limit
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching devices:', error.response?.data || error.message);
    throw error;
  }
}
```text

#### Block a Domain
```javascript
async function createBlockRule(domain, boxId) {
  try {
    const response = await apiClient.post('/rules', {
      action: 'block',
      target: {
        type: 'domain',
        value: domain
      },
      direction: 'bidirection',
      scope: {
        type: 'box',
        value: boxId
      },
      notes: `Block ${domain}`
    });
    return response.data;
  } catch (error) {
    console.error('Error creating rule:', error.response?.data || error.message);
    throw error;
  }
}
```text

#### Search High-Risk Flows
```javascript
async function searchHighRiskFlows(boxId, timeframe = '1h') {
  try {
    const response = await apiClient.get('/flows', {
      params: {
        query: `gid:${boxId} AND (category:porn OR category:gamble OR blocked:true)`,
        limit: 200,
        sortBy: 'bytes:desc'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error searching flows:', error.response?.data || error.message);
    throw error;
  }
}
```text

### cURL Examples

#### Get Box Information
```bash
curl --request GET \
  --url "https://your-domain.firewalla.net/v2/boxes" \
  --header "Authorization: Token your_personal_access_token"
```text

#### Get Offline Devices
```bash
curl --request GET \
  --url "https://your-domain.firewalla.net/v2/devices?query=online:false" \
  --header "Authorization: Token your_personal_access_token"
```text

#### Pause a Rule
```bash
curl --request POST \
  --url "https://your-domain.firewalla.net/v2/rules/rule_id_here/pause" \
  --header "Authorization: Token your_personal_access_token"
```text

#### Create Target List
```bash
curl --request POST \
  --url "https://your-domain.firewalla.net/v2/target-lists" \
  --header "Authorization: Token your_personal_access_token" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Social Media",
    "owner": "global",
    "targets": ["facebook.com", "*.twitter.com", "instagram.com"],
    "category": "social",
    "notes": "Popular social media platforms"
  }'
```text

### Environment Configuration

#### Using Environment Variables
```bash
# Set environment variables
export FIREWALLA_MSP_DOMAIN="your-domain.firewalla.net"
export FIREWALLA_MSP_TOKEN="your_personal_access_token"
export FIREWALLA_BOX_ID="your_box_gid_here"

# Run your application
node your_app.js
```text

#### Configuration File (.env)
```env
FIREWALLA_MSP_DOMAIN=your-domain.firewalla.net
FIREWALLA_MSP_TOKEN=your_personal_access_token
FIREWALLA_BOX_ID=your_box_gid_here
```text

---

## Error Handling

### Common HTTP Status Codes

- **200 OK**: Successful request
- **401 Unauthorized**: Invalid or missing authentication token
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server-side error

### Error Response Format

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid authentication token",
    "details": "The provided token is expired or invalid"
  }
}
```text

### Rate Limiting

The API implements rate limiting to ensure fair usage:
- Default limit: 100 requests per minute per token
- Large data requests may have lower limits
- Include appropriate delays between requests
- Monitor response headers for rate limit information

### Best Practices

1. **Always handle errors gracefully**
   ```javascript
   try {
     const response = await apiClient.get('/alarms');
     return response.data;
   } catch (error) {
     if (error.response?.status === 401) {
       // Handle authentication error
       throw new Error('Authentication failed');
     } else if (error.response?.status === 429) {
       // Handle rate limiting
       await delay(60000); // Wait 1 minute
       return retryRequest();
     }
     throw error;
   }
   ```

2. **Implement exponential backoff for retries**
   ```javascript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await delay(Math.pow(2, i) * 1000); // Exponential backoff
       }
     }
   }
   ```

3. **Use appropriate pagination for large datasets**
   ```javascript
   async function getAllFlows(query) {
     const allFlows = [];
     let cursor = null;

     do {
       const params = { query, limit: 500 };
       if (cursor) params.cursor = cursor;

       const response = await apiClient.get('/flows', { params });
       allFlows.push(...response.data.results);
       cursor = response.data.next_cursor;
     } while (cursor);

     return allFlows;
   }
   ```

4. **Validate input parameters**
   ```javascript
   function validateBoxId(boxId) {
     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
     if (!uuidRegex.test(boxId)) {
       throw new Error('Invalid box ID format');
     }
   }
   ```

---

## Conclusion

This API reference provides comprehensive documentation for integrating with the Firewalla MSP API v2. All endpoints, data models, and examples have been verified against official Firewalla documentation and GitHub examples.

For additional support or questions:
- Review the official Firewalla MSP documentation
- Check the [msp-api-examples repository](https://github.com/firewalla/msp-api-examples) for more code samples
- Ensure your MSP account has appropriate permissions for the endpoints you're trying to access

**Important Security Note**: Always protect your personal access tokens and never expose them in client-side code or public repositories. Use environment variables or secure configuration management for production deployments.