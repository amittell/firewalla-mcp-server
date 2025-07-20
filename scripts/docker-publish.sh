#!/bin/bash

# Docker build and publish script for Firewalla MCP Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="amittell"
IMAGE_NAME="firewalla-mcp-server"
VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}Building Docker image for Firewalla MCP Server v${VERSION}${NC}"

# Build the image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} .
docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:latest .

# Test the image
echo -e "${YELLOW}Testing Docker image...${NC}"
docker run --rm ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} node -e "console.log('Docker image test passed')"

# Login to Docker Hub
echo -e "${YELLOW}Logging in to Docker Hub...${NC}"
echo -e "${RED}Please enter your Docker Hub credentials:${NC}"
docker login -u ${DOCKER_USERNAME}

# Push to Docker Hub
echo -e "${YELLOW}Pushing to Docker Hub...${NC}"
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:latest

echo -e "${GREEN}✅ Successfully published Docker images:${NC}"
echo -e "  - ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
echo -e "  - ${DOCKER_USERNAME}/${IMAGE_NAME}:latest"

# Create multi-arch manifest (optional)
echo -e "${YELLOW}Create multi-arch build? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}Building multi-arch images...${NC}"
    docker buildx create --use --name multiarch-builder || true
    docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
        -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} \
        -t ${DOCKER_USERNAME}/${IMAGE_NAME}:latest \
        --push .
    docker buildx rm multiarch-builder
    echo -e "${GREEN}✅ Multi-arch images published${NC}"
fi

echo -e "${GREEN}Done! Users can now run:${NC}"
echo -e "  docker run -it --rm -e FIREWALLA_MSP_TOKEN=token -e FIREWALLA_MSP_ID=domain -e FIREWALLA_BOX_ID=id ${DOCKER_USERNAME}/${IMAGE_NAME}"