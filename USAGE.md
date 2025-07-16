# Simple Usage Guide

This guide shows you how to get started with the Firewalla MCP Server after installation.

## Quick Start

### 1. First Time Setup

After installing and configuring (see [README.md](README.md)), test your connection:

```
"Can you check my Firewalla status?"
```

You should see a summary of your firewall's health and current status.

### 2. Common Queries

Here are practical examples you can try right away:

#### Security Monitoring
```
"Show me any security alerts from the last hour"
"What are my high-severity alarms?"
"Are there any blocked attack attempts?"
```

#### Bandwidth Analysis
```
"Which devices are using the most bandwidth today?"
"Show me top 10 bandwidth users this week"
"What's consuming my internet speed?"
```

#### Device Management
```
"List all devices on my network" 
"Are there any offline devices?"
"Show me devices by Apple"
```

#### Network Rules
```
"What firewall rules are active?"
"Show me rules that are blocking traffic"
"Which rules have been triggered the most?"
```

## Search Syntax

The server supports powerful search queries:

### Basic Searches
```
"Find flows with high bandwidth usage"
"Search for alarms with severity high"
"Show devices that are offline"
```

### Advanced Searches
```
"Find flows from IP 192.168.1.* AND bytes > 1000000"
"Search alarms: severity:high OR severity:critical"
"Show rules: action:block AND target_value:*.facebook.com"
```

### Geographic Searches
```
"Find traffic from China or Russia"
"Show alarms from high-risk countries"
"Analyze flows by geographic region"
```

## Useful Workflows

### Daily Security Check
```
"Give me a daily security report including:
1. New security alerts
2. Top bandwidth users  
3. Any offline devices
4. Most active firewall rules"
```

### Investigating Issues
```
"Help me investigate slow internet:
1. Show top bandwidth users in last hour
2. Find any unusual traffic patterns
3. Check for blocked legitimate traffic"
```

### Weekly Review
```
"Provide a weekly network summary:
1. Total alarms and their severity
2. Bandwidth trends
3. New devices added
4. Rule effectiveness"
```

## Troubleshooting

### No Results
- Try broader time ranges: "last week" instead of "last hour"
- Use simpler queries first: "show alarms" before complex searches
- Check if your Firewalla is online and reporting data

### Slow Responses
- Add limit parameters: "show me top 10 devices" 
- Use shorter time ranges: "last 2 hours" instead of "last month"
- Try specific queries instead of broad requests

### Authentication Errors
- Verify your MSP token hasn't expired
- Check your Box ID is correct (long UUID format)
- Ensure your Firewalla MSP domain is accessible

## Tips for Best Results

1. **Be Specific**: "Show me high-severity alarms from the last 4 hours" works better than "show alarms"

2. **Use Limits**: "Top 10 bandwidth users" is faster than "all bandwidth users"

3. **Start Simple**: Test basic queries before trying complex searches

4. **Check Status First**: Always verify connection with "show me Firewalla status"

5. **Use Time Ranges**: Specify time ranges to get relevant, recent data

## Getting Help

- Check the main [README.md](README.md) for setup issues
- Look at [CLAUDE.md](CLAUDE.md) for development details
- Review client-specific guides in [docs/clients/](docs/clients/)

---

*For technical details and advanced features, see the full documentation in the project repository.*