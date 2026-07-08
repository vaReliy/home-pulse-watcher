#!/bin/bash
# Build ESP32 firmware using Docker + PlatformIO
# Usage: ./scripts/firmware-docker-build.sh <board> [version]
# Example: ./scripts/firmware-docker-build.sh esp32c3 0.2.0
# Example: ./scripts/firmware-docker-build.sh esp32c6

set -e

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_IMAGE="home-pulse-watcher-firmware"
DOCKER_TAG="latest"
DEFAULT_VERSION="0.0.0-dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
BOARD="${1:?Error: board name required (esp32c3 or esp32c6)}"
VERSION="${2:-$DEFAULT_VERSION}"

# Validate board
case "$BOARD" in
  esp32c3|esp32c6)
    ;;
  *)
    echo -e "${RED}Error: invalid board '$BOARD'${NC}"
    echo "Valid boards: esp32c3, esp32c6"
    exit 1
    ;;
esac

# Source .env for HPW_PORTAL_AP_PASSWORD (captive-portal AP password — see
# libs/firmware-shared/include/HomePulse/portal.h for why it's a fixed,
# non-per-device value rather than a secret). Required: PlatformIO silently
# substitutes an empty string for an unset ${sysenv.X} reference rather than
# failing, so we fail fast here instead of shipping an accidentally-open AP.
if [ -f "${PROJECT_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi
if [ -z "${HPW_PORTAL_AP_PASSWORD:-}" ]; then
  echo -e "${RED}Error: HPW_PORTAL_AP_PASSWORD not set${NC}"
  echo "Set it in ${PROJECT_ROOT}/.env (see .env.example) — this is the captive-portal"
  echo "AP WPA2-PSK password, must be >= 8 chars. Not a real secret (see portal.h),"
  echo "just kept out of committed source per repo convention."
  exit 1
fi

# Create output directory
OUTPUT_DIR="${PROJECT_ROOT}/tmp/firmware/${BOARD}/${VERSION}"
BUILD_OUTPUT="${PROJECT_ROOT}/firmware/build-output/${BOARD}/${VERSION}"
mkdir -p "$OUTPUT_DIR" "$BUILD_OUTPUT"

echo -e "${YELLOW}[Firmware Build]${NC}"
echo "Board:     $BOARD"
echo "Version:   $VERSION"
echo "Output:    $OUTPUT_DIR"
echo ""

# Build Docker image (or use cached one)
echo -e "${YELLOW}[1/3]${NC} Building Docker image..."
docker build \
  --build-arg BOARD="$BOARD" \
  --build-arg PORTAL_AP_PASSWORD="$HPW_PORTAL_AP_PASSWORD" \
  -f "${PROJECT_ROOT}/firmware/Dockerfile" \
  -t "${DOCKER_IMAGE}:${DOCKER_TAG}" \
  "${PROJECT_ROOT}"

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Docker build failed${NC}"
  exit 1
fi

# Run container to build firmware
echo ""
echo -e "${YELLOW}[2/3]${NC} Compiling firmware in container..."
CONTAINER_NAME="home-pulse-firmware-build-${BOARD}"

# Clean up any leftover container from previous run
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

docker run --rm \
  --name "$CONTAINER_NAME" \
  --env BOARD="$BOARD" \
  -v "${BUILD_OUTPUT}:/output" \
  "${DOCKER_IMAGE}:${DOCKER_TAG}"

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: PlatformIO build failed${NC}"
  exit 1
fi

# Copy to tmp/firmware for the upload CLI (which looks there by default)
echo ""
echo -e "${YELLOW}[3/3]${NC} Finalizing..."
cp "${BUILD_OUTPUT}/firmware.bin" "${OUTPUT_DIR}/firmware.bin"
if [ -f "${BUILD_OUTPUT}/firmware.bin.sha256" ]; then
  cp "${BUILD_OUTPUT}/firmware.bin.sha256" "${OUTPUT_DIR}/firmware.bin.sha256"
fi

echo ""
echo -e "${GREEN}✓ Build succeeded!${NC}"
echo ""
echo "Firmware binary ready at:"
echo "  ${OUTPUT_DIR}/firmware.bin"
echo ""
echo -e "${YELLOW}Next step: Upload firmware${NC}"
echo ""
echo "Option A: Interactive (will prompt for version/channel):"
echo "  npx nx run api:cli -- firmware:upload --file ${BOARD}/firmware.bin --board $BOARD"
echo ""
echo "Option B: Non-interactive (specify all fields):"
echo "  npx nx run api:cli -- firmware:upload --file ${BOARD}/firmware.bin --board $BOARD --version $VERSION --channel ALPHA"
echo ""
