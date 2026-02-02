const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;

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
    icon: undefined
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
  let appPath, serverPath;
  
  if (app.isPackaged) {
    // In packaged mode, the app bundle is at app.getAppPath()
    // dist is copied to resources/dist via extraResources
    appPath = path.dirname(app.getAppPath());
    serverPath = path.join(process.resourcesPath, 'dist', 'index.cjs');
  } else {
    // In dev mode, run from project root
    appPath = path.join(__dirname, '..');
    serverPath = path.join(__dirname, '..', 'server', 'index.ts');
  }

  const command = app.isPackaged ? 'node' : 'npx';
  const args = app.isPackaged ? [serverPath] : ['tsx', serverPath];

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
    showErrorWindow(`Failed to start server: ${err.message}`);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('Server exited with code:', code);
    }
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
      showErrorWindow('Server health check failed. Please restart the application.');
    }
  });

  req.on('error', () => {
    if (attempts < maxAttempts) {
      setTimeout(() => waitForServer(callback, attempts + 1), delay);
    } else {
      showErrorWindow('Could not connect to LocalForge server. Please check if port 5000 is available.');
    }
  });

  req.end();
}

function showErrorWindow(message) {
  const errorWindow = new BrowserWindow({
    width: 500,
    height: 300,
    title: 'LocalForge - Error',
    backgroundColor: '#0a0a0b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  errorWindow.loadURL(`data:text/html,
    <html>
      <head>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            background: #0a0a0b; 
            color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            flex-direction: column;
            text-align: center;
            padding: 20px;
          }
          h1 { color: #ef4444; margin-bottom: 16px; }
          p { color: #a1a1aa; margin-bottom: 24px; }
          button {
            background: #6366f1;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
          }
          button:hover { background: #4f46e5; }
        </style>
      </head>
      <body>
        <h1>Startup Error</h1>
        <p>${message}</p>
        <button onclick="window.close()">Close</button>
      </body>
    </html>
  `);
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
