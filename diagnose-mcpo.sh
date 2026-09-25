#!/bin/bash

# Diagnostic script for Firewalla MCP + MCPO setup issues

echo "=== MCPO + Firewalla MCP Diagnostic Script ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Node.js
echo "1. Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js found: $NODE_VERSION${NC}"
    
    # Check if version is 18+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
    if [ $MAJOR_VERSION -ge 18 ]; then
        echo -e "${GREEN}✓ Node.js version is 18 or higher${NC}"
    else
        echo -e "${RED}✗ Node.js version is less than 18. Please upgrade.${NC}"
    fi
else
    echo -e "${RED}✗ Node.js not found in PATH${NC}"
    echo "  Please install Node.js 18 or higher"
fi
echo ""

# Check npm
echo "2. Checking npm installation..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm found: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
fi
echo ""

# Get Firewalla path
echo "3. Locating Firewalla MCP Server..."
echo -n "Enter the full path to firewalla-mcp-server directory: "
read FIREWALLA_PATH

if [ -d "$FIREWALLA_PATH" ]; then
    echo -e "${GREEN}✓ Directory exists${NC}"
    
    # Check if built
    if [ -f "$FIREWALLA_PATH/dist/server.js" ]; then
        echo -e "${GREEN}✓ Server is built (dist/server.js exists)${NC}"
    else
        echo -e "${RED}✗ Server not built. Run 'npm run build' in $FIREWALLA_PATH${NC}"
    fi
    
    # Check package.json
    if [ -f "$FIREWALLA_PATH/package.json" ]; then
        echo -e "${GREEN}✓ package.json exists${NC}"
    else
        echo -e "${RED}✗ package.json not found${NC}"
    fi
else
    echo -e "${RED}✗ Directory not found: $FIREWALLA_PATH${NC}"
fi
echo ""

# Test standalone execution
echo "4. Testing standalone server execution..."
echo -e "${YELLOW}Setting test environment variables...${NC}"
export FIREWALLA_MSP_TOKEN="test_token"
export FIREWALLA_MSP_ID="test.firewalla.net"
export FIREWALLA_BOX_ID="test-box-id"

if [ -f "$FIREWALLA_PATH/dist/server.js" ]; then
    echo "Testing server startup (5 second timeout)..."
    timeout 5 node "$FIREWALLA_PATH/dist/server.js" 2>&1 | head -20
    
    if [ ${PIPESTATUS[0]} -eq 124 ]; then
        echo -e "${GREEN}✓ Server started successfully (timed out after 5s as expected)${NC}"
    else
        echo -e "${RED}✗ Server failed to start or exited early${NC}"
    fi
else
    echo -e "${RED}✗ Cannot test - server.js not found${NC}"
fi
echo ""

# Generate sample configs
echo "5. Generating sample MCPO configurations..."

# Create launcher script
cat > firewalla-launcher.sh << 'EOF'
#!/bin/bash
# Auto-generated launcher script
export FIREWALLA_MSP_TOKEN="${FIREWALLA_MSP_TOKEN:-your_token_here}"
export FIREWALLA_MSP_ID="${FIREWALLA_MSP_ID:-yourdomain.firewalla.net}"
export FIREWALLA_BOX_ID="${FIREWALLA_BOX_ID:-your-box-id}"
cd "FIREWALLA_PATH_PLACEHOLDER"
exec node dist/server.js
EOF

sed -i.bak "s|FIREWALLA_PATH_PLACEHOLDER|$FIREWALLA_PATH|g" firewalla-launcher.sh
rm firewalla-launcher.sh.bak
chmod +x firewalla-launcher.sh

echo -e "${GREEN}✓ Created firewalla-launcher.sh${NC}"

# Create sample MCPO configs
cat > mcpo-config-sample1.json << EOF
{
  "mcpServers": {
    "firewalla": {
      "command": "$(pwd)/firewalla-launcher.sh",
      "args": []
    }
  }
}
EOF

cat > mcpo-config-sample2.json << EOF
{
  "mcpServers": {
    "firewalla": {
      "command": "node",
      "args": ["$FIREWALLA_PATH/dist/server.js"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your-box-id"
      }
    }
  }
}
EOF

cat > mcpo-config-sample3.json << EOF
{
  "mcpServers": {
    "firewalla": {
      "command": "sh",
      "args": ["-c", "cd $FIREWALLA_PATH && npm run start"],
      "env": {
        "FIREWALLA_MSP_TOKEN": "your_token_here",
        "FIREWALLA_MSP_ID": "yourdomain.firewalla.net",
        "FIREWALLA_BOX_ID": "your-box-id"
      }
    }
  }
}
EOF

echo -e "${GREEN}✓ Created sample MCPO configurations:${NC}"
echo "  - mcpo-config-sample1.json (using launcher script)"
echo "  - mcpo-config-sample2.json (direct node execution)"
echo "  - mcpo-config-sample3.json (using npm start)"
echo ""

# Final recommendations
echo "6. Recommendations:"
echo "   - Try each sample configuration with MCPO"
echo "   - Replace 'your_token_here' with actual credentials"
echo "   - Ensure all paths are absolute"
echo "   - Check MCPO logs for specific error messages"
echo ""

echo "7. Next steps:"
echo "   1. Update credentials in firewalla-launcher.sh or config files"
echo "   2. Copy one of the sample configs to your MCPO config location"
echo "   3. Restart MCPO and check logs"
echo ""

echo "If issues persist, please share:"
echo "   - The exact error from MCPO logs"
echo "   - Your MCPO config.json (with credentials removed)"
echo "   - Output of this diagnostic script"