#!/bin/bash

# Test script to prepare and verify the package before publishing to npm
# Run this from the project root: ./test-before-publish.sh
# It will run builds, tests, lints, local executions, and pack for manual verification.
# If all pass, you can proceed to `npm publish`.

set -e  # Exit on any error

echo "Starting pre-publish verification..."

# Step 1: Install dependencies (if needed)
echo "Installing dependencies..."
npm install

# Step 2: Run lint checks
echo "Running lint check..."
npm run lint:check

# Step 3: Run format check
echo "Running format check..."
npm run format:check

# Step 4: Run typecheck
echo "Running typecheck..."
npm run typecheck

# Step 5: Clean and build
echo "Cleaning and building..."
npm run build:clean

# Step 6: Run all tests (using test:ci for CI-like behavior)
echo "Running tests..."
npm run test:ci

# Step 7: Test local execution (start the server briefly)
echo "Testing local start (will run for 5 seconds)..."
npm start &  # Start in background
SERVER_PID=$!
sleep 5  # Wait a bit to let it start
kill $SERVER_PID || true  # Stop it

# Step 8: Test MCP-specific start
echo "Testing MCP start (will run for 5 seconds)..."
npm run mcp:start &  
MCP_PID=$!
sleep 5
kill $MCP_PID || true

# Step 9: Create a pack for local NPX testing
echo "Packing the package..."
npm pack

# Step 10: Instructions for manual NPX test
echo "Package packed successfully. For manual NPX test:"
echo "1. Create a temp dir: mkdir temp-test && cd temp-test"
echo "2. Run: npx ../firewalla-mcp-server-1.0.0.tgz"
echo "   (Adjust path if version differs)"
echo "3. Clean up after: cd .. && rm -rf temp-test"

# If all steps pass
echo "All automated checks passed! You can now run 'npm publish' if manual tests look good."
echo "Remember to log in with 'npm login' if not already done."
