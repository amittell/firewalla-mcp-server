# Multi-stage build for optimal image size
FROM node:18-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy documentation
COPY --from=builder /app/docs ./docs
COPY README.md LICENSE ./

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Note: MCP servers use stdio, not HTTP ports
# Health check for stdio-based service
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD test -f /app/dist/server.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the MCP server
CMD ["node", "dist/server.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="Firewalla MCP Server"
LABEL org.opencontainers.image.description="MCP server for Firewalla MSP API integration"
LABEL org.opencontainers.image.version="1.2.0"
LABEL org.opencontainers.image.authors="Alex Mittell <mittell@me.com>"
LABEL org.opencontainers.image.source="https://github.com/amittell/firewalla-mcp-server"
LABEL org.opencontainers.image.licenses="MIT"