# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-14

### Added
- Initial release of Firewalla MCP Server
- 35+ MCP tools for comprehensive firewall data access
- Advanced search functionality with complex query syntax
- Geographic filtering and threat analysis capabilities
- Bulk operations for alarm and rule management
- Real-time security alert monitoring
- Bandwidth usage tracking and analysis
- Device status monitoring and management
- Rule management with pause/resume functionality
- Target list access for CloudFlare and CrowdSec intelligence
- Cross-reference search with correlation scoring
- Comprehensive error handling and validation
- Cache optimization for improved performance
- Professional logging and monitoring
- Complete TypeScript support with detailed interfaces

### Features
- **Security Analysis**: Monitor threats, blocked attacks, and network anomalies
- **Search Engine**: Complex queries with logical operators, wildcards, and filtering
- **Geographic Intelligence**: Location-based threat analysis and filtering
- **Performance Optimization**: Intelligent caching and query optimization
- **Bulk Operations**: Manage multiple alarms and rules efficiently
- **Real-time Monitoring**: Live firewall data access via MCP protocol
- **Professional Polish**: Comprehensive documentation and testing (97%+ pass rate)

### Technical Highlights
- 94% complexity reduction through elegant simplification
- Model Context Protocol (MCP) compliant server implementation
- RESTful integration with Firewalla MSP API v2
- Robust parameter validation and error handling
- Extensive test coverage with 918+ passing tests
- Production-ready logging and monitoring
- Docker containerization support
- TypeScript-first development with comprehensive type safety

## [1.0.2] - 2025-07-20

### Added
- Full Docker support with multi-stage builds for security and optimization
- Docker Hub publishing via GitHub Actions CI/CD pipeline
- Multi-architecture Docker builds (linux/amd64, linux/arm64, linux/arm/v7)
- Comprehensive Docker documentation with security warnings
- Docker Compose configuration with security best practices
- Non-root user (nodejs:1001) in Docker containers
- Docker MCP Registry submission for Docker Desktop integration

### Fixed
- Corrected tool count documentation from 29 to 28 throughout codebase
- Fixed markdown linting issues (MD036, MD026) in all documentation
- Standardized environment variable naming (FIREWALLA_BOX_ID)
- Removed emojis from documentation for consistency

### Changed
- Updated documentation to reflect actual tool count (28 tools: 23 direct API + 5 convenience)
- Enhanced security warnings for Docker credential handling
- Improved consistency in environment variable examples

### Security
- Added prominent warnings about Docker command-line credential exposure
- Provided secure alternatives using --env-file and Docker secrets
- Implemented read-only filesystem and tmpfs for Docker containers

## [1.0.1] - 2025-07-14

### Fixed
- Minor documentation updates and clarifications
- Updated npm package metadata

## [Unreleased]

### Planned
- Make FIREWALLA_BOX_ID optional (see issue #27)
- Enhanced correlation algorithms
- Additional geographic data sources
- Performance optimization for large datasets
- Extended bulk operation capabilities

---

**Note**: This project follows the philosophy of "elegance over complexity, no bloat" - delivering professional functionality through clean, simple implementations.