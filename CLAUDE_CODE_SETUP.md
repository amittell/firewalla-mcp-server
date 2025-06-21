# Claude Code MCP Server Setup Guide

This guide will walk you through configuring your Firewalla MCP server with Claude Code.

## Prerequisites

1. **Claude Code installed** - Make sure you have Claude Code CLI installed
2. **Firewalla credentials** - You'll need your MSP token and Box ID
3. **Node.js 18+** - Required to run the MCP server

## Step 1: Configure Your Environment

First, set up your Firewalla credentials:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your actual credentials
nano .env  # or use your preferred editor
```

Add your Firewalla MSP credentials to `.env`:

```env
# Firewalla MSP API Configuration
FIREWALLA_MSP_TOKEN=your_actual_msp_token_here
FIREWALLA_MSP_BASE_URL=https://msp.firewalla.com
FIREWALLA_BOX_ID=your_actual_box_id_here

# Development Configuration
NODE_ENV=development
DEBUG=mcp:*
LOG_LEVEL=info

# Optional: API Configuration
API_TIMEOUT=30000
API_RATE_LIMIT=100
CACHE_TTL=300
```

### How to Get Your Firewalla Credentials:

1. **MSP Token**: 
   - Log into your Firewalla MSP portal at https://msp.firewalla.com
   - Go to Settings → API
   - Generate a new access token
   - Copy the token to your `.env` file

2. **Box ID**:
   - In the MSP portal, go to your device list
   - Click on your Firewalla device
   - The Box ID will be shown in the device details

## Step 2: Test Your MCP Server

Build and test the server locally:

```bash
# Install dependencies and build
npm ci
npm run build

# Test the server
npm run mcp:start
```

You should see output like:
```
Firewalla MCP Server running on stdio
```

If you see any errors, check your `.env` file and credentials.

## Step 3: Configure Claude Code

Create the MCP configuration for Claude Code. You have two options:

### Option A: Global Configuration (Recommended)

Create or edit the global MCP configuration file:

**On macOS/Linux:**
```bash
mkdir -p ~/.config/claude-code
```

**On Windows:**
```cmd
mkdir %APPDATA%\claude-code
```

Then create/edit the MCP configuration file:

**File: `~/.config/claude-code/mcp_servers.json` (macOS/Linux)**
**File: `%APPDATA%\claude-code\mcp_servers.json` (Windows)**

```json
{
  "firewalla": {
    "command": "node",
    "args": ["/full/path/to/firewalla_mcp/dist/server.js"],
    "env": {
      "NODE_ENV": "production"
    },
    "cwd": "/full/path/to/firewalla_mcp"
  }
}
```

**Replace `/full/path/to/firewalla_mcp` with the actual absolute path to your project directory.**

### Option B: Project-Specific Configuration

Create a `.claude-code` directory in your project:

```bash
mkdir .claude-code
```

Create the MCP configuration file:

**File: `.claude-code/mcp_servers.json`**

```json
{
  "firewalla": {
    "command": "npm",
    "args": ["run", "mcp:start"],
    "cwd": "."
  }
}
```

## Step 4: Connect Claude Code to Your MCP Server

Now start Claude Code and connect to your MCP server:

```bash
# Start Claude Code
claude-code

# Or start with MCP debugging enabled
DEBUG=mcp:* claude-code
```

In Claude Code, you can verify the connection by asking:

```
Are you connected to my Firewalla MCP server?
```

If successful, Claude should confirm the connection and show available tools.

## Step 5: Test Your Setup

Try these example queries to test your Firewalla MCP server:

1. **Check firewall status:**
   ```
   What's the current status of my Firewalla firewall?
   ```

2. **Get security alerts:**
   ```
   Show me any active security alerts on my network
   ```

3. **Check device status:**
   ```
   Which devices are currently online on my network?
   ```

4. **Bandwidth analysis:**
   ```
   What devices are using the most bandwidth in the last 24 hours?
   ```

5. **Generate security report:**
   ```
   Generate a security report for my network over the last 24 hours
   ```

## Troubleshooting

### Common Issues:

1. **"Cannot connect to MCP server"**
   - Check that your `.env` file has correct credentials
   - Verify the server builds successfully: `npm run build`
   - Test the server manually: `npm run mcp:start`

2. **"Authentication failed"**
   - Verify your `FIREWALLA_MSP_TOKEN` is correct and not expired
   - Check your `FIREWALLA_BOX_ID` is accurate
   - Ensure your MSP subscription is active

3. **"Path not found" errors**
   - Make sure you use absolute paths in the MCP configuration
   - Check that the `dist/server.js` file exists after building

4. **Permission errors**
   - Ensure Claude Code has permission to execute the server
   - On Unix systems, you might need: `chmod +x dist/server.js`

### Debug Mode:

To enable detailed logging:

```bash
# Set debug environment
export DEBUG=mcp:*

# Start Claude Code with debugging
claude-code
```

Check the logs in the `logs/` directory for detailed error information.

### Health Check:

You can manually test the server health:

```bash
# Test Firewalla API connection
node -e "
const { FirewallaClient } = require('./dist/firewalla/client.js');
const { config } = require('./dist/config/config.js');
const client = new FirewallaClient(config);
client.getFirewallSummary().then(console.log).catch(console.error);
"
```

## Advanced Configuration

### Custom Logging:

Add to your `.env` file:

```env
# Logging configuration
LOG_LEVEL=debug
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
```

### Rate Limiting:

Adjust API rate limits if needed:

```env
# API Configuration
API_RATE_LIMIT=50  # Lower for rate-limited accounts
API_TIMEOUT=45000  # Increase timeout if needed
```

### Production Deployment:

For production use, consider using PM2 or similar process manager:

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name firewalla-mcp
```

## Next Steps

Once configured, you can:

1. **Ask complex questions** about your network security
2. **Generate reports** using the built-in prompts
3. **Monitor network activity** in real-time
4. **Investigate security incidents** with detailed analysis
5. **Automate security monitoring** through Claude conversations

## Support

If you encounter issues:

1. Check the logs in `logs/` directory
2. Review the troubleshooting section above
3. Ensure your Firewalla MSP subscription is active
4. Verify network connectivity to Firewalla servers

Your Firewalla MCP server is now ready to provide Claude with comprehensive firewall insights! 🎉