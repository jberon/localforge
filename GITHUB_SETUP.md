# Publishing LocalForge to GitHub

This guide explains how to publish LocalForge to GitHub so the automatic build system creates downloadable desktop apps.

## Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Repository name: `localforge`
3. Description: `AI-powered local app builder using LM Studio`
4. Set to **Public** (required for free GitHub Actions minutes)
5. Click **Create repository**

## Step 2: Push the Code

In Terminal, navigate to your LocalForge folder and run:

```bash
cd ~/Desktop/Local-Dev-Suite

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add your GitHub remote
git remote add origin https://github.com/jberon/localforge.git

# Push to GitHub
git push -u origin main
```

## Step 3: Create a Release to Build the App

1. Go to https://github.com/jberon/localforge/releases
2. Click **Draft a new release**
3. Click **Choose a tag** and type your version (e.g., `v1.1.0`), then click **Create new tag**
4. Release title: `LocalForge v1.1.0` (match your tag version)
5. Description: `Initial release of LocalForge desktop app`
6. Click **Publish release**

The version in your tag (e.g., v1.2.0) will be automatically used to build the app with that version number.

## Step 4: Wait for the Build

1. Go to https://github.com/jberon/localforge/actions
2. You'll see a workflow running called "Build Desktop App"
3. Wait about 10-15 minutes for it to complete
4. Once done, go back to Releases - the .dmg files will be attached

## Step 5: Download Your App

1. Go to https://github.com/jberon/localforge/releases/latest
2. Download `LocalForge-<version>-arm64.dmg` (for your M4 Pro)
3. Double-click the .dmg and drag LocalForge to Applications
4. Open LocalForge from Applications

## Troubleshooting

### Build fails with "npm ci" error
Make sure `package-lock.json` is included in your git push.

### App won't open on macOS
Right-click the app and choose "Open" the first time. macOS may block unsigned apps.

### Need to update the app later
1. Make your changes in Replit
2. Download as zip
3. Push to GitHub
4. Create a new release with a higher version number (e.g., v1.2.0)

## Alternative: Manual Build

If you prefer to build locally without GitHub:

```bash
# Install Node.js from https://nodejs.org
cd ~/Desktop/Local-Dev-Suite
./scripts/setup-electron.sh
npm run electron:build:arm64
```

The app will be in the `release` folder.
