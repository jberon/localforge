import { db as dbInstance } from "../db";
import { schemaMigrations, projectFiles } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}

export interface SchemaChange {
  type: "add_entity" | "remove_entity" | "add_field" | "remove_field" | "modify_field" | "add_relation" | "remove_relation";
  entity: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relations?: RelationDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  nullable: boolean;
  default?: unknown;
  primaryKey?: boolean;
  unique?: boolean;
}

export interface RelationDefinition {
  name: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  targetEntity: string;
  foreignKey?: string;
}

export interface SchemaSnapshot {
  version: number;
  entities: EntityDefinition[];
  createdAt: number;
}

class SchemaEvolutionService {
  async createMigration(
    projectId: string,
    name: string,
    changes: SchemaChange[],
    description?: string
  ): Promise<string> {
    const id = uuidv4();
    const now = Date.now();

    const latestMigration = await this.getLatestMigration(projectId);
    const version = (latestMigration?.version || 0) + 1;

    const migrationSql = this.generateMigrationSql(changes);

    await getDb().insert(schemaMigrations).values({
      id,
      projectId,
      version,
      name,
      description: description || null,
      changes,
      migrationSql,
      status: "pending",
      createdAt: now,
    });

    logger.info("Migration created", { projectId, version, name });
    return id;
  }

  async getLatestMigration(projectId: string): Promise<typeof schemaMigrations.$inferSelect | null> {
    const result = await getDb()
      .select()
      .from(schemaMigrations)
      .where(eq(schemaMigrations.projectId, projectId))
      .orderBy(desc(schemaMigrations.version))
      .limit(1);
    return result[0] || null;
  }

