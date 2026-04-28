/**
 * LanceDB Connection Management
 * 
 * Provides database connection with singleton pattern and configurable paths.
 */

import * as path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";
import type { VectorStoreOptions } from "./types.js";

const DEFAULT_DB_PATH = ".lancedb";
const DEFAULT_MEMORY_TABLE = "memory";
const DEFAULT_SCHEMA_TABLE = "project_schema";

let dbPromise: Promise<Connection> | null = null;
let currentOptions: VectorStoreOptions | null = null;

/**
 * Configure the vector store with options
 */
export function configure(options: VectorStoreOptions = {}): void {
  currentOptions = {
    dbPath: options.dbPath ?? DEFAULT_DB_PATH,
    memoryTable: options.memoryTable ?? DEFAULT_MEMORY_TABLE,
    schemaTable: options.schemaTable ?? DEFAULT_SCHEMA_TABLE,
  };
  // Reset connection to apply new config
  dbPromise = null;
}

/**
 * Get current configuration
 */
export function getConfig(): Required<VectorStoreOptions> {
  if (!currentOptions) {
    configure();
  }
  return currentOptions as Required<VectorStoreOptions>;
}

/**
 * Connect to LanceDB database
 * Uses singleton pattern for connection reuse
 */
export async function connect(): Promise<Connection> {
  const config = getConfig();
  
  if (!dbPromise) {
    const dbDir = path.resolve(process.cwd(), config.dbPath);
    dbPromise = lancedb.connect(dbDir);
  }
  
  return dbPromise;
}

/**
 * Reset the connection (useful for testing)
 */
export function resetConnection(): void {
  dbPromise = null;
  currentOptions = null;
}

/**
 * Get table names from the database
 */
export async function getTableNames(): Promise<string[]> {
  const db = await connect();
  return db.tableNames();
}

/**
 * Check if a table exists
 */
export async function tableExists(tableName: string): Promise<boolean> {
  const names = await getTableNames();
  return names.includes(tableName);
}

/**
 * Open a table by name and return typed table
 */
export async function openTable(tableName: string): Promise<Table> {
  const db = await connect();
  return db.openTable(tableName);
}

// Re-export types
export type { Connection, Table } from "@lancedb/lancedb";
export type { VectorStoreOptions } from "./types.js";