import * as esbuild from 'esbuild-wasm';

let esbuildInitialized = false;
let initPromise: Promise<void> | null = null;

async function initializeEsbuild(): Promise<void> {
  if (esbuildInitialized) return;
  if (initPromise) return initPromise;
  
  initPromise = esbuild.initialize({
    wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.1/esbuild.wasm',
  });
  
  await initPromise;
  esbuildInitialized = true;
}

export interface VirtualFile {
  path: string;
  content: string;
}

export interface BundleResult {
  code: string;
  errors: string[];
  warnings: string[];
}

function resolveImport(importPath: string, currentFile: string, files: Map<string, string>): string | null {
  const possibleExtensions = ['.tsx', '.ts', '.jsx', '.js', '.json'];
  const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/') + 1) || '/';
  
  let resolvedPath: string;
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const parts = (currentDir + importPath).split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') resolved.pop();
      else if (part !== '.') resolved.push(part);
    }
    resolvedPath = '/' + resolved.join('/');
  } else if (importPath.startsWith('/')) {
    resolvedPath = importPath;
  } else {
    return null;
  }
  
  if (files.has(resolvedPath)) return resolvedPath;
  
  for (const ext of possibleExtensions) {
    if (files.has(resolvedPath + ext)) return resolvedPath + ext;
  }
  
  const indexPaths = possibleExtensions.map(ext => resolvedPath + '/index' + ext);
  for (const indexPath of indexPaths) {
    if (files.has(indexPath)) return indexPath;
  }
  
  return null;
}

function createVirtualFilePlugin(files: Map<string, string>): esbuild.Plugin {
  return {
    name: 'virtual-file-system',
    setup(build) {
      build.onResolve({ filter: /^react$|^react-dom$|^react-dom\/client$|^react\/jsx-runtime$/ }, (args) => ({
        path: args.path,
        namespace: 'external',
        sideEffects: false,
      }));
      
      build.onLoad({ filter: /.*/, namespace: 'external' }, (args) => {
        const getGlobalExport = (path: string) => {
          if (path === 'react') {
            return `
              var React = window.React;
              module.exports = React;
              module.exports.default = React;
              module.exports.useState = React.useState;
              module.exports.useEffect = React.useEffect;
              module.exports.useCallback = React.useCallback;
              module.exports.useMemo = React.useMemo;
              module.exports.useRef = React.useRef;
              module.exports.useContext = React.useContext;
              module.exports.useReducer = React.useReducer;
              module.exports.createElement = React.createElement;
              module.exports.Fragment = React.Fragment;
              module.exports.createContext = React.createContext;
              module.exports.forwardRef = React.forwardRef;
              module.exports.memo = React.memo;
              module.exports.lazy = React.lazy;
              module.exports.Suspense = React.Suspense;
              module.exports.Children = React.Children;
              module.exports.cloneElement = React.cloneElement;
              module.exports.isValidElement = React.isValidElement;
            `;
          } else if (path === 'react-dom' || path === 'react-dom/client') {
            return `
              var ReactDOM = window.ReactDOM;
              module.exports = ReactDOM;
              module.exports.default = ReactDOM;
              module.exports.createRoot = ReactDOM.createRoot;
              module.exports.createPortal = ReactDOM.createPortal;
              module.exports.render = ReactDOM.render;
              module.exports.hydrate = ReactDOM.hydrate;
              module.exports.flushSync = ReactDOM.flushSync;
            `;
          } else if (path === 'react/jsx-runtime') {
            return `
              var React = window.React;
              module.exports = {
                jsx: React.createElement,
                jsxs: React.createElement,
                Fragment: React.Fragment
              };
            `;
          }
          return `module.exports = window.${path.replace(/[^a-zA-Z]/g, '')} || {};`;
        };
        
        return {
          contents: getGlobalExport(args.path),
          loader: 'js',
        };
      });

      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return { path: args.path, namespace: 'virtual' };
        }
        
        const resolved = resolveImport(args.path, args.importer || '/src/App.tsx', files);
        if (resolved) {
          return { path: resolved, namespace: 'virtual' };
        }
        
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return { path: args.path, namespace: 'external' };
        }
        
        return { path: args.path, namespace: 'virtual' };
      });

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const content = files.get(args.path);
        if (!content) {
          return { contents: '', loader: 'js' };
        }
        
        const ext = args.path.split('.').pop()?.toLowerCase() || 'js';
        const loader = ext === 'tsx' ? 'tsx' : 
                       ext === 'ts' ? 'ts' : 
                       ext === 'jsx' ? 'jsx' : 
                       ext === 'json' ? 'json' : 
                       ext === 'css' ? 'css' : 'js';
        
        return { contents: content, loader };
      });
    },
  };
}

