import { Router } from "express";
import { db as dbInstance } from "../db";
import { sql } from "drizzle-orm";
import logger from "../lib/logger";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized");
  }
  return dbInstance;
}

const router = Router();

router.get("/tables", async (req, res) => {
  try {
    const result = await getDb().execute(sql`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND columns.table_name = tables.table_name) as column_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    res.json({ tables: result.rows });
  } catch (error) {
    logger.error("Failed to fetch tables", { error });
    res.status(500).json({ error: "Failed to fetch tables" });
  }
});

router.get("/tables/:tableName/schema", async (req, res) => {
  try {
    const { tableName } = req.params;
    
    const columns = await getDb().execute(sql`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
      ORDER BY ordinal_position
    `);

    const constraints = await getDb().execute(sql`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public' 
      AND tc.table_name = ${tableName}
    `);

    const indexes = await getDb().execute(sql`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = ${tableName}
    `);

    res.json({
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
    });
  } catch (error) {
    logger.error("Failed to fetch table schema", { error, tableName: req.params.tableName });
    res.status(500).json({ error: "Failed to fetch table schema" });
  }
});

router.get("/tables/:tableName/data", async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = "50", offset = "0", orderBy, orderDir = "asc" } = req.query;

    const validTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
    
    let query = `SELECT * FROM "${validTableName}"`;
    
    if (orderBy && typeof orderBy === "string") {
      const validOrderBy = orderBy.replace(/[^a-zA-Z0-9_]/g, "");
      const validDir = orderDir === "desc" ? "DESC" : "ASC";
      query += ` ORDER BY "${validOrderBy}" ${validDir}`;
    }
    
    query += ` LIMIT ${parseInt(limit as string, 10)} OFFSET ${parseInt(offset as string, 10)}`;

    const countResult = await getDb().execute(sql.raw(`SELECT COUNT(*) as count FROM "${validTableName}"`));
    const dataResult = await getDb().execute(sql.raw(query));

    res.json({
      data: dataResult.rows,
      total: parseInt(String((countResult.rows[0] as any)?.count || 0), 10),
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    logger.error("Failed to fetch table data", { error, tableName: req.params.tableName });
    res.status(500).json({ error: "Failed to fetch table data" });
  }
});

router.post("/query", async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    if (query.length > 5000) {
      return res.status(400).json({ error: "Query too long (max 5000 characters)" });
    }

    const trimmedQuery = query.trim().toUpperCase();
    const isReadOnly = trimmedQuery.startsWith("SELECT") || 
                       trimmedQuery.startsWith("EXPLAIN") ||
                       trimmedQuery.startsWith("WITH");

    if (!isReadOnly) {
      return res.status(403).json({ 
        error: "Only read-only queries (SELECT, EXPLAIN, WITH) are allowed through this endpoint" 
      });
    }

    const dangerousPatterns = [
      /pg_sleep/i,
      /information_schema\.tables\s+cross\s+join/i,
      /generate_series.*,\s*generate_series/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return res.status(403).json({ 
          error: "Query contains potentially expensive operations" 
        });
      }
    }

    const statementCount = query.split(";").filter(s => s.trim().length > 0).length;
    if (statementCount > 1) {
      return res.status(403).json({ 
        error: "Only single-statement queries are allowed" 
      });
    }

    let safeQuery = query.replace(/;?\s*$/, "");
    if (!trimmedQuery.includes("LIMIT")) {
      safeQuery = `${safeQuery} LIMIT 1000`;
    }

    const startTime = Date.now();
    
    // Set statement timeout and execute query
    await getDb().execute(sql`SET LOCAL statement_timeout = '10s'`);
    const result = await getDb().execute(sql.raw(safeQuery));
    const duration = Date.now() - startTime;

    // Handle both array and object results from Drizzle
    const rows = Array.isArray(result) ? result : (result.rows || []);

    res.json({
      rows,
      rowCount: rows.length,
      duration,
    });
  } catch (error) {
    logger.error("Query execution failed", { error });
    res.status(400).json({ 
      error: error instanceof Error ? error.message : "Query execution failed" 
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const tableStats = await getDb().execute(sql`
      SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
    `);

    const dbSize = await getDb().execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

    const tableCount = await getDb().execute(sql`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);

    res.json({
      tables: tableStats.rows,
      databaseSize: (dbSize.rows[0] as any)?.size || "Unknown",
      tableCount: parseInt(String((tableCount.rows[0] as any)?.count || 0), 10),
    });
  } catch (error) {
    logger.error("Failed to fetch database stats", { error });
    res.status(500).json({ error: "Failed to fetch database stats" });
  }
});

export default router;
