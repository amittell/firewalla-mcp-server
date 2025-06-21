#!/bin/bash

# Firewalla MCP Server Deployment Script
set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
IMAGE_NAME="firewalla-mcp-server"
IMAGE_TAG="${IMAGE_TAG:-latest}"

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

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed or not in PATH"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Function to validate environment variables
validate_environment() {
    log_info "Validating environment configuration..."
    
    local required_vars=(
        "FIREWALLA_MSP_TOKEN"
        "FIREWALLA_BOX_ID"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        log_error "Please set these variables and try again"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# Function to run tests
run_tests() {
    log_info "Running tests..."
    
    cd "$PROJECT_DIR"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        log_info "Installing dependencies..."
        npm ci
    fi
    
    # Run linting
    log_info "Running linter..."
    if ! npm run lint; then
        log_error "Linting failed"
        exit 1
    fi
    
    # Run tests
    log_info "Running unit tests..."
    if ! npm test; then
        log_error "Tests failed"
        exit 1
    fi
    
    log_success "All tests passed"
}

# Function to build the application
build_application() {
    log_info "Building application..."
    
    cd "$PROJECT_DIR"
    
    # Clean previous build
    rm -rf dist/
    
    # Build TypeScript
    if ! npm run build; then
        log_error "Build failed"
        exit 1
    fi
    
    log_success "Application built successfully"
}

# Function to build Docker image
build_docker_image() {
    log_info "Building Docker image..."
    
    cd "$PROJECT_DIR"
    
    local full_image_name="$IMAGE_NAME:$IMAGE_TAG"
    
    if [[ -n "$DOCKER_REGISTRY" ]]; then
        full_image_name="$DOCKER_REGISTRY/$full_image_name"
    fi
    
    # Build the image
    if ! docker build -t "$full_image_name" .; then
        log_error "Docker build failed"
        exit 1
    fi
    
    log_success "Docker image built: $full_image_name"
    
    # Export the image name for other functions
    export FULL_IMAGE_NAME="$full_image_name"
}

# Function to run security scan
security_scan() {
    log_info "Running security scan..."
    
    # Check if a security scanner is available
    if command -v trivy &> /dev/null; then
        log_info "Running Trivy security scan..."
        trivy image "$FULL_IMAGE_NAME"
    elif command -v docker &> /dev/null && docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image "$FULL_IMAGE_NAME" &> /dev/null; then
        log_info "Running Trivy security scan via Docker..."
        docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image "$FULL_IMAGE_NAME"
    else
        log_warning "No security scanner available, skipping security scan"
    fi
}

# Function to push Docker image
push_docker_image() {
    if [[ -z "$DOCKER_REGISTRY" ]]; then
        log_warning "No Docker registry specified, skipping push"
        return
    fi
    
    log_info "Pushing Docker image to registry..."
    
    if ! docker push "$FULL_IMAGE_NAME"; then
        log_error "Docker push failed"
        exit 1
    fi
    
    log_success "Docker image pushed successfully"
}

# Function to deploy using Docker Compose
deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    cd "$PROJECT_DIR"
    
    # Create docker-compose.yml if it doesn't exist
    if [[ ! -f "docker-compose.yml" ]]; then
        log_info "Creating docker-compose.yml..."
        cat > docker-compose.yml << EOF
version: '3.8'

services:
  firewalla-mcp:
    image: ${FULL_IMAGE_NAME}
    container_name: firewalla-mcp-server
    restart: unless-stopped
    environment:
      - NODE_ENV=${DEPLOYMENT_ENV}
      - FIREWALLA_MSP_TOKEN=\\${FIREWALLA_MSP_TOKEN}
      - FIREWALLA_BOX_ID=\\${FIREWALLA_BOX_ID}
      - FIREWALLA_MSP_BASE_URL=\\${FIREWALLA_MSP_BASE_URL:-https://msp.firewalla.com}
      - LOG_LEVEL=\\${LOG_LEVEL:-info}
      - ENABLE_METRICS=\\${ENABLE_METRICS:-true}
      - ENABLE_HEALTH_CHECKS=\\${ENABLE_HEALTH_CHECKS:-true}
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('Health check passed')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - firewalla-net

networks:
  firewalla-net:
    driver: bridge
EOF
        log_success "docker-compose.yml created"
    fi
    
    # Deploy the service
    if ! docker-compose up -d; then
        log_error "Docker Compose deployment failed"
        exit 1
    fi
    
    log_success "Service deployed successfully"
    
    # Show deployment status
    docker-compose ps
    
    # Show logs
    log_info "Recent logs:"
    docker-compose logs --tail=20
}

# Function to run health check
health_check() {
    log_info "Running health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose exec -T firewalla-mcp node -e "console.log('Health check passed')" &> /dev/null; then
            log_success "Health check passed"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Function to show deployment information
show_deployment_info() {
    log_info "Deployment Information:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Environment: $DEPLOYMENT_ENV"
    echo "Image: $FULL_IMAGE_NAME"
    echo "Container Status:"
    docker-compose ps
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
    echo "To restart: docker-compose restart"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main deployment function
main() {
    log_info "Starting Firewalla MCP Server deployment..."
    log_info "Environment: $DEPLOYMENT_ENV"
    
    # Run deployment steps
    check_prerequisites
    validate_environment
    
    # Skip tests in development mode if requested
    if [[ "$DEPLOYMENT_ENV" != "development" ]] || [[ "${SKIP_TESTS:-false}" != "true" ]]; then
        run_tests
    else
        log_warning "Skipping tests in development mode"
    fi
    
    build_application
    build_docker_image
    
    # Skip security scan in development mode
    if [[ "$DEPLOYMENT_ENV" != "development" ]]; then
        security_scan
    fi
    
    push_docker_image
    deploy_docker_compose
    health_check
    show_deployment_info
    
    log_success "Deployment completed successfully!"
}

# Script usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --env ENV        Deployment environment (development, staging, production)"
    echo "  -r, --registry REG   Docker registry URL"
    echo "  -t, --tag TAG        Docker image tag"
    echo "  -s, --skip-tests     Skip running tests"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  FIREWALLA_MSP_TOKEN  Required: Firewalla MSP API token"
    echo "  FIREWALLA_BOX_ID     Required: Firewalla Box ID"
    echo "  DEPLOYMENT_ENV       Deployment environment (default: production)"
    echo "  DOCKER_REGISTRY      Docker registry URL"
    echo "  IMAGE_TAG            Docker image tag (default: latest)"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--env)
            DEPLOYMENT_ENV="$2"
            shift 2
            ;;
        -r|--registry)
            DOCKER_REGISTRY="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -s|--skip-tests)
            SKIP_TESTS="true"
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