function findEntryPoint(files: Map<string, string>): string {
  const entryPriority = [
    '/src/App.tsx',
    '/src/App.ts',
    '/src/App.jsx',
    '/src/App.js',
    '/App.tsx',
    '/App.ts',
    '/App.jsx',
    '/App.js',
    '/src/index.tsx',
    '/src/index.ts',
    '/src/index.jsx',
    '/src/index.js',
    '/index.tsx',
    '/index.ts',
    '/index.jsx',
    '/index.js',
  ];
  
  for (const entry of entryPriority) {
    if (files.has(entry)) return entry;
  }
  
  const allPaths = Array.from(files.keys());
  for (const path of allPaths) {
    if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
      return path;
    }
  }
  
  for (const path of allPaths) {
    if (path.endsWith('.ts') || path.endsWith('.js')) {
      return path;
    }
  }
  
  return '/src/App.tsx';
}

export async function bundleProject(virtualFiles: VirtualFile[]): Promise<BundleResult> {
  await initializeEsbuild();
  
  const files = new Map<string, string>();
  for (const file of virtualFiles) {
    let path = file.path;
    if (!path.startsWith('/')) path = '/' + path;
    files.set(path, file.content);
  }
  
  const entryPoint = findEntryPoint(files);
  
  try {
    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2020',
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.jsx': 'jsx',
        '.js': 'js',
        '.json': 'json',
        '.css': 'css',
      },
      define: {
        'process.env.NODE_ENV': '"development"',
      },
      plugins: [createVirtualFilePlugin(files)],
      logLevel: 'silent',
    });
    
    const output = result.outputFiles?.[0]?.text || '';
    const errors = result.errors.map(e => `${e.location?.file || 'unknown'}:${e.location?.line || 0} - ${e.text}`);
    const warnings = result.warnings.map(w => `${w.location?.file || 'unknown'}:${w.location?.line || 0} - ${w.text}`);
    
    return { code: output, errors, warnings };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    return {
      code: '',
      errors: [errorMessage],
      warnings: [],
    };
  }
}

export function generatePreviewHtml(bundledCode: string, nonce: string): string {
  const consoleInterceptor = `
    (function() {
      const NONCE = '${nonce}';
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
      };
      
      function sendToParent(level, args) {
        try {
          const message = args.map(arg => {
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg, null, 2); }
              catch { return String(arg); }
            }
            return String(arg);
          }).join(' ');
          window.parent.postMessage({ type: 'console', level, message, nonce: NONCE }, '*');
        } catch(e) {}
      }
      
      console.log = function(...args) { sendToParent('log', args); originalConsole.log.apply(console, args); };
      console.warn = function(...args) { sendToParent('warn', args); originalConsole.warn.apply(console, args); };
      console.error = function(...args) { sendToParent('error', args); originalConsole.error.apply(console, args); };
      console.info = function(...args) { sendToParent('info', args); originalConsole.info.apply(console, args); };
      
      window.onerror = function(message, source, lineno, colno, error) {
        sendToParent('error', [message + ' at line ' + lineno]);
        return false;
      };
    })();
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>${consoleInterceptor}</script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: white; }
    * { box-sizing: border-box; }
    .error-display { padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; }
    .error-display h3 { margin: 0 0 8px 0; }
    .error-display pre { margin: 0; white-space: pre-wrap; font-size: 14px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    try {
      ${bundledCode}
      
      if (typeof App !== 'undefined') {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
      } else if (typeof Calculator !== 'undefined') {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(Calculator));
      }
    } catch (err) {
      console.error('Runtime Error:', err.message || err);
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = '<div class="error-display"><h3>Runtime Error</h3><pre>' + (err.message || err) + '</pre></div>';
      }
    }
  </script>
</body>
</html>`;
}

export function generateErrorHtml(errors: string[], nonce: string): string {
  const errorList = errors.map(e => `<li>${e.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #fef2f2; }
    .error-container { max-width: 600px; margin: 0 auto; }
    h2 { color: #991b1b; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px; }
    .icon { width: 24px; height: 24px; }
    ul { margin: 0; padding: 0 0 0 20px; color: #7f1d1d; }
    li { margin: 8px 0; font-size: 14px; line-height: 1.5; }
    .tip { margin-top: 24px; padding: 16px; background: #fff7ed; border-radius: 8px; color: #9a3412; font-size: 14px; }
  </style>
</head>
<body>
  <div class="error-container">
    <h2>
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Build Errors
    </h2>
    <ul>${errorList}</ul>
    <div class="tip">
      <strong>Tip:</strong> Check your imports and make sure all referenced files exist. The bundler is looking for components in the generated files.
    </div>
  </div>
</body>
</html>`;
}
