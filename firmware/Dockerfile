# Firmware build for ESP32-C3/C6 using PlatformIO
# Multi-stage build for reproducible firmware compilation
#
# Usage:
#   docker build --build-arg BOARD=esp32c3 -f firmware/Dockerfile -t home-pulse-watcher-firmware:esp32c3 .
#   docker run --rm -v $(pwd)/tmp/firmware/esp32c3/0.2.0:/output home-pulse-watcher-firmware:esp32c3
#
# Note: Build context must be the project root (includes libs/ for firmware-shared)

FROM python:3.12-slim

WORKDIR /build

# Install PlatformIO CLI and system dependencies (git required by pioarduino platform)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir platformio && pio --version

# Build argument for target board (esp32c3 or esp32c6)
ARG BOARD=esp32c3
# Export build-time BOARD value as ENV so it's available at runtime by default
# (--env BOARD=... at `docker run` time will override this)
ENV BOARD=${BOARD}

# Copy firmware sources and shared library
# (Build context is project root due to libs/firmware-shared dependency)
COPY firmware/common /build/common
COPY firmware/esp32c3 /build/esp32c3
COPY firmware/esp32c6 /build/esp32c6
COPY libs/firmware-shared /build/libs/firmware-shared

# Prepare library for PlatformIO
# Create a lib/ directory at project level (next to esp32c3, esp32c6, common)
# and patch platformio.ini to reference the local library
RUN mkdir -p /build/lib && \
    cp -r /build/libs/firmware-shared /build/lib/HomePulse && \
    for board_dir in esp32c3 esp32c6; do \
      [ ! -f "/build/$board_dir/platformio.ini" ] && continue; \
      # Replace symlink:// with local lib reference
      sed -i 's|symlink://../../libs/firmware-shared|../lib/HomePulse|' "/build/$board_dir/platformio.ini"; \
    done && \
    echo "Prepared HomePulse library for local builds"

# Set up PlatformIO environment
ENV PIO_CACHE_DIR=/tmp/pio-cache \
    PLATFORMIO_CORE_DIR=/tmp/platformio \
    PLATFORMIO_GLOBALLIB_DIR=/tmp/pio-globallib

# Build the firmware
RUN set -e && \
    if [ -z "$BOARD" ]; then \
      echo "Error: BOARD must be specified as build argument (esp32c3 or esp32c6)" >&2; \
      exit 1; \
    fi && \
    if [ ! -d "/build/$BOARD" ]; then \
      echo "Error: Board directory /build/$BOARD does not exist" >&2; \
      ls -la /build; \
      exit 1; \
    fi && \
    cd /build/$BOARD && \
    echo "=== Building firmware for board: $BOARD ===" && \
    pio run -e $BOARD && \
    echo "=== Build succeeded for $BOARD ===" && \
    if [ ! -f ".pio/build/$BOARD/firmware.bin" ]; then \
      echo "Error: firmware.bin not found at .pio/build/$BOARD/firmware.bin"; \
      find . -name "*.bin" -o -name "*.elf" | head -5; \
      exit 1; \
    fi && \
    BIN_SIZE=$(stat --printf=%s .pio/build/$BOARD/firmware.bin) && \
    echo "Firmware binary size: $BIN_SIZE bytes"

VOLUME ["/output"]

# Default command: copy the built binary to the output directory
CMD sh -c "\
  set -e; \
  BOARD=\${BOARD:-esp32c3}; \
  echo 'Copying firmware.bin to /output...'; \
  mkdir -p /output; \
  cp /build/\${BOARD}/.pio/build/\${BOARD}/firmware.bin /output/firmware.bin; \
  ls -lh /output/firmware.bin; \
  sha256sum /output/firmware.bin | tee /output/firmware.bin.sha256; \
  echo 'SUCCESS: Firmware binary ready at /output/firmware.bin'"
