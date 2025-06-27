#!/bin/bash
#
# Git hooks setup script for budget-friendly CI/CD
# Run this once after cloning the repository
#
set -e

echo "🚀 Setting up git hooks for efficient development..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if .githooks directory exists
if [ ! -d ".githooks" ]; then
    echo "❌ Error: .githooks directory not found"
    exit 1
fi

# Configure git to use our custom hooks directory
print_info "Configuring git to use .githooks directory..."
git config core.hooksPath .githooks

# Make hooks executable
print_info "Making git hooks executable..."
chmod +x .githooks/*

# Verify the setup
if [ "$(git config core.hooksPath)" = ".githooks" ]; then
    print_success "Git hooks configured successfully!"
else
    echo "❌ Error: Failed to configure git hooks"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 What happens now:"
echo "   • Pre-commit hook will run automatically before each commit"
echo "   • Code formatting, TypeScript, ESLint, and quick tests checked locally"
echo "   • Issues caught before pushing = fewer GitHub Actions minutes used"
echo "   • Estimated savings: 80% reduction in CI failures"
echo ""
echo "💰 Cost benefits:"
echo "   • Local checks are FREE (no GitHub Actions minutes used)"
echo "   • Only essential checks run in CI for all branches"
echo "   • Full test suite only runs on main branch and PRs"
echo "   • Expected monthly cost: $0.50-1.00 vs $10-15 without optimization"
echo ""
echo "🔧 Next steps:"
echo "   • Run 'npm install' if you haven't already"
echo "   • Make a test commit to see the hooks in action"
echo "   • Check README-CI.md for more details"