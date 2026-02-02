#!/bin/bash

# LocalForge Electron Setup Script
# This script prepares the project for Electron desktop building

set -e

echo "=== LocalForge Electron Setup ==="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the LocalForge root directory"
    exit 1
fi

echo "Step 1: Backing up package.json..."
cp package.json package.json.backup

echo "Step 2: Adding Electron configuration to package.json..."

# Use Node.js to safely modify package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Update package info
pkg.name = 'localforge';
pkg.version = '1.1.0';
pkg.productName = 'LocalForge';
pkg.description = 'AI-powered local app builder using LM Studio';
pkg.author = 'Josh Beron';
pkg.main = 'electron/main.js';

// Add Electron scripts
pkg.scripts = pkg.scripts || {};
pkg.scripts['electron:dev'] = 'NODE_ENV=development electron .';
pkg.scripts['electron:build'] = 'npm run build && electron-builder --mac';
pkg.scripts['electron:build:arm64'] = 'npm run build && electron-builder --mac --arm64';
pkg.scripts['electron:build:x64'] = 'npm run build && electron-builder --mac --x64';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('package.json updated successfully');
"

echo ""
echo "Step 3: Installing Electron dependencies..."
npm install --save-dev electron electron-builder

echo ""
echo "=== Setup Complete ==="
echo ""
echo "You can now build the desktop app with:"
echo "  npm run electron:build:arm64  (for Apple Silicon)"
echo "  npm run electron:build:x64    (for Intel Mac)"
echo ""
echo "Or run in development mode with:"
echo "  npm run electron:dev"
echo ""
