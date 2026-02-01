import type { DataModel, DataEntity, DataField, GeneratedFile } from "@shared/schema";

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function pluralize(str: string): string {
  if (str.endsWith('y')) {
    return str.slice(0, -1) + 'ies';
  }
  if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
    return str + 'es';
  }
  return str + 's';
}

function getDrizzleType(field: DataField): string {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
    case 'textarea':
      return 'text';
    case 'number':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'timestamp';
    default:
      return 'text';
  }
}

function generateDrizzleSchema(dataModel: DataModel): string {
  const imports = new Set(['pgTable', 'serial', 'text', 'integer', 'boolean', 'timestamp']);
  
  let schema = `import { ${Array.from(imports).join(', ')} } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

`;

  for (const entity of dataModel.entities) {
    const tableName = pluralize(toCamelCase(entity.name));
    const varName = toCamelCase(entity.name);
    
    schema += `export const ${tableName} = pgTable("${tableName}", {\n`;
    schema += `  id: serial("id").primaryKey(),\n`;
    
    for (const field of entity.fields) {
      if (field.name === 'id') continue;
      const drizzleType = getDrizzleType(field);
      let line = `  ${toCamelCase(field.name)}: ${drizzleType}("${toCamelCase(field.name)}")`;
      if (field.required) {
        line += '.notNull()';
      }
      schema += line + ',\n';
    }
    
    schema += `  createdAt: timestamp("created_at").defaultNow().notNull(),\n`;
    schema += `  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n`;
    schema += `});\n\n`;
    
    schema += `export const insert${toPascalCase(entity.name)}Schema = createInsertSchema(${tableName}).omit({ id: true, createdAt: true, updatedAt: true });\n`;
    schema += `export type ${toPascalCase(entity.name)} = typeof ${tableName}.$inferSelect;\n`;
    schema += `export type Insert${toPascalCase(entity.name)} = z.infer<typeof insert${toPascalCase(entity.name)}Schema>;\n\n`;
  }

  return schema;
}

function generateExpressRoutes(dataModel: DataModel): string {
  let routes = `import { Express } from "express";
import { db } from "./db";
import { eq } from "drizzle-orm";
`;

  const tableImports: string[] = [];
  const schemaImports: string[] = [];
  
  for (const entity of dataModel.entities) {
    tableImports.push(pluralize(toCamelCase(entity.name)));
    schemaImports.push(`insert${toPascalCase(entity.name)}Schema`);
  }
  
  routes += `import { ${tableImports.join(', ')}, ${schemaImports.join(', ')} } from "@shared/schema";\n\n`;
  
  routes += `export function registerRoutes(app: Express) {\n`;

  for (const entity of dataModel.entities) {
    const tableName = pluralize(toCamelCase(entity.name));
    const routePath = toKebabCase(pluralize(entity.name));
    const varName = toCamelCase(entity.name);
    const pascalName = toPascalCase(entity.name);
    
    routes += `
  // ${pascalName} CRUD routes
  app.get("/api/${routePath}", async (req, res) => {
    try {
      const items = await db.select().from(${tableName});
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ${routePath}" });
    }
  });

  app.get("/api/${routePath}/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [item] = await db.select().from(${tableName}).where(eq(${tableName}.id, id));
      if (!item) {
        return res.status(404).json({ error: "${pascalName} not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ${varName}" });
    }
  });

  app.post("/api/${routePath}", async (req, res) => {
    try {
      const data = insert${pascalName}Schema.parse(req.body);
      const [item] = await db.insert(${tableName}).values(data).returning();
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid ${varName} data" });
    }
  });

  app.put("/api/${routePath}/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = insert${pascalName}Schema.partial().parse(req.body);
      const [item] = await db.update(${tableName}).set({ ...data, updatedAt: new Date() }).where(eq(${tableName}.id, id)).returning();
      if (!item) {
        return res.status(404).json({ error: "${pascalName} not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid ${varName} data" });
    }
  });

  app.delete("/api/${routePath}/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [item] = await db.delete(${tableName}).where(eq(${tableName}.id, id)).returning();
      if (!item) {
        return res.status(404).json({ error: "${pascalName} not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete ${varName}" });
    }
  });
`;
  }

  routes += `}\n`;
  return routes;
}

