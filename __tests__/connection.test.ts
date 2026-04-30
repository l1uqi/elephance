/**
 * Connection Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { configure, connect, resetConnection, getTableNames, tableExists, getConfig } from "../packages/core/src/connection.js";

const TEST_DB_DIR = ".lancedb-test";

describe("Connection Module", () => {
  beforeEach(() => {
    configure({ dbPath: TEST_DB_DIR });
  });

  afterEach(async () => {
    resetConnection();
    // Clean up test database
    try {
      await fs.rm(path.resolve(process.cwd(), TEST_DB_DIR), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("configure", () => {
    it("should set custom dbPath", () => {
      configure({ dbPath: "./custom-path" });
      const config = getConfig();
      expect(config.dbPath).toBe("./custom-path");
    });

    it("should use default values when not provided", () => {
      configure({});
      const config = getConfig();
      expect(config.dbPath).toBe(".lancedb");
      expect(config.memoryTable).toBe("memory");
      expect(config.schemaTable).toBe("project_schema");
      expect(config.ruleTable).toBe("rule_memory");
    });

    it("should allow custom table names", () => {
      configure({ 
        memoryTable: "my_memory",
        schemaTable: "my_schema",
        ruleTable: "my_rules"
      });
      const config = getConfig();
      expect(config.memoryTable).toBe("my_memory");
      expect(config.schemaTable).toBe("my_schema");
      expect(config.ruleTable).toBe("my_rules");
    });
  });

  describe("getConfig", () => {
    it("should return current configuration", () => {
      configure({ dbPath: "./test" });
      const config = getConfig();
      expect(config.dbPath).toBe("./test");
    });

    it("should auto-configure if not called", () => {
      resetConnection();
      const config = getConfig();
      expect(config.dbPath).toBeDefined();
    });
  });

  describe("connect", () => {
    it("should create connection to database", async () => {
      const conn = await connect();
      expect(conn).toBeDefined();
    });

    it("should return same connection on multiple calls", async () => {
      const conn1 = await connect();
      const conn2 = await connect();
      expect(conn1).toBe(conn2);
    });
  });

  describe("tableExists", () => {
    it("should return false for non-existent table", async () => {
      const exists = await tableExists("nonexistent_table");
      expect(exists).toBe(false);
    });
  });

  describe("resetConnection", () => {
    it("should clear current connection", async () => {
      await connect();
      resetConnection();
      // After reset, should create new connection
      const conn = await connect();
      expect(conn).toBeDefined();
    });
  });
});
