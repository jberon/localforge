import { BaseService, ManagedMap } from "../lib/base-service";
import { createHash } from "crypto";

interface DeployPackage {
  platform: string;
  files: Array<{ path: string; content: string }>;
  instructions: string[];
  commands: string[];
}

class DeployPackageService extends BaseService {
  private static instance: DeployPackageService;
  private packageCache: ManagedMap<string, DeployPackage>;

  private constructor() {
    super("DeployPackageService");
    this.packageCache = this.createManagedMap<string, DeployPackage>({
      maxSize: 100,
      strategy: "lru",
    });
  }

  static getInstance(): DeployPackageService {
    if (!DeployPackageService.instance) {
      DeployPackageService.instance = new DeployPackageService();
    }
    return DeployPackageService.instance;
  }

  destroy(): void {
    this.packageCache.clear();
    this.log("DeployPackageService destroyed");
  }

  generateDeployPackage(code: string, platform: string, projectName: string): DeployPackage {
    const codeHash = createHash("sha256").update(code).digest("hex").slice(0, 16);
    const cacheKey = `${platform}:${projectName}:${codeHash}`;
    const cached = this.packageCache.get(cacheKey);
    if (cached) return cached;

    let result: DeployPackage;

    switch (platform) {
      case "vercel":
        result = this.generateVercelPackage(code, projectName);
        break;
      case "netlify":
        result = this.generateNetlifyPackage(code, projectName);
        break;
      case "docker":
        result = this.generateDockerPackage(code, projectName);
        break;
      case "static":
        result = this.generateStaticPackage(code, projectName);
        break;
      case "railway":
        result = this.generateRailwayPackage(code, projectName);
        break;
      default:
        result = this.generateStaticPackage(code, projectName);
        break;
    }

    this.packageCache.set(cacheKey, result);
    this.log("Deploy package generated", { platform, projectName });
    return result;
  }

  generateStaticBundle(code: string, projectName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${projectName} - Built with React" />
  <title>${projectName}</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
${code}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
  </script>
</body>
</html>`;
  }

  getFilesForZip(deployPackage: DeployPackage): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    for (const file of deployPackage.files) {
      files.push({ path: file.path, content: file.content });
    }

    const readmeContent = this.generateReadme(deployPackage);
    files.push({ path: "README.md", content: readmeContent });

    return files;
  }

  private generateReadme(deployPackage: DeployPackage): string {
    const lines: string[] = [
      `# Deployment Package - ${deployPackage.platform}`,
      "",
      "## Instructions",
      "",
    ];

    for (const instruction of deployPackage.instructions) {
      lines.push(`- ${instruction}`);
    }

    if (deployPackage.commands.length > 0) {
      lines.push("");
      lines.push("## Commands");
      lines.push("");
      lines.push("```bash");
      for (const command of deployPackage.commands) {
        lines.push(command);
      }
      lines.push("```");
    }

    lines.push("");
    lines.push("## Files Included");
    lines.push("");
    for (const file of deployPackage.files) {
      lines.push(`- \`${file.path}\``);
    }

