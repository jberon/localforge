# Building LocalForge as a Desktop App

This guide explains how to build LocalForge as a native macOS application.

## Prerequisites

1. **Node.js 18+** - Install from https://nodejs.org
2. **LM Studio** - Install from https://lmstudio.ai (for AI functionality)
3. **Xcode Command Line Tools** - Run `xcode-select --install`

## One-Command Setup (Recommended)

Run the setup script to configure everything automatically:

```bash
./scripts/setup-electron.sh
```

This will:
1. Update package.json with Electron configuration
2. Install Electron and electron-builder dependencies
3. Set up build scripts

Then build the app:

```bash
npm run electron:build:arm64
```

## Alternative: Full Build Script

Use the included build script for a complete build:

```bash
./scripts/build-desktop.sh
```

This will:
1. Install all dependencies
2. Build production assets
3. Create the macOS app for your architecture

## Manual Build Steps

### Step 1: Run the setup script OR add Electron configuration manually

**Option A: Run setup script (recommended)**
```bash
./scripts/setup-electron.sh
```

**Option B: Add manually to `package.json`**

```json
{
  "name": "localforge",
  "version": "1.1.0",
  "productName": "LocalForge",
  "description": "AI-powered local app builder using LM Studio",
  "author": "Josh Beron",
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "NODE_ENV=development electron .",
    "electron:build": "npm run build && electron-builder --mac",
    "electron:build:arm64": "npm run build && electron-builder --mac --arm64",
    "electron:build:x64": "npm run build && electron-builder --mac --x64"
  }
}
```

### Step 2: Install Electron dependencies

```bash
npm install --save-dev electron electron-builder
```

### Step 3: Build the app

```bash
# Build for your current Mac architecture (recommended for M4 Pro)
npm run electron:build:arm64

# Or use the build script
./scripts/build-desktop.sh
```

### Step 4: Find your app

After building, your app will be in the `release` folder:
- `LocalForge-1.1.0-arm64.dmg` - Installer for Apple Silicon Macs (M1/M2/M3/M4)
- `LocalForge-1.1.0.app` - Application bundle

### Step 5: (Optional) Add a custom icon

To add a custom app icon:
1. Create a 1024x1024 PNG icon
2. Convert to .icns format using: `iconutil -c icns icon.iconset`
3. Place at `electron/assets/icon.icns`
4. Update `electron-builder.json` to reference it

## Running the App

1. **Install LM Studio** on your Mac from https://lmstudio.ai
2. **Load a model** in LM Studio (recommended: `qwen2.5-coder-32b-instruct`)
3. **Start the local server** in LM Studio's "Local Server" tab
4. **Launch LocalForge** - double-click the app

## Recommended Models for M4 Pro 48GB

Best performance/quality balance:
- `qwen2.5-coder-32b-instruct` - Excellent for code generation
- `deepseek-coder-v2-lite-instruct` - Fast and accurate
- `codellama-34b-instruct` - Strong code completion

## App Features

- **Native macOS integration** - Menu bar, keyboard shortcuts, dark mode
- **Local AI processing** - All data stays on your Mac
- **Offline capable** - Works without internet (after model download)
- **Optimized for M4 Pro** - Token limits and settings tuned for 48GB RAM

## Troubleshooting

### App won't start
- Make sure port 5000 is not in use by another application
- Check Console.app for error messages

### Can't connect to LM Studio
- Ensure LM Studio is running with the local server started
- Default endpoint is `http://localhost:1234/v1`
- Check that a model is loaded in LM Studio

### Build fails
- Make sure you have Xcode Command Line Tools: `xcode-select --install`
- Try cleaning: `rm -rf node_modules && npm install`

## Version

Current version: **1.1.0**

Built by Josh Beron
