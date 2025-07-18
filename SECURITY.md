# Security Policy

## Reporting Security Vulnerabilities

We take security vulnerabilities seriously. If you discover a security vulnerability in the Firewalla MCP Server, please report it privately.

**Please DO NOT create a public GitHub issue for security vulnerabilities.**

### How to Report

Send security reports to: **mittell@me.com**

Include the following information:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes or mitigations

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 1 week
- **Fix timeline** communicated based on severity
- **Public disclosure** only after fix is available

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Yes             |
| < 1.0   | ❌ No              |

## Security Considerations

This project handles sensitive firewall data and API credentials. Key security practices:

- **API Credentials**: Store in environment variables, never commit to version control
- **Network Communication**: All API calls use HTTPS/TLS
- **Input Validation**: Comprehensive parameter validation and sanitization  
- **Error Handling**: No sensitive data leaked in error messages
- **Dependencies**: Regularly updated to address known vulnerabilities

---

Thank you for helping keep Firewalla MCP Server secure!