  async getMigrationHistory(
    projectId: string,
    options?: { status?: string; limit?: number }
  ): Promise<Array<typeof schemaMigrations.$inferSelect>> {
    let query = getDb()
      .select()
      .from(schemaMigrations)
      .where(eq(schemaMigrations.projectId, projectId))
      .orderBy(desc(schemaMigrations.version));

    const results = await query;
    
    let filtered = results;
    if (options?.status) {
      filtered = results.filter(m => m.status === options.status);
    }
    
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  async getMigration(migrationId: string): Promise<typeof schemaMigrations.$inferSelect | null> {
    const result = await getDb()
      .select()
      .from(schemaMigrations)
      .where(eq(schemaMigrations.id, migrationId));
    return result[0] || null;
  }

  async applyMigration(migrationId: string): Promise<{ success: boolean; error?: string }> {
    const migration = await this.getMigration(migrationId);
    if (!migration) {
      return { success: false, error: "Migration not found" };
    }

    if (migration.status === "applied") {
      return { success: false, error: "Migration already applied" };
    }

    try {
      await getDb().update(schemaMigrations).set({
        status: "applied",
        appliedAt: Date.now(),
      }).where(eq(schemaMigrations.id, migrationId));

      logger.info("Migration applied", { migrationId, version: migration.version });
      return { success: true };
    } catch (error) {
      await getDb().update(schemaMigrations).set({
        status: "failed",
      }).where(eq(schemaMigrations.id, migrationId));

      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  async rollbackMigration(migrationId: string): Promise<{ success: boolean; error?: string }> {
    const migration = await this.getMigration(migrationId);
    if (!migration) {
      return { success: false, error: "Migration not found" };
    }

    if (migration.status !== "applied") {
      return { success: false, error: "Migration is not applied" };
    }

    try {
      await getDb().update(schemaMigrations).set({
        status: "rolled_back",
        rolledBackAt: Date.now(),
      }).where(eq(schemaMigrations.id, migrationId));

      logger.info("Migration rolled back", { migrationId, version: migration.version });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  async detectChanges(
    projectId: string,
    newSchema: EntityDefinition[]
  ): Promise<SchemaChange[]> {
    const changes: SchemaChange[] = [];
    const currentSchema = await this.getCurrentSchema(projectId);

    const currentEntityMap = new Map(currentSchema.map(e => [e.name, e]));
    const newEntityMap = new Map(newSchema.map(e => [e.name, e]));

    for (const newEntity of newSchema) {
      const currentEntity = currentEntityMap.get(newEntity.name);
      
      if (!currentEntity) {
        changes.push({
          type: "add_entity",
          entity: newEntity.name,
          after: newEntity,
        });
        continue;
      }

      const currentFieldMap = new Map(currentEntity.fields.map(f => [f.name, f]));
      const newFieldMap = new Map(newEntity.fields.map(f => [f.name, f]));

      for (const newField of newEntity.fields) {
        const currentField = currentFieldMap.get(newField.name);
        
        if (!currentField) {
          changes.push({
            type: "add_field",
            entity: newEntity.name,
            field: newField.name,
            after: newField,
          });
        } else if (JSON.stringify(currentField) !== JSON.stringify(newField)) {
          changes.push({
            type: "modify_field",
            entity: newEntity.name,
            field: newField.name,
            before: currentField,
            after: newField,
          });
        }
      }

      for (const currentField of currentEntity.fields) {
        if (!newFieldMap.has(currentField.name)) {
          changes.push({
            type: "remove_field",
            entity: newEntity.name,
            field: currentField.name,
            before: currentField,
          });
        }
      }

      const currentRelations = currentEntity.relations || [];
      const newRelations = newEntity.relations || [];
      const currentRelMap = new Map(currentRelations.map(r => [r.name, r]));
      const newRelMap = new Map(newRelations.map(r => [r.name, r]));

      for (const newRel of newRelations) {
        if (!currentRelMap.has(newRel.name)) {
          changes.push({
            type: "add_relation",
            entity: newEntity.name,
            field: newRel.name,
            after: newRel,
          });
        }
      }

      for (const currentRel of currentRelations) {
        if (!newRelMap.has(currentRel.name)) {
          changes.push({
            type: "remove_relation",
            entity: newEntity.name,
            field: currentRel.name,
            before: currentRel,
          });
        }
      }
    }

    for (const currentEntity of currentSchema) {
      if (!newEntityMap.has(currentEntity.name)) {
        changes.push({
          type: "remove_entity",
          entity: currentEntity.name,
          before: currentEntity,
        });
      }
    }

    return changes;
  }

  async getCurrentSchema(projectId: string): Promise<EntityDefinition[]> {
    const schemaFile = await getDb()
      .select()
      .from(projectFiles)
      .where(and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.path, "shared/schema.ts")
      ));

    if (!schemaFile[0]) {
      return [];
    }

    return this.parseSchemaFromCode(schemaFile[0].content);
  }

  parseSchemaFromCode(content: string): EntityDefinition[] {
    const entities: EntityDefinition[] = [];
    
    const tableRegex = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const constName = match[1];
      const tableName = match[2];
      const fieldsBlock = match[3];
      
      const fields = this.parseFields(fieldsBlock);
      
      entities.push({
        name: tableName,
        fields,
      });
    }

    return entities;
  }

  private parseFields(fieldsBlock: string): FieldDefinition[] {
    const fields: FieldDefinition[] = [];
    
    const fieldRegex = /(\w+)\s*:\s*(\w+)\s*\(\s*["']([^"']+)["']/g;
    
    let match;
    while ((match = fieldRegex.exec(fieldsBlock)) !== null) {
      const fieldName = match[1];
      const fieldType = match[2];
      const dbName = match[3];
      
      const fieldLine = fieldsBlock.substring(match.index, fieldsBlock.indexOf(",", match.index + match[0].length) + 1);
      
      fields.push({
        name: fieldName,
        type: fieldType,
        nullable: !fieldLine.includes(".notNull()"),
        primaryKey: fieldLine.includes(".primaryKey()"),
        unique: fieldLine.includes(".unique()"),
        default: fieldLine.includes(".default(") ? this.extractDefault(fieldLine) : undefined,
      });
    }

    return fields;
  }

  private extractDefault(fieldLine: string): unknown {
    const defaultMatch = fieldLine.match(/\.default\s*\(\s*([^)]+)\s*\)/);
    if (!defaultMatch) return undefined;
    
    const defaultValue = defaultMatch[1].trim();
    
    if (defaultValue === "true") return true;
    if (defaultValue === "false") return false;
    if (defaultValue.match(/^-?\d+$/)) return parseInt(defaultValue, 10);
    if (defaultValue.match(/^-?\d+\.\d+$/)) return parseFloat(defaultValue);
    if (defaultValue.startsWith('"') || defaultValue.startsWith("'")) {
      return defaultValue.slice(1, -1);
    }
    
    return defaultValue;
  }

  generateMigrationSql(changes: SchemaChange[]): string {
    const statements: string[] = [];

    for (const change of changes) {
      switch (change.type) {
        case "add_entity":
          const entity = change.after as EntityDefinition;
          const fieldDefs = entity.fields.map(f => {
            let def = `"${f.name}" ${this.mapTypeToSql(f.type)}`;
            if (f.primaryKey) def += " PRIMARY KEY";
            if (!f.nullable) def += " NOT NULL";
            if (f.unique) def += " UNIQUE";
            if (f.default !== undefined) def += ` DEFAULT ${this.formatDefault(f.default)}`;
            return def;
          });
          statements.push(`CREATE TABLE "${change.entity}" (\n  ${fieldDefs.join(",\n  ")}\n);`);
          break;

        case "remove_entity":
          statements.push(`DROP TABLE IF EXISTS "${change.entity}";`);
          break;

        case "add_field":
          const newField = change.after as FieldDefinition;
          let addDef = `ALTER TABLE "${change.entity}" ADD COLUMN "${change.field}" ${this.mapTypeToSql(newField.type)}`;
          if (!newField.nullable) addDef += " NOT NULL";
          if (newField.unique) addDef += " UNIQUE";
          if (newField.default !== undefined) addDef += ` DEFAULT ${this.formatDefault(newField.default)}`;
          statements.push(addDef + ";");
          break;

        case "remove_field":
          statements.push(`ALTER TABLE "${change.entity}" DROP COLUMN IF EXISTS "${change.field}";`);
          break;

        case "modify_field":
          const afterField = change.after as FieldDefinition;
          statements.push(`ALTER TABLE "${change.entity}" ALTER COLUMN "${change.field}" TYPE ${this.mapTypeToSql(afterField.type)};`);
          if (afterField.nullable) {
            statements.push(`ALTER TABLE "${change.entity}" ALTER COLUMN "${change.field}" DROP NOT NULL;`);
          } else {
            statements.push(`ALTER TABLE "${change.entity}" ALTER COLUMN "${change.field}" SET NOT NULL;`);
          }
          break;

        case "add_relation":
          const rel = change.after as RelationDefinition;
          if (rel.foreignKey) {
            statements.push(`ALTER TABLE "${change.entity}" ADD CONSTRAINT "fk_${change.entity}_${rel.name}" FOREIGN KEY ("${rel.foreignKey}") REFERENCES "${rel.targetEntity}"("id");`);
          }
          break;

        case "remove_relation":
          statements.push(`ALTER TABLE "${change.entity}" DROP CONSTRAINT IF EXISTS "fk_${change.entity}_${change.field}";`);
          break;
      }
    }

    return statements.join("\n\n");
  }

  generateRollbackSql(changes: SchemaChange[]): string {
    const inverseChanges: SchemaChange[] = [];

    for (const change of [...changes].reverse()) {
      switch (change.type) {
        case "add_entity":
          inverseChanges.push({
            type: "remove_entity",
            entity: change.entity,
            before: change.after,
          });
          break;

        case "remove_entity":
          inverseChanges.push({
            type: "add_entity",
            entity: change.entity,
            after: change.before,
          });
          break;

        case "add_field":
          inverseChanges.push({
            type: "remove_field",
            entity: change.entity,
            field: change.field,
            before: change.after,
          });
          break;

        case "remove_field":
          inverseChanges.push({
            type: "add_field",
            entity: change.entity,
            field: change.field,
            after: change.before,
          });
          break;

        case "modify_field":
          inverseChanges.push({
            type: "modify_field",
            entity: change.entity,
            field: change.field,
            before: change.after,
            after: change.before,
          });
          break;

        case "add_relation":
          inverseChanges.push({
            type: "remove_relation",
            entity: change.entity,
            field: change.field,
            before: change.after,
          });
          break;

        case "remove_relation":
          inverseChanges.push({
            type: "add_relation",
            entity: change.entity,
            field: change.field,
            after: change.before,
          });
          break;
      }
    }

    return this.generateMigrationSql(inverseChanges);
  }

  private mapTypeToSql(type: string): string {
    const typeMap: Record<string, string> = {
      varchar: "VARCHAR",
      text: "TEXT",
      integer: "INTEGER",
      bigint: "BIGINT",
      serial: "SERIAL",
      boolean: "BOOLEAN",
      timestamp: "TIMESTAMP",
      jsonb: "JSONB",
      json: "JSON",
      real: "REAL",
      doublePrecision: "DOUBLE PRECISION",
      uuid: "UUID",
    };
    return typeMap[type] || "TEXT";
  }

  private formatDefault(value: unknown): string {
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE";
    }
    if (value === null) {
      return "NULL";
    }
    return String(value);
  }

  async getSchemaVersionInfo(projectId: string): Promise<{
    currentVersion: number;
    totalMigrations: number;
    appliedMigrations: number;
    pendingMigrations: number;
    lastAppliedAt?: number;
  }> {
    const history = await this.getMigrationHistory(projectId);
    
    const applied = history.filter(m => m.status === "applied");
    const pending = history.filter(m => m.status === "pending");
    
    const lastApplied = applied[0];
    
    return {
      currentVersion: lastApplied?.version || 0,
      totalMigrations: history.length,
      appliedMigrations: applied.length,
      pendingMigrations: pending.length,
      lastAppliedAt: lastApplied?.appliedAt || undefined,
    };
  }

  async createSnapshot(projectId: string): Promise<SchemaSnapshot> {
    const entities = await this.getCurrentSchema(projectId);
    const versionInfo = await this.getSchemaVersionInfo(projectId);
    
    return {
      version: versionInfo.currentVersion,
      entities,
      createdAt: Date.now(),
    };
  }
}

export const schemaEvolutionService = new SchemaEvolutionService();
