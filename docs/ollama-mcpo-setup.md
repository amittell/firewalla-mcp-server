# Firewalla MCP Server with Ollama + MCPO Setup Guide

This guide helps you set up the Firewalla MCP Server with Ollama using MCPO (MCP Proxy for Ollama).

## Prerequisites

- Ollama installed and running
- Open-WebUI installed
- MCPO server installed
- Node.js 18+ installed
- Firewalla MCP server cloned/installed

## Common Issues and Solutions

### Issue: MCPO server won't start when Firewalla MCP is added

This typically happens due to:
1. Missing Node.js or wrong Node version
2. Incorrect path to the Firewalla server
3. Missing npm dependencies
4. Environment variable issues

## Step-by-Step Setup

### 1. First, ensure Firewalla MCP server is built

```bash
cd /path/to/firewalla-mcp-server
npm install
npm run build
```

### 2. Create a startup script for MCPO

Create `firewalla-mcp-launcher.sh`:

```bash
#!/bin/bash
# Launcher script for Firewalla MCP with MCPO

# Set your Firewalla credentials here
export FIREWALLA_MSP_TOKEN="your_msp_token_here"
export FIREWALLA_MSP_ID="yourdomain.firewalla.net"
export FIREWALLA_BOX_ID="your-box-id-here"

# Path to Firewalla MCP server (adjust this!)
FIREWALLA_PATH="/path/to/firewalla-mcp-server"

# Change to the Firewalla directory
cd "$FIREWALLA_PATH"

# Run the server
exec node dist/server.js
```

Make it executable:
```bash
chmod +x firewalla-mcp-launcher.sh
```

### 3. MCPO config.json Configuration

Your MCPO `config.json` should look like this:

```json
{
  "mcpServers": {
    "time": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-time"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "postgresql://user:password@localhost/db"
      }
    },
    "firewalla": {
      "command": "/absolute/path/to/firewalla-mcp-launcher.sh",
      "args": [],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 4. Alternative: Direct Node Configuration

If the launcher script doesn't work, try this direct configuration:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "node",
      "args": ["/absolute/path/to/firewalla-mcp-server/dist/server.js"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your-box-id",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 5. Debugging Steps

1. **Test Firewalla server standalone:**
   ```bash
   cd /path/to/firewalla-mcp-server
   export FIREWALLA_MSP_TOKEN="your_token"
   export FIREWALLA_MSP_ID="yourdomain.firewalla.net"
   export FIREWALLA_BOX_ID="your-box-id"
   node dist/server.js
   ```
   
   You should see no errors. Press Ctrl+C to stop.

2. **Check MCPO logs:**
   ```bash
   # Run MCPO in debug mode
   uvicorn app:app --host 0.0.0.0 --port 8000 --log-level debug
   ```

3. **Test with minimal config:**
   Start with just the Firewalla server in config.json:
   ```json
   {
     "mcpServers": {
       "firewalla": {
         "command": "node",
         "args": ["/absolute/path/to/firewalla-mcp-server/dist/server.js"],
         "env": {
           "FIREWALLA_MSP_TOKEN": "test_token",
           "FIREWALLA_MSP_ID": "test.firewalla.net",
           "FIREWALLA_BOX_ID": "test-box-id"
         }
       }
     }
   }
   ```

### 6. Common Fixes

1. **Ensure all paths are absolute**, not relative
2. **Check Node.js is in PATH**: `which node`
3. **Verify the built files exist**: `ls -la /path/to/firewalla-mcp-server/dist/server.js`
4. **Check permissions**: The user running MCPO must have execute permissions
5. **Environment variables**: Some systems need explicit PATH settings

### 7. Alternative: Using npx

If direct node execution fails, try using npx:

```json
{
  "mcpServers": {
    "firewalla": {
      "command": "sh",
      "args": [
        "-c",
        "cd /path/to/firewalla-mcp-server && npm run start"
      ],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_token",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your-box-id"
      }
    }
  }
}
```

## Troubleshooting Checklist

- [ ] Node.js 18+ is installed and in PATH
- [ ] Firewalla MCP server is built (`npm run build`)
- [ ] All paths in config.json are absolute
- [ ] Environment variables are set correctly
- [ ] No syntax errors in config.json (validate with `jq . config.json`)
- [ ] MCPO has permissions to execute the files
- [ ] No port conflicts on 8000

## Getting Help

If you're still having issues:

1. Share your MCPO logs
2. Share your exact config.json (with credentials removed)
3. Share the output of:
   ```bash
   node --version
   which node
   ls -la /path/to/firewalla-mcp-server/dist/
   ```