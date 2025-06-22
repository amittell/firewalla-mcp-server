# Firewalla API Response Structure Investigation

Based on direct curl calls to the Firewalla MSP API endpoints, here are the actual field names and data structures for each endpoint:

## 1. get_active_alarms (`/v2/alarms`)
**Status:** Unable to retrieve data - endpoint returns empty responses even with various query parameters.
**Note:** This endpoint may require different authentication, different query parameters, or the test environment may not have active alarms.

## 2. get_device_status (`/v2/devices`) ✅
**Successful Response Structure:**

```json
[
  {
    "name": "Device Name",
    "online": true/false,
    "totalDownload": 0,
    "totalUpload": 0,
    "id": "MAC_ADDRESS_OR_DEVICE_ID",
    "mac": "MAC_ADDRESS", // Only for physical devices
    "ip": "192.168.x.x", // Current IP address
    "ipReserved": false,
    "monitoring": true, // Optional field
    "isFirewalla": false,
    "isRouter": false,
    "deviceType": "desktop|phone|tv|camera|etc", // Can be empty string
    "macVendor": "Vendor Name", // Optional
    "lastSeen": 1750561922.123, // Unix timestamp
    "network": {
      "id": "network-uuid",
      "name": "Network Name"
    }
  }
]
```

**Key Field Mappings:**
- Device ID: `id` field
- Device Name: `name` field
- Online Status: `online` field
- MAC Address: `mac` field (only for physical devices)
- IP Address: `ip` field
- Device Type: `deviceType` field
- Network Info: `network.name` and `network.id`
- Last Seen: `lastSeen` field (Unix timestamp)
- Bandwidth: `totalDownload` and `totalUpload` fields

## 3. get_network_rules (`/v2/rules`) ✅
**Successful Response Structure:**

```json
{
  "results": [
    {
      "id": "rule-uuid",
      "action": "block|allow",
      "direction": "bidirection|outbound|inbound",
      "gid": "box-id",
      "status": "active|paused",
      "ts": 1750546618.818, // Creation timestamp
      "updateTs": 1750561364.285, // Last update timestamp
      "notes": "Optional description", // Optional
      "target": {
        "type": "domain|ip|category|app|internet",
        "value": "target_value",
        "dnsOnly": true/false
      },
      "scope": { // Optional - device/network scope
        "type": "device|network",
        "value": "device_mac_or_network_id"
      },
      "schedule": { // Optional - for scheduled rules
        "cronTime": "20 23 * * *",
        "duration": 25200
      },
      "hit": {
        "count": 2,
        "lastHitTs": 1750546644, // Optional
        "statsResetTs": 1750546644 // Optional
      }
    }
  ]
}
```

**Key Field Mappings:**
- Rule ID: `id` field
- Rule Name/Description: `notes` field (optional, may be empty)
- Action: `action` field (block/allow)
- Status: `status` field (active/paused)
- Target: `target.type` and `target.value`
- Scope: `scope.type` and `scope.value` (optional)
- Hit Count: `hit.count`
- Last Hit: `hit.lastHitTs`

## 4. get_flow_data (`/v2/flows`) ✅
**Successful Response Structure:**

```json
{
  "results": [
    {
      "ts": 1750561922.17, // Flow timestamp
      "total": 207061, // Total bytes
      "download": 137007, // Download bytes
      "upload": 70054, // Upload bytes
      "direction": "inbound|outbound",
      "gid": "box-id",
      "country": "US",
      "region": "US", 
      "block": true/false,
      "category": "category_name", // Can be empty
      "duration": 66.33, // Flow duration in seconds
      "protocol": "tcp|udp",
      "oIntf": "interface-id", // Output interface
      "blockedby": "ingress_firewall|rule_name", // If blocked
      "blockType": "ip|domain", // If blocked
      "domain": "domain.com", // If applicable
      "count": 68, // Number of packets/connections
      "source": {
        "id": "source_identifier",
        "type": "device|ip|dns",
        "name": "Source Name",
        "ip": "source_ip",
        "macVendor": "Vendor Name", // For devices
        "deviceType": "device_type", // For devices
        "portInfo": {
          "protocol": "tcp|udp",
          "port": 443,
          "name": "https", // Optional
          "description": "Port description" // Optional
        }
      },
      "destination": {
        "id": "dest_identifier",
        "type": "device|ip|dns|network",
        "name": "Destination Name",
        "ip": "dest_ip",
        "portInfo": {
          "protocol": "tcp|udp",
          "port": 443,
          "name": "https",
          "description": "Port description"
        }
      },
      "device": {
        "id": "device_mac_or_id",
        "ip": "device_ip",
        "macVendor": "Vendor Name",
        "type": "device",
        "name": "Device Name",
        "deviceType": "device_type"
      },
      "network": {
        "name": "Network Name",
        "id": "network-uuid",
        "type": "lan|wan",
        "gid": "box-id"
      }
    }
  ],
  "next_cursor": "pagination_cursor", // For pagination
  "count": 2 // Number of results in this response
}
```

**Key Field Mappings:**
- Flow ID: No explicit ID, use combination of timestamp + source + destination
- Source Info: `source.name`, `source.ip`, `source.type`
- Destination Info: `destination.name`, `destination.ip`, `destination.type`
- Device Info: `device.name`, `device.ip`, `device.id`
- Traffic Data: `total`, `download`, `upload` fields
- Protocol: `protocol` field
- Blocked Status: `block` field and `blockedby` field
- Domain: `domain` field
- Timestamp: `ts` field

## Summary of Required Client Method Updates

1. **get_active_alarms**: Needs investigation - endpoint may require different parameters or authentication
2. **get_device_status**: Update field mappings to use actual API response structure
3. **get_network_rules**: Update to handle `results` array wrapper and correct field names
4. **get_flow_data**: Update to handle `results` array wrapper, pagination cursor, and detailed flow structure

## API Response Patterns

All successful endpoints return either:
- Direct array of objects (devices)
- Object with `results` array and pagination info (rules, flows)

Field naming conventions:
- Timestamps are Unix timestamps with decimal precision
- Boolean fields use true/false
- Optional fields may be missing entirely
- Nested objects are common (network, portInfo, etc.)