# Security Policy

## Overview

The Firewalla MCP Server handles sensitive firewall data and credentials. This document outlines security considerations and best practices.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Considerations

### Credential Management

**🔐 Environment Variables**
- Never commit `.env` files to version control
- Use strong, unique MSP tokens
- Rotate tokens regularly (every 90 days recommended)
- Store tokens securely in production environments

**🔒 Token Security**
- MSP tokens provide full access to your Firewalla data
- Treat tokens like passwords - never share or expose them
- Use different tokens for development and production
- Monitor token usage in MSP portal

### Data Handling

**📊 Firewall Data**
- All firewall data is considered sensitive
- Network topology and device information should be protected
- Security alerts may contain PII (IP addresses, device names)
- Implement proper access controls in production

**🛡️ Input Validation**
- All user inputs are validated and sanitized
- Rate limiting prevents abuse
- Input length limits prevent DoS attacks
- Special characters are escaped to prevent injection

### Network Security

**🌐 Communication**
- All API communication uses HTTPS/TLS
- Certificate validation is enforced
- No sensitive data in URL parameters
- Proper error handling prevents information leakage

**🚧 Access Control**
- MCP server runs with minimal privileges
- No unnecessary network services exposed
- Firewall rules should restrict access to necessary ports only
- Use VPN or private networks for remote access

### Production Deployment

**🐳 Container Security**
- Use official Node.js base images
- Run as non-root user (UID 1001)
- Minimal attack surface with alpine images
- Regular security updates

**📈 Monitoring**
- Log all authentication attempts
- Monitor for unusual API usage patterns
- Set up alerts for failed authentication
- Regular security health checks

## Reporting Security Issues

**🚨 Vulnerability Disclosure**

If you discover a security vulnerability in the Firewalla MCP Server, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. **Do NOT** disclose the vulnerability publicly
3. Email security details to: [your-security-email]
4. Include detailed reproduction steps
5. Allow reasonable time for response (48-72 hours)

**📋 Include in Your Report:**
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)
- Your contact information

## Security Best Practices

### For Developers

**✅ Development Security**
```bash
# Use separate development credentials
cp .env.example .env.dev
# Set NODE_ENV=development

# Never commit real credentials
git add .env  # ❌ DON'T DO THIS

# Use debug mode for troubleshooting
DEBUG=mcp:* npm run dev

# Regular dependency updates
npm audit
npm audit fix
```

**✅ Code Security**
- Always validate input parameters
- Use parameterized queries/requests
- Implement proper error handling
- Log security events appropriately
- Follow principle of least privilege

### For Deployment

**✅ Production Security**
```bash
# Use environment-specific configurations
NODE_ENV=production

# Secure file permissions
chmod 600 .env
chown app:app .env

# Use process managers
pm2 start ecosystem.config.js

# Regular backups of configurations
tar -czf backup-$(date +%Y%m%d).tar.gz .env configs/
```

**✅ Infrastructure Security**
- Use firewalls to restrict access
- Implement proper logging and monitoring
- Regular security updates
- Backup and disaster recovery plans
- Network segmentation

### For Users

**✅ User Security**
- Use strong, unique passwords for MSP portal
- Enable 2FA on Firewalla accounts
- Regularly review device access logs
- Keep Firewalla firmware updated
- Monitor for unauthorized access

**✅ Credential Hygiene**
- Don't share MSP tokens
- Use separate tokens for different environments
- Rotate tokens regularly
- Remove unused tokens
- Monitor token usage

## Security Features

### Built-in Protections

**🛡️ Input Validation**
- All inputs validated against schemas
- SQL injection prevention
- XSS protection
- Rate limiting per client

**🔒 Authentication**
- Bearer token authentication
- Token validation on every request
- Secure token storage
- Session management

**📊 Logging & Monitoring**
- Structured security logging
- Failed authentication tracking
- Unusual activity detection
- Performance monitoring

**⚡ Rate Limiting**
- API request rate limiting
- Configurable limits per operation
- Automatic backoff on errors
- DoS protection

### Security Headers

When deployed with HTTP endpoints:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Compliance

### Data Protection

**📋 Data Handling**
- Minimal data collection
- Purpose limitation
- Data retention policies
- Secure data disposal

**🔐 Privacy**
- No unnecessary data logging
- Anonymization where possible
- Secure transmission
- Access control

### Audit Trail

**📝 Logging**
- All security events logged
- Structured log format
- Tamper-evident logging
- Regular log review

## Security Updates

**🔄 Update Process**
1. Monitor security advisories
2. Test updates in development
3. Schedule maintenance windows
4. Apply updates promptly
5. Verify functionality post-update

**📢 Notifications**
- Subscribe to security mailing lists
- Monitor GitHub security advisories
- Follow Node.js security updates
- Track dependency vulnerabilities

## Contact

For security-related questions or concerns:
- Security Email: [your-security-email]
- Response Time: 48-72 hours
- PGP Key: [optional PGP key for encrypted communication]

---

**Remember: Security is a shared responsibility. Follow these guidelines to keep your Firewalla data secure! 🔒**