# Version 1.2.0 Release Notes

## Summary
HTTP Transport Support - Run MCP server standalone in Docker containers and with MCP orchestrators.

## Version Bump Status
✅ **Version bumped**: 1.1.0 → 1.2.0
✅ **package.json**: Updated to 1.2.0
✅ **src/server.ts**: Updated to 1.2.0
✅ **src/monitoring/logger.ts**: Updated to 1.2.0
✅ **Git tag created**: v1.2.0 (local only - push after merge)

## Publishing Checklist

### NPM Publication
After merging to main branch:

```bash
# 1. Checkout main and pull latest
git checkout main
git pull origin main

# 2. Push the tag
git push origin v1.2.0

# 3. Publish to npm
npm publish

# Or use the version script
npm run publish:npm
```

### DockerHub Publication
After merging to main branch:

```bash
# 1. Build Docker image with version tag
docker build -t amittell/firewalla-mcp-server:1.2.0 .
docker build -t amittell/firewalla-mcp-server:latest .

# 2. Push to DockerHub
docker push amittell/firewalla-mcp-server:1.2.0
docker push amittell/firewalla-mcp-server:latest

# 3. Verify the images
docker pull amittell/firewalla-mcp-server:1.2.0
```

### Automated CI/CD (if configured)
If you have GitHub Actions or CI/CD configured:
- Tag push will trigger automated npm publish
- Tag push will trigger automated Docker build and push
- Verify workflows complete successfully

## What's New in 1.2.0

### Features
- ✨ HTTP transport mode for standalone operation
- ✨ Dual transport support (stdio and HTTP)
- ✨ Session management with UUID-based IDs
- ✨ Docker container support with HTTP mode
- ✨ MCP orchestrator compatibility (e.g., open-webui)

### Configuration
- New: `MCP_TRANSPORT` environment variable (stdio/http)
- New: `MCP_HTTP_PORT` environment variable (default: 3000)
- New: `MCP_HTTP_PATH` environment variable (default: /mcp)

### Improvements
- 🔧 Zero breaking changes - stdio remains default
- 🔧 Backward compatible with all existing configurations
- 🔧 All 28 tools functional on both transports
- 🔧 Clean linting (0 errors, 0 warnings)
- 🔧 All tests passing (375/375)

### Documentation
- 📚 Updated README.md with HTTP transport setup
- 📚 Added Docker examples for both transports
- 📚 Added docker-compose example
- 📚 Updated CLAUDE.md with usage instructions

## Migration Guide

### No Migration Required!
Version 1.2.0 is fully backward compatible. Existing installations will continue to work without any changes.

### To Use HTTP Transport
Add to your `.env` or environment:
```env
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
```

Or use Docker:
```bash
docker run -d -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e FIREWALLA_MSP_TOKEN=token \
  -e FIREWALLA_MSP_ID=domain.firewalla.net \
  -e FIREWALLA_BOX_ID=box_gid \
  amittell/firewalla-mcp-server:1.2.0
```

## Resolves
- GitHub Issue #28: HTTP transport support for Docker containers

## Contributors
- Implementation: Claude AI (Anthropic)
- Requested by: jasondad36

---

**Ready for Publication**: This version is ready to be published to npm and DockerHub after merging the PR.
