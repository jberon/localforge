import type { DataModel } from "@shared/schema";
import { toPascalCase, toCamelCase, toKebabCase, pluralize } from "./utils";

export function generateExpressRoutes(dataModel: DataModel): string {
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
