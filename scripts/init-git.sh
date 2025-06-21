#!/bin/bash

# Git Repository Initialization Script for Firewalla MCP Server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

show_header() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔧 Git Repository Initialization"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

check_git() {
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    local git_version=$(git --version | cut -d' ' -f3)
    log_success "Git version: $git_version"
}

init_repository() {
    cd "$PROJECT_DIR"
    
    if [[ -d ".git" ]]; then
        log_warning "Git repository already exists"
        return 0
    fi
    
    log_info "Initializing Git repository..."
    git init
    
    # Set initial branch name to main
    git branch -M main
    
    log_success "Git repository initialized"
}

configure_git() {
    cd "$PROJECT_DIR"
    
    log_info "Configuring Git settings..."
    
    # Check if user has global git config
    if ! git config --global user.name &>/dev/null; then
        echo -n "Enter your name for Git commits: "
        read -r git_name
        git config --global user.name "$git_name"
    fi
    
    if ! git config --global user.email &>/dev/null; then
        echo -n "Enter your email for Git commits: "
        read -r git_email
        git config --global user.email "$git_email"
    fi
    
    # Configure repository-specific settings
    git config core.autocrlf input
    git config core.safecrlf warn
    git config init.defaultBranch main
    
    log_success "Git configuration complete"
}

setup_gitignore() {
    cd "$PROJECT_DIR"
    
    if [[ -f ".gitignore" ]]; then
        log_success ".gitignore already exists"
    else
        log_warning ".gitignore not found - this shouldn't happen"
        return 1
    fi
    
    # Verify .env is ignored
    if git check-ignore .env &>/dev/null; then
        log_success ".env file will be ignored (security confirmed)"
    else
        log_error ".env file is NOT being ignored - SECURITY RISK!"
        log_error "Please check your .gitignore file"
        return 1
    fi
}

initial_commit() {
    cd "$PROJECT_DIR"
    
    log_info "Creating initial commit..."
    
    # Add all files except ignored ones
    git add .
    
    # Check if there are any changes to commit
    if git diff --cached --quiet; then
        log_warning "No changes to commit"
        return 0
    fi
    
    # Show what will be committed
    echo ""
    log_info "Files to be committed:"
    git diff --cached --name-only | sed 's/^/  /'
    echo ""
    
    # Check for sensitive files
    if git diff --cached --name-only | grep -E '\.(env|key|pem|crt|p12)$' &>/dev/null; then
        log_error "SECURITY WARNING: Sensitive files detected in commit!"
        log_error "Please review your .gitignore and remove sensitive files"
        return 1
    fi
    
    # Create commit
    git commit -m "Initial commit: Firewalla MCP Server

🎉 Complete MCP server implementation for Firewalla firewall integration

Features:
- 7 MCP tools for firewall operations
- 5 data resources for real-time insights
- 5 intelligent prompts for security analysis
- Comprehensive test suite
- Production-ready deployment
- Security hardened with input validation
- Health monitoring and metrics
- Docker containerization

🤖 Generated with Claude Code (https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
    
    log_success "Initial commit created"
}

setup_remote() {
    cd "$PROJECT_DIR"
    
    echo ""
    log_info "Git repository setup complete!"
    echo ""
    echo "📋 Next steps to connect to a remote repository:"
    echo ""
    echo "1. Create a repository on GitHub/GitLab/etc."
    echo "2. Add the remote origin:"
    echo "   git remote add origin <your-repository-url>"
    echo ""
    echo "3. Push to remote:"
    echo "   git push -u origin main"
    echo ""
    echo "Example commands:"
    echo "  git remote add origin https://github.com/yourusername/firewalla-mcp.git"
    echo "  git push -u origin main"
    echo ""
}

verify_security() {
    cd "$PROJECT_DIR"
    
    log_info "Running security verification..."
    
    # Check for sensitive files in working directory
    local sensitive_files=()
    
    if [[ -f ".env" ]] && ! git check-ignore .env &>/dev/null; then
        sensitive_files+=(".env")
    fi
    
    # Check for other sensitive patterns
    while IFS= read -r -d '' file; do
        if [[ ! "$file" =~ \.example$ ]] && ! git check-ignore "$file" &>/dev/null; then
            sensitive_files+=("$file")
        fi
    done < <(find . -name "*.key" -o -name "*.pem" -o -name "*secret*" -o -name "*token*" -o -name "*credential*" -print0 2>/dev/null)
    
    if [[ ${#sensitive_files[@]} -gt 0 ]]; then
        log_error "SECURITY ALERT: Sensitive files not ignored by Git:"
        for file in "${sensitive_files[@]}"; do
            log_error "  - $file"
        done
        log_error "Please add these to .gitignore before committing!"
        return 1
    fi
    
    log_success "Security verification passed - no sensitive files will be committed"
}

show_git_status() {
    cd "$PROJECT_DIR"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Git Repository Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Show repository info
    echo "📁 Repository: $(pwd)"
    echo "🌿 Branch: $(git branch --show-current)"
    echo "📝 Commits: $(git rev-list --count HEAD)"
    echo "👤 Author: $(git config user.name) <$(git config user.email)>"
    
    # Show ignored files status
    echo ""
    echo "🔒 Security Status:"
    if git check-ignore .env &>/dev/null; then
        echo "   ✅ .env file is properly ignored"
    else
        echo "   ❌ .env file is NOT ignored"
    fi
    
    if git check-ignore node_modules &>/dev/null; then
        echo "   ✅ node_modules is properly ignored"
    fi
    
    if git check-ignore dist &>/dev/null; then
        echo "   ✅ dist directory is properly ignored"
    fi
    
    echo ""
    echo "📄 Recent commit:"
    git log --oneline -1
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main() {
    show_header
    
    check_git
    init_repository
    configure_git
    setup_gitignore
    verify_security
    initial_commit
    show_git_status
    setup_remote
    
    log_success "Git repository setup complete! 🎉"
}

main "$@"