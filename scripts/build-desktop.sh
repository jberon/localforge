#!/bin/bash

# LocalForge Desktop App Builder
# This script builds LocalForge as a native macOS application

set -e

echo "=== LocalForge Desktop Builder ==="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the LocalForge root directory"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Run setup script if package.json doesn't have electron:build script
if ! grep -q '"electron:build"' package.json; then
    echo "Step 0: Setting up Electron configuration..."
    ./scripts/setup-electron.sh
fi

echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Building production assets..."
npm run build

echo ""
echo "Step 3: Packaging Electron app..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo "Detected Apple Silicon (arm64)"
    npx electron-builder --mac --arm64
elif [ "$ARCH" = "x86_64" ]; then
    echo "Detected Intel Mac (x64)"
    npx electron-builder --mac --x64
else
    echo "Unknown architecture: $ARCH, building for current platform"
    npx electron-builder --mac
fi

echo ""
echo "=== Build Complete ==="
echo ""
echo "Your app is ready in the 'release' folder:"
ls -la release/*.dmg 2>/dev/null || ls -la release/*.app 2>/dev/null || echo "Check 'release' folder for output"
echo ""
echo "To install:"
echo "1. Open the .dmg file"
echo "2. Drag LocalForge to Applications"
echo "3. Launch from Applications folder"
echo ""
echo "Note: Make sure to have LM Studio running with a model loaded!"