    return lines.join("\n");
  }

  private generateVercelPackage(code: string, projectName: string): DeployPackage {
    const vercelJson = JSON.stringify(
      {
        $schema: "https://openapi.vercel.sh/vercel.json",
        framework: "vite",
        buildCommand: "npm run build",
        outputDirectory: "dist",
        rewrites: [{ source: "/(.*)", destination: "/index.html" }],
      },
      null,
      2
    );

    const packageJson = JSON.stringify(
      {
        name: projectName,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.0.0",
          vite: "^5.0.0",
        },
      },
      null,
      2
    );

    return {
      platform: "vercel",
      files: [
        { path: "vercel.json", content: vercelJson },
        { path: "package.json", content: packageJson },
        { path: "src/App.jsx", content: code },
      ],
      instructions: [
        "Install the Vercel CLI: npm i -g vercel",
        "Run `vercel` in the project directory to deploy",
        "Alternatively, import the project from GitHub at https://vercel.com/new",
        "The app will be deployed as a static SPA with client-side routing support",
      ],
      commands: [
        "npm install",
        "npm run build",
        "vercel --prod",
      ],
    };
  }

  private generateNetlifyPackage(code: string, projectName: string): DeployPackage {
    const netlifyToml = `[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;

    const redirects = "/*    /index.html   200\n";

    const packageJson = JSON.stringify(
      {
        name: projectName,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.0.0",
          vite: "^5.0.0",
        },
      },
      null,
      2
    );

    return {
      platform: "netlify",
      files: [
        { path: "netlify.toml", content: netlifyToml },
        { path: "public/_redirects", content: redirects },
        { path: "package.json", content: packageJson },
        { path: "src/App.jsx", content: code },
      ],
      instructions: [
        "Install the Netlify CLI: npm i -g netlify-cli",
        "Run `netlify deploy` to deploy a draft, or `netlify deploy --prod` for production",
        "Alternatively, drag and drop the `dist` folder at https://app.netlify.com/drop",
        "SPA routing is configured via _redirects and netlify.toml",
      ],
      commands: [
        "npm install",
        "npm run build",
        "netlify deploy --prod --dir=dist",
      ],
    };
  }

  private generateDockerPackage(code: string, projectName: string): DeployPackage {
    const dockerfile = `# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

    const dockerignore = `node_modules
dist
.git
.gitignore
*.md
.env
.env.*
.DS_Store
`;

    const nginxConf = `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
`;

    const packageJson = JSON.stringify(
      {
        name: projectName,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.0.0",
          vite: "^5.0.0",
        },
      },
      null,
      2
    );

    return {
      platform: "docker",
      files: [
        { path: "Dockerfile", content: dockerfile },
        { path: ".dockerignore", content: dockerignore },
        { path: "nginx.conf", content: nginxConf },
        { path: "package.json", content: packageJson },
        { path: "src/App.jsx", content: code },
      ],
      instructions: [
        "Build the Docker image: docker build -t app .",
        "Run the container: docker run -p 80:80 app",
        "Access the app at http://localhost",
        "Uses a multi-stage build with node:20-alpine for building and nginx:alpine for serving",
        "SPA routing is handled by nginx configuration",
      ],
      commands: [
        `docker build -t ${projectName} .`,
        `docker run -p 80:80 ${projectName}`,
      ],
    };
  }

  private generateStaticPackage(code: string, projectName: string): DeployPackage {
    const html = this.generateStaticBundle(code, projectName);

    return {
      platform: "static",
      files: [
        { path: "index.html", content: html },
      ],
      instructions: [
        "Open index.html directly in any modern web browser",
        "No build step or server required - everything is self-contained",
        "Deploy to any static hosting: GitHub Pages, Netlify, Vercel, S3, etc.",
        "Uses React 18, Babel standalone, and Tailwind CSS via CDN",
      ],
      commands: [
        "open index.html",
      ],
    };
  }

  private generateRailwayPackage(code: string, projectName: string): DeployPackage {
    const railwayJson = JSON.stringify(
      {
        $schema: "https://railway.app/railway.schema.json",
        build: {
          builder: "NIXPACKS",
          buildCommand: "npm run build",
        },
        deploy: {
          startCommand: "npx serve dist -s -l $PORT",
          healthcheckPath: "/",
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 10,
        },
      },
      null,
      2
    );

    const nixpacksToml = `[phases.setup]
nixPkgs = ["nodejs_20"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npx serve dist -s -l $PORT"
`;

    const packageJson = JSON.stringify(
      {
        name: projectName,
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
          serve: "^14.2.0",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.0.0",
          vite: "^5.0.0",
        },
      },
      null,
      2
    );

    return {
      platform: "railway",
      files: [
        { path: "railway.json", content: railwayJson },
        { path: "nixpacks.toml", content: nixpacksToml },
        { path: "package.json", content: packageJson },
        { path: "src/App.jsx", content: code },
      ],
      instructions: [
        "Create a new project at https://railway.app",
        "Connect your GitHub repository or use the Railway CLI",
        "Railway will auto-detect the configuration from railway.json and nixpacks.toml",
        "The app will be built with Vite and served using the `serve` package",
      ],
      commands: [
        "npm install -g @railway/cli",
        "railway login",
        "railway init",
        "railway up",
      ],
    };
  }
}

export const deployPackageService = DeployPackageService.getInstance();
