#!/bin/bash

# Claude Code MCP Server Configuration Script
set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_PATH="$(realpath "$PROJECT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            echo "macos"
            ;;
        Linux*)
            echo "linux"
            ;;
        CYGWIN*|MINGW32*|MSYS*|MINGW*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Function to get config directory
get_config_dir() {
    local os=$(detect_os)
    
    case $os in
        macos|linux)
            echo "$HOME/.config/claude-code"
            ;;
        windows)
            echo "$APPDATA/claude-code"
            ;;
        *)
            log_error "Unsupported operating system"
            exit 1
            ;;
    esac
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    # Check Node.js version
    local node_version=$(node --version | sed 's/v//')
    local required_major=18
    local current_major=$(echo "$node_version" | cut -d. -f1)
    
    if [[ $current_major -lt $required_major ]]; then
        log_error "Node.js version $node_version is too old. Required: $required_major or higher"
        exit 1
    fi
    
    log_success "Node.js version: $node_version ✓"
    
    # Check if Claude Code is installed
    if ! command -v claude-code &> /dev/null; then
        log_warning "Claude Code CLI not found in PATH"
        log_info "Please make sure Claude Code is installed and accessible"
    else
        log_success "Claude Code CLI found ✓"
    fi
    
    # Check if project is built
    if [[ ! -f "$PROJECT_DIR/dist/server.js" ]]; then
        log_info "Project not built yet. Building now..."
        cd "$PROJECT_DIR"
        if ! npm run build; then
            log_error "Failed to build project"
            exit 1
        fi
        log_success "Project built successfully ✓"
    else
        log_success "Project is built ✓"
    fi
}

# Function to check environment configuration
check_environment() {
    log_info "Checking environment configuration..."
    
    if [[ ! -f "$PROJECT_DIR/.env" ]]; then
        log_warning "No .env file found"
        
        if [[ -f "$PROJECT_DIR/.env.example" ]]; then
            log_info "Copying .env.example to .env"
            cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
            log_warning "Please edit .env file with your Firewalla credentials before proceeding"
            log_info "Edit command: nano $PROJECT_DIR/.env"
            
            read -p "Press Enter after you've configured your .env file..."
        else
            log_error ".env.example file not found"
            exit 1
        fi
    fi
    
    # Check if required variables are set
    source "$PROJECT_DIR/.env"
    
    local missing_vars=()
    
    if [[ -z "${FIREWALLA_MSP_TOKEN:-}" ]] || [[ "$FIREWALLA_MSP_TOKEN" == "your_msp_access_token_here" ]]; then
        missing_vars+=("FIREWALLA_MSP_TOKEN")
    fi
    
    if [[ -z "${FIREWALLA_BOX_ID:-}" ]] || [[ "$FIREWALLA_BOX_ID" == "your_box_id_here" ]]; then
        missing_vars+=("FIREWALLA_BOX_ID")
    fi
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Please configure the following variables in .env:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        log_info "Edit your .env file: nano $PROJECT_DIR/.env"
        exit 1
    fi
    
    log_success "Environment configuration looks good ✓"
}

# Function to test MCP server
test_mcp_server() {
    log_info "Testing MCP server..."
    
    cd "$PROJECT_DIR"
    
    # Start server in background and test it
    local test_output
    test_output=$(timeout 10s npm run mcp:start 2>&1 || true)
    
    if echo "$test_output" | grep -q "Firewalla MCP Server running"; then
        log_success "MCP server test passed ✓"
    else
        log_error "MCP server test failed"
        log_error "Output: $test_output"
        exit 1
    fi
}

