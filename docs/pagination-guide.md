# Firewalla MCP Server - Pagination Guide

This guide covers the cursor-based pagination system used throughout the Firewalla MCP Server. Understanding pagination is essential for efficiently handling large datasets and building responsive applications.

## Table of Contents

- [Overview](#overview)
- [Cursor Format](#cursor-format)
- [Basic Pagination](#basic-pagination)
- [Advanced Pagination](#advanced-pagination)
- [Pagination Parameters](#pagination-parameters)
- [Response Format](#response-format)
- [Best Practices](#best-practices)
- [Large Dataset Handling](#large-dataset-handling)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)
- [Examples by Tool](#examples-by-tool)

## Overview

The Firewalla MCP Server uses cursor-based pagination to efficiently handle large datasets. This approach provides several advantages over traditional offset-based pagination:

- **Consistent Results**: Cursor pagination ensures consistent results even when data changes during iteration
- **Performance**: Avoids the performance degradation of large offsets
- **Memory Efficiency**: Processes data in manageable chunks
- **Real-time Data**: Handles real-time data streams effectively

### Supported Tools

All major search and data retrieval tools support cursor-based pagination:

- `get_active_alarms` - Security alerts with pagination
- `get_flow_data` - Network flows with cursor support
- `get_device_status` - Device lists with pagination
- `get_bandwidth_usage` - Bandwidth statistics with limits
- `get_network_rules` - Rule sets with pagination
- `search_flows` - Flow search with cursor pagination
- `search_alarms` - Alarm search with cursor support
- `search_devices` - Device search with pagination
- `search_rules` - Rule search with cursor support
- `search_target_lists` - Target list search with pagination

## Cursor Format

Cursors are base64-encoded JSON objects containing pagination state information. Understanding the cursor format helps with debugging and optimization.

### Cursor Structure

```typescript
interface CursorData {
  offset: number;           // Current position in the dataset
  page_size: number;        // Number of items per page
  total_items?: number;     // Total items (if known)
  sort_by?: string;         // Sort field
  sort_order?: 'asc' | 'desc'; // Sort direction
}
```

### Example Cursor

```json
{
  "offset": 100,
  "page_size": 50,
  "total_items": 1500,
  "sort_by": "timestamp",
  "sort_order": "desc"
}
```

**Base64 Encoded:**
```text
eyJvZmZzZXQiOjEwMCwicGFnZV9zaXplIjo1MCwidG90YWxfaXRlbXMiOjE1MDAsInNvcnRfYnkiOiJ0aW1lc3RhbXAiLCJzb3J0X29yZGVyIjoiZGVzYyJ9
```

### Cursor Validation

The server validates all cursors to ensure:
- Valid base64 encoding
- Valid JSON structure
- Required fields present (offset, page_size)
- Reasonable values (non-negative offset, positive page_size)

## Basic Pagination

### First Request

Start pagination by making a request without a cursor:

```json
{
  "query": "severity:high",
  "limit": 50
}
```

**Response:**
```json
{
  "results": [...],
  "count": 50,
  "total_count": 247,
  "next_cursor": "eyJvZmZzZXQiOjUwLCJwYWdlX3NpemUiOjUwfQ==",
  "has_more": true,
  "execution_time_ms": 125
}
```

### Subsequent Requests

Use the `next_cursor` from the previous response:

```json
{
  "query": "severity:high",
  "limit": 50,
  "cursor": "eyJvZmZzZXQiOjUwLCJwYWdlX3NpemUiOjUwfQ=="
}
```

**Response:**
```json
{
  "results": [...],
  "count": 50,
  "total_count": 247,
  "next_cursor": "eyJvZmZzZXQiOjEwMCwicGFnZV9zaXplIjo1MH0=",
  "has_more": true,
  "execution_time_ms": 98
}
```

### Final Page

When `has_more` is false and `next_cursor` is null:

```json
{
  "results": [...],
  "count": 47,
  "total_count": 247,
  "next_cursor": null,
  "has_more": false,
  "execution_time_ms": 87
}
```

## Advanced Pagination

### Pagination with Sorting

Specify sorting parameters to maintain consistent order:

```json
{
  "query": "severity:high",
  "limit": 50,
  "sort_by": "timestamp",
  "sort_order": "desc"
}
```

**Response includes sort information in cursor:**
```json
{
  "results": [...],
  "next_cursor": "eyJvZmZzZXQiOjUwLCJwYWdlX3NpemUiOjUwLCJzb3J0X2J5IjoidGltZXN0YW1wIiwic29ydF9vcmRlciI6ImRlc2MifQ=="
}
```

### Pagination with Aggregation

When using aggregation, pagination applies to aggregated results:

```json
{
  "query": "protocol:tcp",
  "limit": 25,
  "group_by": "source_ip",
  "aggregate": true
}
```

**Response:**
```json
{
  "results": [...],
  "aggregations": {
    "source_ip": {
      "192.168.1.100": 150,
      "192.168.1.101": 89,
      "192.168.1.102": 76
    }
  },
  "next_cursor": "...",
  "has_more": true
}
```

### Pagination with Time Ranges

Time-based pagination for temporal data:

```json
{
  "query": "severity:high",
  "limit": 100,
  "time_range": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "sort_by": "timestamp",
  "sort_order": "asc"
}
```

## Pagination Parameters

### Required Parameters

- `limit`: Maximum number of items to return (required for most tools)

### Optional Parameters

- `cursor`: Base64-encoded cursor for pagination continuation
- `sort_by`: Field name to sort by
- `sort_order`: Sort direction (`asc` or `desc`)
- `offset`: Alternative to cursor for simple offset-based pagination (deprecated)

### Parameter Validation

The server validates pagination parameters:

```typescript
// Limit validation
{
  "limit": 50,        // Valid: reasonable page size
  "limit": 10000,     // Valid: at maximum allowed limit
  "limit": 0,         // Invalid: must be positive
  "limit": 50000      // Invalid: exceeds maximum limit
}

// Sort order validation
{
  "sort_order": "asc",    // Valid
  "sort_order": "desc",   // Valid
  "sort_order": "random"  // Invalid: not supported
}
```

## Response Format

### Standard Pagination Response

All paginated responses follow this format:

```typescript
interface PaginatedResponse<T> {
  results: T[];              // Current page of results
  count: number;             // Number of items in current page
  total_count: number;       // Total items across all pages
  next_cursor?: string;      // Cursor for next page (if has_more is true)
  has_more: boolean;         // Whether more pages are available
  query?: string;            // Original query executed
  execution_time_ms: number; // Query execution time
  aggregations?: Record<string, any>; // Aggregation results (if requested)
}
```

### Metadata Fields

- **count**: Items in the current page
- **total_count**: Total items matching the query
- **has_more**: Boolean indicating if more pages exist
- **next_cursor**: Cursor for the next page (null if no more pages)
- **execution_time_ms**: Server-side execution time in milliseconds

### Error Responses

Pagination errors follow the standard error format:

```json
{
  "error": true,
  "message": "Invalid cursor format",
  "tool": "search_flows",
  "errorType": "validation_error",
  "validation_errors": ["Failed to decode cursor: Invalid cursor format"]
}
```

## Best Practices

### Page Size Selection

Choose appropriate page sizes based on your use case:

```typescript
// Small pages for real-time updates
{
  "limit": 25,  // Good for frequent polling
  "cursor": "..."
}

// Medium pages for interactive browsing
{
  "limit": 100, // Good for user interfaces
  "cursor": "..."
}

// Large pages for bulk processing
{
  "limit": 1000, // Good for data export/analysis
  "cursor": "..."
}
```

### Cursor Storage

Store cursors appropriately:

```typescript
// Good: Store cursor for session continuation
const sessionState = {
  query: "severity:high",
  lastCursor: "eyJvZmZzZXQiOjEwMCwicGFnZV9zaXplIjo1MH0=",
  pageSize: 50
};

// Good: Validate cursor before use
function isValidCursor(cursor: string): boolean {
  try {
    const decoded = atob(cursor);
    const data = JSON.parse(decoded);
    return data.offset >= 0 && data.page_size > 0;
  } catch {
    return false;
  }
}
```

### Consistent Sorting

Always use consistent sorting for predictable pagination:

```typescript
// Good: Consistent sort order
{
  "query": "severity:high",
  "sort_by": "timestamp",
  "sort_order": "desc",
  "limit": 50
}

// Problematic: No sorting (order may change between requests)
{
  "query": "severity:high",
  "limit": 50
}
```

### Error Handling

Handle pagination errors gracefully:

```typescript
// Example error handling pattern
async function paginateResults(query: string, limit: number, cursor?: string) {
  try {
    const response = await searchFlows({ query, limit, cursor });
    return response;
  } catch (error) {
    if (error.message.includes('Invalid cursor')) {
      // Restart pagination from beginning
      return await searchFlows({ query, limit });
    }
    throw error;
  }
}
```

## Large Dataset Handling

### Streaming Pattern

For very large datasets, use a streaming approach:

```typescript
async function* streamAllResults(query: string, pageSize: number = 1000) {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await searchFlows({
      query,
      limit: pageSize,
      cursor
    });

    yield response.results;

    cursor = response.next_cursor;
    hasMore = response.has_more;
  }
}

// Usage
for await (const batch of streamAllResults("severity:high", 500)) {
  // Process each batch of 500 results
  await processBatch(batch);
}
```

### Batch Processing

Process large datasets in manageable chunks:

```typescript
async function processAllResults(query: string) {
  let cursor: string | undefined;
  let processedCount = 0;

  do {
    const response = await searchFlows({
      query,
      limit: 1000,
      cursor,
      sort_by: "timestamp",
      sort_order: "desc"
    });

    // Process the current batch
    await processBatch(response.results);
    processedCount += response.count;

    // Update cursor for next iteration
    cursor = response.next_cursor;

    // Progress tracking
    console.log(`Processed ${processedCount}/${response.total_count} items`);

  } while (cursor);

  console.log(`Completed processing ${processedCount} total items`);
}
```

### Memory Management

Manage memory efficiently with large datasets:

```typescript
// Good: Process and release batches
async function efficientProcessing(query: string) {
  let cursor: string | undefined;

  do {
    const response = await searchFlows({ query, limit: 500, cursor });

    // Process batch
    const processed = await processBatch(response.results);

    // Store only aggregated results, not raw data
    await storeResults(processed);

    cursor = response.next_cursor;

    // Explicit garbage collection hint for large datasets
    if (global.gc) global.gc();

  } while (cursor);
}
```

## Performance Optimization

### Optimal Page Sizes

Choose page sizes based on data characteristics:

```typescript
// For real-time monitoring (frequent updates)
const realtimePageSize = 25;

// For interactive browsing (user interfaces)
const interactivePageSize = 100;

// For bulk processing (data analysis)
const bulkPageSize = 1000;

// For memory-constrained environments
const conservativePageSize = 50;
```

### Caching Strategies

Implement intelligent caching for frequently accessed pages:

```typescript
class PaginationCache {
  private cache = new Map<string, any>();
  private readonly TTL = 60000; // 1 minute

  getCacheKey(query: string, cursor?: string): string {
    return `${query}:${cursor || 'first'}`;
  }

  async getPaginatedResults(query: string, limit: number, cursor?: string) {
    const cacheKey = this.getCacheKey(query, cursor);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

    const results = await searchFlows({ query, limit, cursor });

    this.cache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });

    return results;
  }
}
```

### Parallel Processing

Process multiple pages in parallel when order doesn't matter:

```typescript
async function parallelProcessing(query: string, totalPages: number) {
  const pageSize = 500;
  const promises: Promise<any>[] = [];

  // Create promises for each page
  for (let page = 0; page < totalPages; page++) {
    const offset = page * pageSize;
    const cursor = btoa(JSON.stringify({ offset, page_size: pageSize }));

    promises.push(
      searchFlows({ query, limit: pageSize, cursor })
        .then(response => ({ page, data: response.results }))
    );
  }

  // Process all pages in parallel
  const results = await Promise.all(promises);

  // Sort results by page number if order matters
  results.sort((a, b) => a.page - b.page);

  return results.flatMap(r => r.data);
}
```

## Troubleshooting

### Common Issues

#### Invalid Cursor Errors

```typescript
// Problem: Corrupted or tampered cursor
{
  "error": true,
  "message": "Failed to decode cursor: Invalid cursor format"
}

// Solution: Restart pagination from beginning
async function handleInvalidCursor(query: string, limit: number) {
  return await searchFlows({ query, limit }); // No cursor = start from beginning
}
```

#### Performance Issues

```typescript
// Problem: Large page sizes causing timeouts
{
  "limit": 10000,  // Too large, may cause timeout
  "query": "protocol:tcp"
}

// Solution: Use smaller page sizes
{
  "limit": 1000,   // More reasonable page size
  "query": "protocol:tcp"
}
```

#### Memory Issues

```typescript
// Problem: Accumulating all results in memory
const allResults = [];
let cursor: string | undefined;

do {
  const response = await searchFlows({ query, limit: 1000, cursor });
  allResults.push(...response.results); // Memory leak with large datasets
  cursor = response.next_cursor;
} while (cursor);

// Solution: Process in batches
let cursor: string | undefined;

do {
  const response = await searchFlows({ query, limit: 1000, cursor });
  await processBatch(response.results); // Process immediately
  cursor = response.next_cursor;
} while (cursor);
```

### Debug Techniques

#### Cursor Inspection

```typescript
function inspectCursor(cursor: string) {
  try {
    const decoded = atob(cursor);
    const data = JSON.parse(decoded);
    console.log('Cursor data:', data);
    return data;
  } catch (error) {
    console.error('Invalid cursor:', error.message);
    return null;
  }
}

// Usage
const cursorData = inspectCursor("eyJvZmZzZXQiOjEwMCwicGFnZV9zaXplIjo1MH0=");
// Output: { offset: 100, page_size: 50 }
```

#### Progress Tracking

```typescript
async function paginateWithProgress(query: string, pageSize: number) {
  let cursor: string | undefined;
  let processedCount = 0;
  let totalCount = 0;

  do {
    const response = await searchFlows({ query, limit: pageSize, cursor });

    if (totalCount === 0) {
      totalCount = response.total_count;
    }

    processedCount += response.count;
    const progress = (processedCount / totalCount * 100).toFixed(1);

    console.log(`Progress: ${processedCount}/${totalCount} (${progress}%)`);

    cursor = response.next_cursor;
  } while (cursor);
}
```

## Examples by Tool

### Flow Search Pagination

```typescript
// Basic flow pagination
const flowPagination = async () => {
  let cursor: string | undefined;
  let allFlows: Flow[] = [];

  do {
    const response = await searchFlows({
      query: "protocol:tcp AND bytes:>1000000",
      limit: 200,
      cursor,
      sort_by: "timestamp",
      sort_order: "desc"
    });

    allFlows.push(...response.results);
    cursor = response.next_cursor;

  } while (cursor);

  return allFlows;
};
```

### Alarm Search Pagination

```typescript
// Alarm pagination with time filtering
const alarmPagination = async () => {
  let cursor: string | undefined;
  const alarms: Alarm[] = [];

  do {
    const response = await searchAlarms({
      query: "severity:high OR severity:critical",
      limit: 100,
      cursor,
      time_range: {
        start: "2024-01-01T00:00:00Z",
        end: "2024-01-31T23:59:59Z"
      }
    });

    // Process alarms immediately
    await processAlarms(response.results);

    cursor = response.next_cursor;

  } while (cursor);
};
```

### Device Status Pagination

```typescript
// Device pagination with filtering
const devicePagination = async () => {
  let cursor: string | undefined;
  let onlineDevices = 0;
  let offlineDevices = 0;

  do {
    const response = await getDeviceStatus({
      limit: 150,
      cursor
    });

    // Count device status
    response.results.forEach(device => {
      if (device.online) {
        onlineDevices++;
      } else {
        offlineDevices++;
      }
    });

    cursor = response.next_cursor;

  } while (cursor);

  return { online: onlineDevices, offline: offlineDevices };
};
```

### Rule Search Pagination

```typescript
// Rule pagination with aggregation
const rulePagination = async () => {
  let cursor: string | undefined;
  const rulesByAction: Record<string, number> = {};

  do {
    const response = await searchRules({
      query: "status:active",
      limit: 100,
      cursor,
      group_by: "action",
      aggregate: true
    });

    // Aggregate rule counts by action
    if (response.aggregations?.action) {
      Object.entries(response.aggregations.action).forEach(([action, count]) => {
        rulesByAction[action] = (rulesByAction[action] || 0) + (count as number);
      });
    }

    cursor = response.next_cursor;

  } while (cursor);

  return rulesByAction;
};
```

This comprehensive pagination guide provides everything you need to efficiently handle large datasets in the Firewalla MCP Server. Remember to choose appropriate page sizes, handle errors gracefully, and process data in manageable chunks for optimal performance.