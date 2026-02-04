import { ProjectFile } from "./local-project-builder.service";

export interface ProjectConfig {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  useTailwind?: boolean;
  useShadcn?: boolean;
}

export function generatePackageJson(config: ProjectConfig): string {
  const baseDeps: Record<string, string> = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  };

  const baseDevDeps: Record<string, string> = {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    typescript: "^5.5.3",
    vite: "^5.4.2",
  };

  if (config.useTailwind !== false) {
    baseDevDeps["tailwindcss"] = "^3.4.10";
    baseDevDeps["postcss"] = "^8.4.41";
    baseDevDeps["autoprefixer"] = "^10.4.20";
  }

  const packageJson = {
    name: config.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
    },
    dependencies: { ...baseDeps, ...config.dependencies },
    devDependencies: { ...baseDevDeps, ...config.devDependencies },
  };

  return JSON.stringify(packageJson, null, 2);
}

export function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3001,
  },
});
`;
}

export function generateTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`;
}

export function generateTsConfigNode(): string {
  return `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
`;
}

export function generateTailwindConfig(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
}

export function generatePostCssConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
}

export function generateIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function generateMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

export function generateIndexCss(useTailwind: boolean = true): string {
  if (useTailwind) {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
}

body {
  margin: 0;
  min-height: 100vh;
}
`;
  }
  
  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.5;
}
`;
}

export function extractDependenciesFromCode(files: ProjectFile[]): Record<string, string> {
  const deps: Record<string, string> = {};
  const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]+\})|(?:\w+))?\s*(?:,\s*(?:\{[^}]+\}|\w+))?\s*from\s+['"]([^'"./][^'"]*)['"]/g;
  
  const knownPackages: Record<string, string> = {
    "@mui/material": "^5.15.0",
    "@mui/icons-material": "^5.15.0",
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "lucide-react": "^0.400.0",
    "framer-motion": "^11.0.0",
    "axios": "^1.7.0",
    "zustand": "^4.5.0",
    "react-router-dom": "^6.23.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.6.0",
    "zod": "^3.23.0",
    "date-fns": "^3.6.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-toast": "^1.1.5",
    "recharts": "^2.12.0",
    "@tanstack/react-query": "^5.45.0",
    "sonner": "^1.5.0",
  };

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const pkg = match[1];
      const basePkg = pkg.startsWith("@") 
        ? pkg.split("/").slice(0, 2).join("/")
        : pkg.split("/")[0];
      
      if (basePkg === "react" || basePkg === "react-dom") continue;
      
      if (knownPackages[basePkg]) {
        deps[basePkg] = knownPackages[basePkg];
        
        if (basePkg === "@mui/material") {
          deps["@emotion/react"] = knownPackages["@emotion/react"];
          deps["@emotion/styled"] = knownPackages["@emotion/styled"];
        }
      } else if (!basePkg.startsWith(".") && !basePkg.startsWith("/")) {
        deps[basePkg] = "latest";
      }
    }
  }

  return deps;
}

export function generateProjectScaffold(
  projectName: string,
  generatedFiles: ProjectFile[]
): ProjectFile[] {
  const extractedDeps = extractDependenciesFromCode(generatedFiles);
  
  const scaffoldFiles: ProjectFile[] = [
    {
      path: "package.json",
      content: generatePackageJson({
        name: projectName,
        dependencies: extractedDeps,
        useTailwind: true,
      }),
    },
    { path: "vite.config.ts", content: generateViteConfig() },
    { path: "tsconfig.json", content: generateTsConfig() },
    { path: "tsconfig.node.json", content: generateTsConfigNode() },
    { path: "tailwind.config.js", content: generateTailwindConfig() },
    { path: "postcss.config.js", content: generatePostCssConfig() },
    { path: "index.html", content: generateIndexHtml(projectName) },
  ];

  const hasMain = generatedFiles.some((f) => 
    f.path.includes("main.tsx") || f.path.includes("main.ts")
  );
  if (!hasMain) {
    scaffoldFiles.push({ path: "src/main.tsx", content: generateMainTsx() });
  }

  const hasIndexCss = generatedFiles.some((f) => 
    f.path.includes("index.css") || f.path.includes("globals.css")
  );
  if (!hasIndexCss) {
    scaffoldFiles.push({ path: "src/index.css", content: generateIndexCss(true) });
  }

  const normalizedGenerated = generatedFiles.map((f) => ({
    path: f.path.startsWith("src/") ? f.path : `src/${f.path.replace(/^\.?\//, "")}`,
    content: f.content,
  }));

  const allFiles = [...scaffoldFiles];
  for (const file of normalizedGenerated) {
    const existingIndex = allFiles.findIndex((f) => f.path === file.path);
    if (existingIndex >= 0) {
      allFiles[existingIndex] = file;
    } else {
      allFiles.push(file);
    }
  }

  return allFiles;
}

export const projectTemplateService = {
  generatePackageJson,
  generateViteConfig,
  generateTsConfig,
  generateTsConfigNode,
  generateTailwindConfig,
  generatePostCssConfig,
  generateIndexHtml,
  generateMainTsx,
  generateIndexCss,
  extractDependenciesFromCode,
  generateProjectScaffold,
};
