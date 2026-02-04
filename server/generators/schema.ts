import type { DataModel } from "@shared/schema";
import { toPascalCase, toCamelCase, pluralize, getDrizzleType } from "./utils";

export function generateDrizzleSchema(dataModel: DataModel): string {
  const imports = new Set(['pgTable', 'serial', 'text', 'integer', 'boolean', 'timestamp']);
  
  let schema = `import { ${Array.from(imports).join(', ')} } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

`;

  for (const entity of dataModel.entities) {
    const tableName = pluralize(toCamelCase(entity.name));
    
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
