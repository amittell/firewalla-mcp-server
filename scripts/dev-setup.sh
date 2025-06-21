#!/bin/bash

# Firewalla MCP Server Development Setup Script
set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check system requirements
check_system_requirements() {
    log_info "Checking system requirements..."
    
    # Check Node.js version
    if command -v node &> /dev/null; then
        local node_version=$(node --version | sed 's/v//')
        local required_major=18
        local current_major=$(echo "$node_version" | cut -d. -f1)
        
        if [[ $current_major -ge $required_major ]]; then
            log_success "Node.js version: $node_version ✓"
        else
            log_error "Node.js version $node_version is too old. Required: $required_major or higher"
            exit 1
        fi
    else
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm version
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        log_success "npm version: $npm_version ✓"
    else
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Git
    if command -v git &> /dev/null; then
        local git_version=$(git --version | cut -d' ' -f3)
        log_success "Git version: $git_version ✓"
    else
        log_warning "Git is not installed (recommended for development)"
    fi
    
    # Check Docker (optional for development)
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | cut -d' ' -f3 | sed 's/,//')
        log_success "Docker version: $docker_version ✓"
    else
        log_warning "Docker is not installed (optional for local testing)"
    fi
}

# Function to install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Clean install
    if [[ -d "node_modules" ]]; then
        log_info "Cleaning existing node_modules..."
        rm -rf node_modules package-lock.json
    fi
    
    # Install dependencies
    if ! npm ci; then
        log_error "Failed to install dependencies"
        exit 1
    fi
    
    log_success "Dependencies installed successfully"
}

# Function to setup environment files
setup_environment() {
    log_info "Setting up environment files..."
    
    cd "$PROJECT_DIR"
    
    # Create .env from template if it doesn't exist
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            log_success "Created .env from .env.example"
            log_warning "Please edit .env file with your Firewalla credentials"
        else
            log_warning ".env.example not found, creating basic .env file"
            cat > .env << EOF
# Firewalla MSP API Configuration
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_BASE_URL=https://msp.firewalla.com
FIREWALLA_BOX_ID=your_box_id_here

# Development Configuration
NODE_ENV=development
DEBUG=mcp:*
LOG_LEVEL=debug

# Optional: API Configuration
API_TIMEOUT=30000
API_RATE_LIMIT=100
CACHE_TTL=300
EOF
            log_success "Created basic .env file"
        fi
        
        echo ""
        log_warning "⚠️  IMPORTANT: Please edit the .env file with your actual Firewalla credentials"
        log_info "You can find your MSP token and Box ID in your Firewalla MSP portal"
        echo ""
    else
        log_info ".env file already exists"
    fi
    
    # Create test environment file
    if [[ ! -f ".env.test" ]]; then
        cat > .env.test << EOF
# Test Environment Configuration
NODE_ENV=test
FIREWALLA_MSP_TOKEN=test-token-123456789
FIREWALLA_MSP_BASE_URL=https://test.firewalla.com
FIREWALLA_BOX_ID=test-box-id-123
API_TIMEOUT=5000
API_RATE_LIMIT=1000
CACHE_TTL=60
LOG_LEVEL=error
EOF
        log_success "Created .env.test file"
    fi
}

# Function to run initial build and tests
run_initial_build() {
    log_info "Running initial build and tests..."
    
    cd "$PROJECT_DIR"
    
    # Build the project
    log_info "Building TypeScript..."
    if ! npm run build; then
        log_error "Build failed"
        exit 1
    fi
    
    # Run linting
    log_info "Running linter..."
    if ! npm run lint; then
        log_warning "Linting issues found (you can fix these later)"
    else
        log_success "Linting passed"
    fi
    
    # Run tests
    log_info "Running tests..."
    if ! npm test; then
        log_warning "Some tests failed (you may need to configure credentials)"
    else
        log_success "All tests passed"
    fi
}

