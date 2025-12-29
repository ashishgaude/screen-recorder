#!/bin/bash

# Build script for Screen Screen Recorder
# Creates a production-ready ZIP file for Chrome Web Store

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | cut -d '"' -f 4)
OUTPUT_FILE="screen-recorder-v${VERSION}.zip"

echo "🚧 Building $OUTPUT_FILE..."

# Remove old build if exists
if [ -f "$OUTPUT_FILE" ]; then
    rm "$OUTPUT_FILE"
fi

# Create zip excluding unnecessary files
zip -r "$OUTPUT_FILE" . -x "*.git*" "*.DS_Store" "build.sh" "*.zip"

echo "✅ Build Complete!"
echo "📂 File created: $OUTPUT_FILE"
