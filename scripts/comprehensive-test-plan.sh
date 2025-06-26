#!/bin/bash

# Comprehensive Test Plan Script
# Validates project build, tests, and interface generation

set -e  # Exit on any error

echo "🚀 Starting comprehensive test plan..."
echo "Platform: $(uname -s) $(uname -m)"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

# Function to check if directory exists and is not empty
check_directory() {
    local dir="$1"
    local description="$2"
    
    if [ ! -d "$dir" ]; then
        echo "❌ $description directory '$dir' does not exist"
        return 1
    fi
    
    if [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
        echo "❌ $description directory '$dir' is empty"
        return 1
    fi
    
    echo "✅ $description directory '$dir' exists and contains files"
    return 0
}

# Function to check TypeScript compilation
check_typescript_compilation() {
    echo "📝 Checking TypeScript compilation..."
    
    # Clean dist directory first
    if [ -d "dist" ]; then
        echo "🧹 Cleaning existing dist directory..."
        rm -rf dist
    fi
    
    # Run TypeScript compilation
    echo "🔨 Running TypeScript compilation..."
    npm run build
    
    # Verify dist directory was created and populated
    if ! check_directory "dist" "Distribution"; then
        echo "❌ TypeScript compilation failed - dist directory missing or empty"
        return 1
    fi
    
    # Check for specific interface files
    echo "🔍 Checking for generated interface files..."
    
    local interface_files=(
        "dist/types.d.ts"
        "dist/tools/handlers/base.d.ts"
        "dist/search/types.d.ts"
        "dist/validation/field-mapper.d.ts"
    )
    
    local missing_files=()
    
    for file in "${interface_files[@]}"; do
        if [ -f "$file" ]; then
            echo "✅ Interface file found: $file"
        else
            echo "⚠️  Interface file missing: $file"
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -eq 0 ]; then
        echo "✅ All expected interface files are present"
    else
        echo "⚠️  Some interface files are missing, but compilation succeeded"
        echo "Missing files: ${missing_files[*]}"
    fi
    
    return 0
}

# Function to run tests
run_tests() {
    echo "🧪 Running test suite..."
    
    # Run linting
    echo "📋 Running ESLint..."
    npm run lint
    
    # Run unit tests
    echo "🔬 Running unit tests..."
    npm test
    
    # Run specific validation tests if they exist
    if [ -f "tests/validation/enhanced-correlation.test.ts" ]; then
        echo "🔍 Running enhanced correlation validation tests..."
        npm test -- tests/validation/enhanced-correlation.test.ts
    fi
    
    return 0
}

# Function to validate project structure
validate_project_structure() {
    echo "📁 Validating project structure..."
    
    local required_dirs=(
        "src"
        "src/tools"
        "src/search"
        "src/validation"
        "tests"
    )
    
    for dir in "${required_dirs[@]}"; do
        check_directory "$dir" "Required"
    done
    
    local required_files=(
        "package.json"
        "tsconfig.json"
        "src/server.ts"
        "src/types.ts"
    )
    
    echo "📄 Checking required files..."
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            echo "✅ Required file found: $file"
        else
            echo "❌ Required file missing: $file"
            return 1
        fi
    done
    
    return 0
}

# Function to check MCP server functionality
check_mcp_server() {
    echo "🔌 Testing MCP server startup..."
    
    # Start server in background and test basic functionality
    timeout 10s npm run mcp:start &
    local server_pid=$!
    
    sleep 3
    
    if kill -0 $server_pid 2>/dev/null; then
        echo "✅ MCP server started successfully"
        kill $server_pid 2>/dev/null || true
        wait $server_pid 2>/dev/null || true
    else
        echo "❌ MCP server failed to start"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    echo "======================================"
    echo "  COMPREHENSIVE TEST PLAN EXECUTION  "
    echo "======================================"
    
    # Step 1: Validate project structure
    echo -e "\n📋 STEP 1: Project Structure Validation"
    validate_project_structure
    
    # Step 2: Check TypeScript compilation and interface generation
    echo -e "\n📋 STEP 2: TypeScript Compilation & Interface Generation"
    check_typescript_compilation
    
    # Step 3: Run comprehensive tests
    echo -e "\n📋 STEP 3: Test Suite Execution"
    run_tests
    
    # Step 4: Test MCP server functionality
    echo -e "\n📋 STEP 4: MCP Server Functionality Test"
    check_mcp_server
    
    echo -e "\n🎉 COMPREHENSIVE TEST PLAN COMPLETED SUCCESSFULLY!"
    echo "All checks passed. The project is ready for deployment."
    
    return 0
}

# Error handling
trap 'echo "❌ Test plan failed at line $LINENO. Check the output above for details."' ERR

# Run main function
main "$@"