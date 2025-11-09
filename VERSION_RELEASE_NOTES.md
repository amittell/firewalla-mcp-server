# Version 1.2.1 Release Notes

## Summary
Security patch release - Includes all features from v1.2.0 plus critical CVE fix in form-data dependency.

## Version Bump Status
✅ **Version bumped**: 1.2.0 → 1.2.1
✅ **package.json**: Updated to 1.2.1
✅ **package-lock.json**: Updated to 1.2.1
✅ **Dockerfile**: Updated to 1.2.1
✅ **src/monitoring/logger.ts**: Updated to 1.2.1
✅ **Git tag**: v1.2.1 (to be created)

## Publishing Checklist

### NPM Publication
After merging to main branch:

```bash
# 1. Checkout main and pull latest
git checkout main
git pull origin main

# 2. Create and push the tag
git tag -a v1.2.1 -m "Version 1.2.1 - Security patch for CVE-2025-7783"
git push origin v1.2.1

# 3. Publish to npm
npm publish

# Or use the version script
npm run publish:npm
```

### DockerHub Publication
After merging to main branch:

```bash
# 1. Build Docker image with version tag
docker build -t amittell/firewalla-mcp-server:1.2.1 .
docker build -t amittell/firewalla-mcp-server:latest .

# 2. Push to DockerHub
docker push amittell/firewalla-mcp-server:1.2.1
docker push amittell/firewalla-mcp-server:latest

# 3. Verify the images
docker pull amittell/firewalla-mcp-server:1.2.1
```

### Automated CI/CD (if configured)
If you have GitHub Actions or CI/CD configured:
- Tag push will trigger automated npm publish
- Tag push will trigger automated Docker build and push
- Verify workflows complete successfully

## What's New in 1.2.1

### Security Fixes
- 🔒 **CRITICAL**: Fixed CVE-2025-7783 in form-data dependency
- 🔒 Updated form-data from 4.0.3 to 4.0.4
- 🔒 Addresses predictable boundary generation vulnerability

### Features (from 1.2.0)
- ✨ HTTP transport mode for standalone operation
- ✨ Dual transport support (stdio and HTTP)
- ✨ Session management with UUID-based IDs
- ✨ Docker container support with HTTP mode
- ✨ MCP orchestrator compatibility (e.g., open-webui)
- ✨ Optional FIREWALLA_BOX_ID for MSP connections

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
- CVE-2025-7783: Predictable boundary generation in form-data
- GitHub Issue #28: HTTP transport support for Docker containers
- GitHub Issue #27: Make FIREWALLA_BOX_ID optional for MSP connections

## Contributors
- Implementation: Claude AI (Anthropic)
- Requested by: jasondad36

---

**Ready for Publication**: This version is ready to be published to npm and DockerHub after merging the PR.
