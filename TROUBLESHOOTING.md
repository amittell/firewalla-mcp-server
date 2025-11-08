# Troubleshooting Guide

Common issues and solutions for the Firewalla MCP Server.

## Installation Issues

### `npm install` fails
```bash
# Try clearing npm cache
npm cache clean --force
npm install

# Or use specific Node version
nvm use 18
npm install
```

### TypeScript compilation errors
```bash
# Clean and rebuild
npm run clean
npm run build
```

### Permission errors on install
```bash
# Use npx instead of global install
npx firewalla-mcp-server

# Or fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

## Connection Issues

### "Authentication failed" errors

**Check your credentials:**
1. Verify MSP token is valid (log into MSP portal)
2. Check Box ID format (should be UUID-like `1eb71e38-3a95-4371-8903-ace24c83ab49`)
3. Confirm MSP domain is correct (`yourdomain.firewalla.net`)

**Test credentials manually:**
```bash
# Set environment variables
export FIREWALLA_MSP_TOKEN="your_token"
export FIREWALLA_MSP_ID="your_domain.firewalla.net"  
export FIREWALLA_BOX_ID="your_box_gid"

# Test the server
npm run mcp:start
```

### "Server not responding" errors

**Check server status:**
```bash
# Start with debug logging
DEBUG=mcp:* npm run mcp:start

# Check if server is actually running
ps aux | grep firewalla-mcp-server
```

**Restart Claude Desktop:**
1. Quit Claude Desktop completely
2. Wait 10 seconds
3. Restart Claude Desktop
4. Try a simple query

### "No data returned" issues

**Common causes:**
- Firewalla device is offline
- MSP account has no recent data
- Time range is too narrow
- API rate limits hit

**Solutions:**
```bash
# Check your Firewalla status first
"Is my Firewalla online and working?"

# Try broader queries
"Show me any alarms from the last week"

# Check specific tools
"Test connection to Firewalla API"
```

## Configuration Issues

### Claude Desktop config not working

**Config file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Common config mistakes:**
```json
// ❌ Wrong - missing quotes or commas
{
  mcpServers: {
    firewalla: {
      command: npx
    }
  }
}

// ✅ Correct - proper JSON format  
{
  "mcpServers": {
    "firewalla": {
      "command": "npx",
      "args": ["firewalla-mcp-server"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_token",
        "FIREWALLA_MSP_ID": "domain.firewalla.net",
        "FIREWALLA_BOX_ID": "your_box_gid"
      }
    }
  }
}
```

### Environment variables not working

**Check .env file:**
```bash
# Make sure .env file exists in project root
ls -la .env

# Check format (no spaces around =)
cat .env
FIREWALLA_MSP_TOKEN=abc123
FIREWALLA_MSP_ID=company.firewalla.net
FIREWALLA_BOX_ID=1eb71e38-3a95-4371-8903-ace24c83ab49
```

## Performance Issues

### Slow responses

**Quick fixes:**
1. Add limits to queries: "top 10 devices" instead of "all devices"
2. Use shorter time ranges: "last 2 hours" vs "last month"  
3. Clear cache: restart the MCP server

**Check caching:**
```bash
# Enable cache debugging
DEBUG=cache npm run mcp:start
```

### Memory issues

**Reduce memory usage:**
```bash
# Use smaller limits
"Show me top 5 bandwidth users"

# Restart server regularly
pkill -f firewalla-mcp-server
npm run mcp:start
```

## Query Issues

### "No results found"

**Troubleshooting steps:**
1. Try simpler queries first: "show alarms" before complex searches
2. Check time ranges: use "last week" instead of "yesterday"  
3. Verify your Firewalla has data: check MSP portal directly

### Search syntax errors

**Common mistakes:**
```bash
# ❌ Wrong syntax
"Find flows where bytes > 1000000"

# ✅ Correct syntax
"Search flows: bytes:>1000000"
```

**Valid operators:**
- `AND`, `OR`, `NOT`
- `:`, `>`, `<`, `>=`, `<=`
- `*` for wildcards
- `[100 TO 1000]` for ranges

### Tool parameter errors

**Missing required parameters:**
```bash
# ❌ Missing limit parameter
get_device_status({})

# ✅ Include required parameters  
get_device_status({limit: 50})
```

## Debug Mode

### Enable debug logging

```bash
# Full debugging
DEBUG=firewalla:* npm run mcp:start

# Specific components
DEBUG=cache,api npm run mcp:start
DEBUG=validation,error npm run mcp:start
```

### Check logs

```bash
# Monitor server output
npm run mcp:start | tee server.log

# Check for specific errors
grep -i error server.log
grep -i authentication server.log
```

## Getting Help

### Test basic functionality

```bash
# 1. Test server starts
npm run mcp:start

# 2. Test in Claude with simple query
"Can you connect to my Firewalla?"

# 3. Test specific tool
"Show me basic Firewalla statistics"
```

### Collect debug information

When reporting issues, include:
1. Node.js version: `node --version`
2. npm version: `npm --version`
3. Server logs with debug enabled
4. Your config file (without credentials)
5. Error messages from Claude Desktop

### Check known issues

1. Review [GitHub issues](https://github.com/amittell/firewalla-mcp-server/issues)
2. Check the main [README.md](README.md) 
3. Look at client-specific guides in [docs/clients/](docs/clients/)

---

*Still having issues? Open an issue on GitHub with debug logs and steps to reproduce.*