# Function to create MCP configuration
create_mcp_config() {
    local config_type="$1"
    local config_dir
    local config_file
    
    if [[ "$config_type" == "global" ]]; then
        config_dir=$(get_config_dir)
        config_file="$config_dir/mcp_servers.json"
        
        log_info "Creating global MCP configuration..."
        log_info "Config directory: $config_dir"
        
        # Create config directory
        mkdir -p "$config_dir"
        
        # Create or update MCP servers configuration
        if [[ -f "$config_file" ]]; then
            log_info "Updating existing MCP configuration..."
            
            # Backup existing config
            cp "$config_file" "$config_file.backup.$(date +%s)"
            log_info "Backed up existing config to $config_file.backup.*"
        fi
        
        # Create the configuration
        cat > "$config_file" << EOF
{
  "firewalla": {
    "command": "node",
    "args": ["$PROJECT_PATH/dist/server.js"],
    "env": {
      "NODE_ENV": "production"
    },
    "cwd": "$PROJECT_PATH"
  }
}
EOF
        
    else
        # Project-specific configuration
        config_dir="$PROJECT_DIR/.claude-code"
        config_file="$config_dir/mcp_servers.json"
        
        log_info "Creating project-specific MCP configuration..."
        
        # Create config directory
        mkdir -p "$config_dir"
        
        # Create the configuration
        cat > "$config_file" << EOF
{
  "firewalla": {
    "command": "npm",
    "args": ["run", "mcp:start"],
    "cwd": "."
  }
}
EOF
    fi
    
    log_success "MCP configuration created: $config_file"
    
    # Show the configuration
    log_info "Configuration contents:"
    cat "$config_file" | sed 's/^/  /'
}

# Function to provide usage instructions
show_usage_instructions() {
    log_info "Setup complete! Here's how to use your Firewalla MCP server:"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Firewalla MCP Server Configuration Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🚀 Next Steps:"
    echo "1. Start Claude Code:"
    echo "   claude-code"
    echo ""
    echo "2. Test the connection by asking Claude:"
    echo "   'Are you connected to my Firewalla MCP server?'"
    echo ""
    echo "🔥 Example Queries to Try:"
    echo "• 'What's the current status of my Firewalla firewall?'"
    echo "• 'Show me any active security alerts'"
    echo "• 'Which devices are using the most bandwidth?'"
    echo "• 'Generate a security report for the last 24 hours'"
    echo "• 'What devices are currently offline?'"
    echo ""
    echo "🛠️ Debugging:"
    echo "• Enable debug mode: DEBUG=mcp:* claude-code"
    echo "• Check server logs: tail -f $PROJECT_DIR/logs/*.log"
    echo "• Test server manually: cd $PROJECT_DIR && npm run mcp:start"
    echo ""
    echo "📁 Configuration Files:"
    echo "• Project: $PROJECT_DIR"
    if [[ "$CONFIG_TYPE" == "global" ]]; then
        echo "• MCP Config: $(get_config_dir)/mcp_servers.json"
    else
        echo "• MCP Config: $PROJECT_DIR/.claude-code/mcp_servers.json"
    fi
    echo "• Environment: $PROJECT_DIR/.env"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Configure Firewalla MCP Server for Claude Code"
    echo ""
    echo "Options:"
    echo "  -g, --global         Create global MCP configuration (default)"
    echo "  -p, --project        Create project-specific MCP configuration"
    echo "  -t, --test-only      Only test the server, don't create config"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   # Create global configuration"
    echo "  $0 --project         # Create project-specific configuration"
    echo "  $0 --test-only       # Test server without creating config"
}

# Main function
main() {
    local config_type="global"
    local test_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -g|--global)
                config_type="global"
                shift
                ;;
            -p|--project)
                config_type="project"
                shift
                ;;
            -t|--test-only)
                test_only=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Export config type for use in other functions
    export CONFIG_TYPE="$config_type"
    
    log_info "Configuring Firewalla MCP Server for Claude Code..."
    log_info "Configuration type: $config_type"
    
    # Run setup steps
    check_prerequisites
    check_environment
    test_mcp_server
    
    if [[ "$test_only" == "false" ]]; then
        create_mcp_config "$config_type"
        show_usage_instructions
    else
        log_success "Server test completed successfully!"
        log_info "Use --global or --project to create MCP configuration"
    fi
    
    log_success "Configuration complete! 🎉"
}

# Run main function with all arguments
main "$@"