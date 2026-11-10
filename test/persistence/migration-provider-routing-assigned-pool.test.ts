import { expect, test } from "bun:test";
import { dbDescribe, getTestPool } from "../helpers/database";

const MIGRATION_FILE = "0038_provider_routing_assigned_pool_id.sql";

dbDescribe("migration: provider routing assigned pool", () => {
  test("adds the nullable pool reference and records the migration", async () => {
    const pool = await getTestPool();
    const client = await pool.connect();
    try {
      const column = await client.query(
        `select column_name, data_type, is_nullable
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'provider_routing_settings'
            and column_name = 'assigned_pool_id'`,
      );
      expect(column.rows).toEqual([
        { column_name: "assigned_pool_id", data_type: "uuid", is_nullable: "YES" },
      ]);

      const foreignKey = await client.query(
        `select c.confrelid::regclass::text as referenced_table, c.confdeltype
           from pg_constraint c
           join pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
          where c.conrelid = 'provider_routing_settings'::regclass
            and c.contype = 'f'
            and a.attname = 'assigned_pool_id'`,
      );
      expect(foreignKey.rows).toEqual([
        { referenced_table: "network_pools", confdeltype: "n" },
      ]);

      const recorded = await client.query(
        "select migration_id from cartethyia_schema_migrations where migration_id = $1",
        [MIGRATION_FILE],
      );
      expect(recorded.rows).toEqual([{ migration_id: MIGRATION_FILE }]);
    } finally {
      client.release();
    }
  });
});
