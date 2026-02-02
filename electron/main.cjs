const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;

// Common paths where node might be installed on macOS
const NODE_DIRECT_PATHS = [
  '/opt/homebrew/bin/node',           // Apple Silicon Homebrew
  '/opt/homebrew/opt/node/bin/node',  // Homebrew versioned
  '/usr/local/bin/node',              // Intel Homebrew / manual install
  '/usr/local/opt/node/bin/node',     // Intel Homebrew versioned
  '/usr/bin/node',                    // System install
];

function findNodePath() {
  const home = process.env.HOME || '';
  
  // Try to get node from login shell (works for GUI launches)
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const nodePath = execSync(`${shell} -lc 'which node'`, { 
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    if (nodePath && fs.existsSync(nodePath)) {
      console.log('Found node via shell:', nodePath);
      return nodePath;
    }
  } catch (e) {
    // Shell lookup failed, continue checking known paths
  }

  // Check direct paths
  for (const nodePath of NODE_DIRECT_PATHS) {
    if (fs.existsSync(nodePath)) {
      console.log('Found node at:', nodePath);
      return nodePath;
    }
  }

  // Check NVM - find highest version with semver-like sorting
  const nvmDir = path.join(home, '.nvm/versions/node');
  try {
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir)
        .filter(v => v.startsWith('v'))
        .sort((a, b) => {
          // Parse semver: v20.10.0 -> [20, 10, 0]
          const parseVersion = (v) => v.slice(1).split('.').map(n => parseInt(n, 10) || 0);
          const [aMajor, aMinor, aPatch] = parseVersion(a);
          const [bMajor, bMinor, bPatch] = parseVersion(b);
          return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
        });
      
      for (const version of versions) {
        const nvmNodePath = path.join(nvmDir, version, 'bin', 'node');
        if (fs.existsSync(nvmNodePath)) {
          console.log('Found node via NVM:', nvmNodePath);
          return nvmNodePath;
        }
      }
    }
  } catch (e) {
    console.error('NVM search error:', e.message);
  }

  // Check Volta
  const voltaPath = path.join(home, '.volta/bin/node');
  if (fs.existsSync(voltaPath)) {
    console.log('Found node via Volta:', voltaPath);
    return voltaPath;
  }

  // Check asdf
  const asdfPath = path.join(home, '.asdf/shims/node');
  if (fs.existsSync(asdfPath)) {
    console.log('Found node via asdf:', asdfPath);
    return asdfPath;
  }

  // Check fnm (Fast Node Manager)
  const fnmDir = path.join(home, '.fnm/node-versions');
  try {
    if (fs.existsSync(fnmDir)) {
      const versions = fs.readdirSync(fnmDir)
        .filter(v => v.startsWith('v'))
        .sort((a, b) => {
          const parseVersion = (v) => v.slice(1).split('.').map(n => parseInt(n, 10) || 0);
          const [aMajor, aMinor, aPatch] = parseVersion(a);
          const [bMajor, bMinor, bPatch] = parseVersion(b);
          return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
        });
      
      for (const version of versions) {
        const fnmNodePath = path.join(fnmDir, version, 'installation', 'bin', 'node');
        if (fs.existsSync(fnmNodePath)) {
          console.log('Found node via fnm:', fnmNodePath);
          return fnmNodePath;
        }
      }
    }
  } catch (e) {
    console.error('fnm search error:', e.message);
  }

  console.error('Node.js not found in any known location');
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'LocalForge',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: app.isPackaged 
      ? path.join(process.resourcesPath, 'dist', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.svg')
  });

  const startUrl = isDev 
    ? `http://localhost:${PORT}` 
    : `http://localhost:${PORT}`;

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createMenu() {
  const template = [
    {
      label: 'LocalForge',
      submenu: [
        { label: 'About LocalForge', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: () => {
          mainWindow.webContents.executeJavaScript('document.querySelector("[data-testid=button-settings]")?.click()');
        }},
        { type: 'separator' },
        { label: 'Hide LocalForge', accelerator: 'CmdOrCtrl+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'CmdOrCtrl+Shift+H', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit LocalForge', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'Alt+CmdOrCtrl+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+CmdOrCtrl+F', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => {
          mainWindow.webContents.executeJavaScript('document.querySelector("[data-testid=button-new-project]")?.click()');
        }},
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => {
          mainWindow.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))');
        }},
        { type: 'separator' },
        { label: 'Download Project', accelerator: 'CmdOrCtrl+Shift+D', click: () => {
          mainWindow.webContents.executeJavaScript('document.querySelector("[data-testid=button-download]")?.click()');
        }}
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'LM Studio Website', click: () => {
          shell.openExternal('https://lmstudio.ai');
        }},
        { label: 'LocalForge Documentation', click: () => {
          shell.openExternal('https://github.com/jberon/localforge');
        }}
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function startServer() {
  let appPath, serverPath, command, args;
  
  if (app.isPackaged) {
    // In packaged mode, find node installation
    const nodePath = findNodePath();
    
    if (!nodePath) {
      console.error('Node.js not found');
      showErrorWindow(
        'Node.js is required but was not found on your system.',
        'Please install Node.js from nodejs.org and restart LocalForge.',
        'https://nodejs.org'
      );
      return;
    }
    
    console.log('Found Node.js at:', nodePath);
    
    // In packaged mode, the app bundle is at app.getAppPath()
    // dist is copied to resources/dist via extraResources
    appPath = path.dirname(app.getAppPath());
    serverPath = path.join(process.resourcesPath, 'dist', 'index.cjs');
    command = nodePath;
    args = [serverPath];
    
    // Check if server file exists
    if (!fs.existsSync(serverPath)) {
      console.error('Server file not found:', serverPath);
      showErrorWindow(
        'Server files are missing.',
        'The application may be corrupted. Please download LocalForge again.',
        'https://github.com/jberon/localforge/releases'
      );
      return;
    }
  } else {
    // In dev mode, run from project root
    appPath = path.join(__dirname, '..');
    serverPath = path.join(__dirname, '..', 'server', 'index.ts');
    command = 'npx';
    args = ['tsx', serverPath];
  }

  console.log('Starting server:', command, args.join(' '));
  console.log('Working directory:', appPath);
  console.log('Server path:', serverPath);

  serverProcess = spawn(command, args, {
    cwd: appPath,
    env: { 
      ...process.env, 
      NODE_ENV: app.isPackaged ? 'production' : 'development', 
      PORT,
      DATABASE_URL: process.env.DATABASE_URL || ''
    },
    stdio: app.isPackaged ? 'pipe' : 'inherit'
  });

  if (app.isPackaged) {
    serverProcess.stdout?.on('data', (data) => console.log('[server]', data.toString()));
    serverProcess.stderr?.on('data', (data) => console.error('[server]', data.toString()));
  }

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    showErrorWindow(
      'Failed to start server',
      err.message,
      null
    );
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('Server exited with code:', code);
    }
  });
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', (err) => {
        resolve(err.code !== 'EADDRINUSE');
      })
      .once('listening', () => {
        tester.close();
        resolve(true);
      })
      .listen(port, '127.0.0.1');
  });
}

