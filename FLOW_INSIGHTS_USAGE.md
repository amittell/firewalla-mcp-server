# Flow Insights Tool Usage Guide

The `get_flow_insights` tool provides category-based flow analysis for Firewalla networks, designed to handle high-volume networks (300k+ flows/day) efficiently.

## Tool Overview

Instead of attempting to fetch and analyze hundreds of thousands of individual flows, this tool uses Firewalla's aggregation capabilities to provide actionable insights about network usage patterns.

## Usage Examples

### Basic Usage: Check What Content Categories Were Accessed

```bash
# Get a breakdown of all content categories accessed in the last 24 hours
get_flow_insights

# Get insights for a different time period
get_flow_insights period:"7d"
```

### Specific Category Analysis: "Did Anyone Watch Porn?"

```bash
# Check if porn sites were accessed
get_flow_insights categories:["porn"]

# Check multiple sensitive categories
get_flow_insights categories:["porn", "gamble"] include_blocked:true
```

### Social Media Usage: "What Social Media Was Used?"

```bash
# See all social media usage with top domains
get_flow_insights categories:["social"]

# Check social media usage in the last hour
get_flow_insights period:"1h" categories:["social"]
```

### Bandwidth Analysis: Top Consumers by Category

```bash
# Find which devices are using the most bandwidth and on what categories
get_flow_insights period:"24h"
```

### Blocked Traffic Analysis

```bash
# Include analysis of blocked traffic by category
get_flow_insights include_blocked:true
```

## Output Structure

The tool returns:

1. **Content Categories**: Breakdown of all accessed categories with:
   - Total flow count
   - Total bandwidth (in MB)
   - Top 5 domains per category

2. **Top Bandwidth Devices**: List of top 10 bandwidth consumers showing:
   - Device name/IP
   - Total bandwidth usage
   - Breakdown by category

3. **Blocked Traffic Summary** (if requested): 
   - Total blocked flows
   - Breakdown by category

4. **Summary Statistics**:
   - Total categories accessed
   - Total bandwidth consumed
   - Most active category
   - Top bandwidth consumer

## Real-World Use Cases

### For Parents
- Monitor if children accessed inappropriate content
- Track social media usage patterns
- Identify gaming/streaming bandwidth usage

### For Small Offices
- Monitor productivity (social media vs work sites)
- Track bandwidth usage by category
- Identify potential security threats (malware, suspicious categories)

### For Network Administrators
- Quickly identify bandwidth hogs
- Analyze traffic patterns by category
- Monitor blocked traffic effectiveness

## Performance Benefits

With 338,000 flows in 24 hours:
- Traditional approach: Would need 1,690+ API calls with pagination
- Flow Insights: Uses 2-3 aggregated API calls
- Returns results in seconds instead of minutes

## Integration with Existing Tools

Use alongside other Firewalla MCP tools:

```bash
# First check categories
get_flow_insights categories:["porn", "gamble"]

# Then drill down with search_flows for specific details
search_flows query:"category:porn" limit:20

# Or check specific devices
search_devices query:"name:*kid*" status:"online"
```

## Notes

- The tool automatically handles time zone conversions
- All bandwidth measurements are in MB for readability
- Categories are based on Firewalla's content classification system
- Results are sorted by bandwidth usage for quick identification of heavy users