# Function to setup VS Code configuration
setup_vscode() {
    local setup_vscode_config="${SETUP_VSCODE:-}"
    
    if [[ "$setup_vscode_config" == "true" ]] || [[ -d ".vscode" ]] || command -v code &> /dev/null; then
        log_info "Setting up VS Code configuration..."
        
        cd "$PROJECT_DIR"
        
        # Create .vscode directory
        mkdir -p .vscode
        
        # Create settings.json
        cat > .vscode/settings.json << 'EOF'
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.workingDirectories": ["./"],
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
EOF
        
        # Create launch.json for debugging
        cat > .vscode/launch.json << 'EOF'
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/server.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      },
      "envFile": "${workspaceFolder}/.env.test"
    }
  ]
}
EOF
        
        # Create tasks.json
        cat > .vscode/tasks.json << 'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build",
      "type": "npm",
      "script": "build",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "silent",
        "panel": "shared",
        "showReuseMessage": true,
        "clear": false
      },
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "Test",
      "type": "npm",
      "script": "test",
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "Start Dev Server",
      "type": "npm",
      "script": "mcp:start",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "panel": "new"
      },
      "isBackground": true
    }
  ]
}
EOF
        
        # Create extensions.json
        cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "ms-vscode.vscode-json",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.test-adapter-converter"
  ]
}
EOF
        
        log_success "VS Code configuration created"
        
        if command -v code &> /dev/null; then
            log_info "You can now open the project in VS Code with: code ."
        fi
    fi
}

# Function to create useful development scripts
create_dev_scripts() {
    log_info "Creating development scripts..."
    
    cd "$PROJECT_DIR"
    
    # Create a comprehensive development script
    cat > dev.js << 'EOF'
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const commands = {
  start: 'npm run mcp:start',
  dev: 'npm run dev',
  build: 'npm run build',
  test: 'npm test',
  'test:watch': 'npm run test:watch',
  lint: 'npm run lint',
  'lint:fix': 'npm run lint:fix',
  clean: 'rm -rf dist node_modules package-lock.json',
  setup: 'npm ci && npm run build',
  logs: 'tail -f logs/*.log',
};

const command = process.argv[2];

if (!command || command === 'help') {
  console.log('Available commands:');
  Object.keys(commands).forEach(cmd => {
    console.log(`  ${cmd.padEnd(12)} - ${commands[cmd]}`);
  });
  process.exit(0);
}

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

const child = spawn('bash', ['-c', commands[command]], {
  stdio: 'inherit',
  cwd: __dirname
});

child.on('exit', (code) => {
  process.exit(code);
});
EOF
    
    chmod +x dev.js
    log_success "Created dev.js script"
}

# Function to display setup summary
show_setup_summary() {
    log_info "Development setup complete!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Firewalla MCP Server - Development Environment Ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Edit .env file with your Firewalla MSP credentials"
    echo "2. Start development server: npm run mcp:start"
    echo "3. Run tests: npm test"
    echo "4. Build project: npm run build"
    echo ""
    echo "🛠️ Development Commands:"
    echo "  npm run dev          - Start with hot reload"
    echo "  npm run mcp:start    - Start MCP server"
    echo "  npm run mcp:debug    - Start with debug logging"
    echo "  npm test            - Run tests"
    echo "  npm run test:watch  - Run tests in watch mode"
    echo "  npm run lint        - Run linter"
    echo "  npm run build       - Build project"
    echo ""
    echo "📁 Project Structure:"
    echo "  src/                 - Source code"
    echo "  tests/               - Test files"
    echo "  dist/                - Built output"
    echo "  docs/                - Documentation"
    echo ""
    echo "📋 Documentation:"
    echo "  README.md           - Project overview"
    echo "  CLAUDE.md           - Claude development guide"
    echo "  SPEC.md             - Technical specifications"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main setup function
main() {
    log_info "Starting Firewalla MCP Server development setup..."
    
    check_system_requirements
    install_dependencies
    setup_environment
    run_initial_build
    setup_vscode
    create_dev_scripts
    show_setup_summary
    
    log_success "Development setup completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --setup-vscode       Force setup of VS Code configuration"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  SETUP_VSCODE         Set to 'true' to setup VS Code configuration"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --setup-vscode)
            SETUP_VSCODE="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Run main function
main "$@"