function waitForServer(callback, attempts = 0) {
  const maxAttempts = 60;
  const delay = 500;

  const http = require('http');
  
  const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
    if (res.statusCode === 200) {
      callback();
    } else if (attempts < maxAttempts) {
      setTimeout(() => waitForServer(callback, attempts + 1), delay);
    } else {
      showErrorWindow(
        'Server health check failed',
        'The server started but is not responding correctly. Please restart LocalForge.',
        null
      );
    }
  });

  req.on('error', async () => {
    if (attempts < maxAttempts) {
      setTimeout(() => waitForServer(callback, attempts + 1), delay);
    } else {
      // Check if port is in use by another application
      const portFree = await checkPortAvailable(PORT);
      if (!portFree) {
        showErrorWindow(
          `Port ${PORT} is already in use`,
          'Another application is using this port. On macOS, AirPlay Receiver often uses port 5000.\n\nTo fix: Go to System Settings → AirDrop & Handoff → AirPlay Receiver → Turn OFF',
          null
        );
      } else {
        showErrorWindow(
          'Could not connect to server',
          'LocalForge server failed to start. Please restart the application.',
          null
        );
      }
    }
  });

  req.end();
}

function showErrorWindow(title, description, helpUrl) {
  const errorWindow = new BrowserWindow({
    width: 520,
    height: 380,
    title: 'LocalForge - Error',
    backgroundColor: '#0a0a0b',
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Escape HTML to prevent injection
  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  };

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const linkButton = helpUrl ? `
    <a href="${helpUrl}" target="_blank" class="link-btn">Get Help</a>
  ` : '';

  errorWindow.loadURL(`data:text/html,${encodeURIComponent(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
        background: #0a0a0b; 
        color: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        height: 100vh; 
        margin: 0;
        flex-direction: column;
        text-align: center;
        padding: 40px;
        -webkit-app-region: drag;
      }
      .icon {
        width: 64px;
        height: 64px;
        margin-bottom: 20px;
        fill: #ef4444;
      }
      h1 { 
        color: #f5f5f5; 
        margin: 0 0 12px 0;
        font-size: 20px;
        font-weight: 600;
      }
      p { 
        color: #a1a1aa; 
        margin: 0 0 28px 0;
        font-size: 14px;
        line-height: 1.6;
        max-width: 400px;
      }
      .buttons {
        display: flex;
        gap: 12px;
        -webkit-app-region: no-drag;
      }
      button, .link-btn {
        background: #27272a;
        color: white;
        border: 1px solid #3f3f46;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
        transition: all 0.15s ease;
      }
      button:hover, .link-btn:hover { 
        background: #3f3f46;
        border-color: #52525b;
      }
      .link-btn {
        background: #6366f1;
        border-color: #6366f1;
      }
      .link-btn:hover {
        background: #4f46e5;
        border-color: #4f46e5;
      }
    </style>
  </head>
  <body>
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
    </svg>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <div class="buttons">
      ${linkButton}
      <button onclick="window.close()">Close</button>
    </div>
  </body>
</html>`)}`);

  // Handle external links
  errorWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMenu();
  startServer();
  
  waitForServer(() => {
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.setAboutPanelOptions({
  applicationName: 'LocalForge',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: '© 2025 Josh Beron',
  credits: 'Built with Electron, React, and LM Studio integration'
});