function generateReactComponent(entity: DataEntity): string {
  const pascalName = toPascalCase(entity.name);
  const pluralName = pluralize(pascalName);
  const camelName = toCamelCase(entity.name);
  const pluralCamel = pluralize(camelName);
  const routePath = toKebabCase(pluralize(entity.name));
  
  const editableFields = entity.fields.filter(f => f.name !== 'id');
  
  let component = `import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";

interface ${pascalName} {
  id: number;
${entity.fields.filter(f => f.name !== 'id').map(f => `  ${toCamelCase(f.name)}: ${f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string'};`).join('\n')}
  createdAt: string;
  updatedAt: string;
}

export function ${pluralName}Page() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: ${pluralCamel} = [], isLoading } = useQuery<${pascalName}[]>({
    queryKey: ["/api/${routePath}"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<${pascalName}, "id" | "createdAt" | "updatedAt">) => {
      const res = await fetch("/api/${routePath}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<${pascalName}> }) => {
      const res = await fetch(\`/api/${routePath}/\${id}\`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(\`/api/${routePath}/\${id}\`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/${routePath}"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${pluralName}</h1>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add ${pascalName}
        </Button>
      </div>

      {isAdding && (
        <${pascalName}Form
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setIsAdding(false)}
          isLoading={createMutation.isPending}
        />
      )}

      <div className="grid gap-4">
        {${pluralCamel}.map((item) => (
          <Card key={item.id} className="p-4">
            {editingId === item.id ? (
              <${pascalName}Form
                initialData={item}
                onSubmit={(data) => updateMutation.mutate({ id: item.id, data })}
                onCancel={() => setEditingId(null)}
                isLoading={updateMutation.isPending}
              />
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
${editableFields.slice(0, 3).map(f => `                  <p><span className="font-medium">${f.name}:</span> {String(item.${toCamelCase(f.name)})}</p>`).join('\n')}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(item.id)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ${pascalName}Form({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialData?: ${pascalName};
  onSubmit: (data: Omit<${pascalName}, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
${editableFields.map(f => `  const [${toCamelCase(f.name)}, set${toPascalCase(f.name)}] = useState(initialData?.${toCamelCase(f.name)} ?? ${f.type === 'boolean' ? 'false' : f.type === 'number' ? '0' : '""'});`).join('\n')}

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ${editableFields.map(f => toCamelCase(f.name)).join(', ')} });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
${editableFields.map(f => `      <div className="space-y-2">
        <Label htmlFor="${toCamelCase(f.name)}">${f.name}${f.required ? ' *' : ''}</Label>
        <Input
          id="${toCamelCase(f.name)}"
          ${f.type === 'number' ? 'type="number"' : f.type === 'email' ? 'type="email"' : f.type === 'url' ? 'type="url"' : f.type === 'date' ? 'type="date"' : 'type="text"'}
          value={${f.type === 'boolean' ? `String(${toCamelCase(f.name)})` : toCamelCase(f.name)}}
          onChange={(e) => set${toPascalCase(f.name)}(${f.type === 'number' ? 'Number(e.target.value)' : f.type === 'boolean' ? 'e.target.value === "true"' : 'e.target.value'})}
          ${f.required ? 'required' : ''}
        />
      </div>`).join('\n')}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
`;

  return component;
}

function generatePackageJson(projectName: string): string {
  return JSON.stringify({
    name: toKebabCase(projectName),
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "concurrently \"npm run dev:server\" \"npm run dev:client\"",
      "dev:server": "tsx watch server/index.ts",
      "dev:client": "vite",
      build: "vite build && tsc -p tsconfig.server.json",
      "db:push": "drizzle-kit push",
      "db:studio": "drizzle-kit studio"
    },
    dependencies: {
      "@hookform/resolvers": "^3.3.4",
      "@neondatabase/serverless": "^0.9.0",
      "@radix-ui/react-label": "^2.0.2",
      "@radix-ui/react-slot": "^1.0.2",
      "@radix-ui/react-switch": "^1.0.3",
      "@tanstack/react-query": "^5.28.0",
      "class-variance-authority": "^0.7.0",
      clsx: "^2.1.0",
      "drizzle-orm": "^0.30.4",
      "drizzle-zod": "^0.5.1",
      express: "^4.18.3",
      "lucide-react": "^0.356.0",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      "react-hook-form": "^7.51.1",
      "tailwind-merge": "^2.2.1",
      "tailwindcss-animate": "^1.0.7",
      wouter: "^3.1.0",
      zod: "^3.22.4"
    },
    devDependencies: {
      "@types/express": "^4.17.21",
      "@types/node": "^20.11.25",
      "@types/react": "^18.2.64",
      "@types/react-dom": "^18.2.21",
      "@vitejs/plugin-react": "^4.2.1",
      autoprefixer: "^10.4.18",
      concurrently: "^8.2.2",
      "drizzle-kit": "^0.20.14",
      postcss: "^8.4.35",
      tailwindcss: "^3.4.1",
      tsx: "^4.7.1",
      typescript: "^5.4.2",
      vite: "^5.1.6"
    }
  }, null, 2);
}

function generateReadme(projectName: string, dataModel: DataModel): string {
  let readme = `# ${projectName}

A full-stack application generated by LocalForge.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Express.js
- **Database**: PostgreSQL with Drizzle ORM

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon serverless)

### Setup

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Set up your database connection in \`.env\`:
   \`\`\`
   DATABASE_URL=postgresql://user:password@host:5432/database
   \`\`\`

3. Push the database schema:
   \`\`\`bash
   npm run db:push
   \`\`\`

4. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Data Model

`;

  for (const entity of dataModel.entities) {
    readme += `### ${entity.name}\n\n`;
    readme += '| Field | Type | Required |\n';
    readme += '|-------|------|----------|\n';
    for (const field of entity.fields) {
      readme += `| ${field.name} | ${field.type} | ${field.required ? 'Yes' : 'No'} |\n`;
    }
    readme += '\n';
  }

  readme += `
## API Endpoints

`;

  for (const entity of dataModel.entities) {
    const routePath = toKebabCase(pluralize(entity.name));
    readme += `### ${entity.name}\n\n`;
    readme += `- \`GET /api/${routePath}\` - List all\n`;
    readme += `- \`GET /api/${routePath}/:id\` - Get one\n`;
    readme += `- \`POST /api/${routePath}\` - Create\n`;
    readme += `- \`PUT /api/${routePath}/:id\` - Update\n`;
    readme += `- \`DELETE /api/${routePath}/:id\` - Delete\n\n`;
  }

  return readme;
}

export function generateFullStackProject(projectName: string, dataModel: DataModel): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: 'package.json',
    content: generatePackageJson(projectName),
  });

  files.push({
    path: 'README.md',
    content: generateReadme(projectName, dataModel),
  });

  files.push({
    path: 'shared/schema.ts',
    content: generateDrizzleSchema(dataModel),
  });

  files.push({
    path: 'server/routes.ts',
    content: generateExpressRoutes(dataModel),
  });

  for (const entity of dataModel.entities) {
    files.push({
      path: `client/src/pages/${toKebabCase(pluralize(entity.name))}.tsx`,
      content: generateReactComponent(entity),
    });
  }

  files.push({
    path: '.env.example',
    content: `DATABASE_URL=postgresql://user:password@localhost:5432/${toKebabCase(projectName)}
PORT=3000
NODE_ENV=development
`,
  });

  // Add Docker files for deployment
  files.push({
    path: 'Dockerfile',
    content: `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
`,
  });

  files.push({
    path: 'docker-compose.yml',
    content: `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/${toKebabCase(projectName)}
      - NODE_ENV=production
    depends_on:
      - db

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${toKebabCase(projectName)}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
`,
  });

  return files;
}
