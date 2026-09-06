import { Pool } from "pg";
import { AppConfig, cloneDefaultConfig, parseConfig } from "../lib/config";
import { CatalogSession } from "./catalog-auth";

export type CatalogHistoryEntry = {
  revision: number;
  updatedAt: string;
  actor: string;
  role: "editor";
  message: string;
};
export type CatalogSnapshot = CatalogHistoryEntry & { config: AppConfig };
export class RevisionConflict extends Error {
  constructor(public readonly revision: number) {
    super("Catalogue revision conflict");
  }
}

export function unpublishedConfig(): AppConfig {
  return { ...cloneDefaultConfig(), revision: 0 };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS gpu_catalog_current (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL CHECK (revision >= 0),
    config JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gpu_catalog_history (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    updated_at TIMESTAMPTZ NOT NULL,
    actor TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role = 'editor'),
    message TEXT NOT NULL,
    config JSONB NOT NULL
  )`,
];

/** PostgreSQL enforces append-only history even if application code later regresses. */
const IMMUTABLE_AUDIT_SCHEMA = [
  `CREATE OR REPLACE FUNCTION gpu_catalog_reject_audit_mutation() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Catalogue history is append-only'; END;
  $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS gpu_catalog_history_immutable ON gpu_catalog_history`,
  `CREATE TRIGGER gpu_catalog_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
    ON gpu_catalog_history FOR EACH STATEMENT EXECUTE FUNCTION gpu_catalog_reject_audit_mutation()`,
];

function checkedConfig(value: unknown): AppConfig {
  const parsed = parseConfig(value);
  if (!parsed.config || parsed.errors.length)
    throw new Error("Stored catalogue is invalid");
  return parsed.config;
}

function summary(row: Record<string, unknown>): CatalogHistoryEntry {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("Invalid stored revision");
  return {
    revision,
    updatedAt: new Date(row.updated_at as string).toISOString(),
    actor: String(row.actor),
    role: "editor",
    message: String(row.message),
  };
}

export class CatalogStore {
  private schemaReady: Promise<void> | undefined;
  constructor(
    private readonly pool: Pool,
    private readonly options: { postgresGuards?: boolean } = {},
  ) {}

  private initialize(): Promise<void> {
    if (!this.schemaReady)
      this.schemaReady = this.createSchema().catch((error) => {
        this.schemaReady = undefined;
        throw error;
      });
    return this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes first initialization across Next workers and server replicas.
      if (this.options.postgresGuards !== false)
        await client.query("SELECT pg_advisory_xact_lock(734827916)");
      for (const statement of SCHEMA) await client.query(statement);
      if (this.options.postgresGuards !== false)
        for (const statement of IMMUTABLE_AUDIT_SCHEMA)
          await client.query(statement);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async current(): Promise<AppConfig> {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT config FROM gpu_catalog_current WHERE id = 1",
    );
    return result.rows.length
      ? checkedConfig(result.rows[0].config)
      : unpublishedConfig();
  }

  async history(): Promise<CatalogHistoryEntry[]> {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT revision, updated_at, actor, role, message FROM gpu_catalog_history ORDER BY revision DESC LIMIT 100",
    );
    return result.rows.map(summary);
  }

  async snapshot(revision: number): Promise<CatalogSnapshot | null> {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT revision, updated_at, actor, role, message, config FROM gpu_catalog_history WHERE revision = $1",
      [revision],
    );
    return result.rows.length
      ? {
          ...summary(result.rows[0]),
          config: checkedConfig(result.rows[0].config),
        }
      : null;
  }

  async save(
    config: AppConfig,
    expectedRevision: number,
    actor: CatalogSession,
    message: string,
  ): Promise<AppConfig> {
    if (actor.role !== "editor") throw new Error("Editor role required");
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision >= Number.MAX_SAFE_INTEGER
    )
      throw new Error("Invalid expected revision");
    const validConfig = checkedConfig(config);
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Concurrent first publishers serialize on this singleton key before the row lock.
      await client.query(
        "INSERT INTO gpu_catalog_current (id, revision, config) VALUES (1, 0, $1::jsonb) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(unpublishedConfig())],
      );
      const current = await client.query(
        "SELECT revision FROM gpu_catalog_current WHERE id = 1 FOR UPDATE",
      );
      const revision = Number(current.rows[0].revision);
      if (revision !== expectedRevision) throw new RevisionConflict(revision);
      const next = {
        ...validConfig,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      };
      const updated = await client.query(
        "UPDATE gpu_catalog_current SET revision = $1, config = $2::jsonb WHERE id = 1 AND revision = $3 RETURNING revision",
        [next.revision, JSON.stringify(next), expectedRevision],
      );
      if (!updated.rows.length) throw new RevisionConflict(revision);
      await client.query(
        "INSERT INTO gpu_catalog_history (revision, updated_at, actor, role, message, config) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
        [
          next.revision,
          next.updatedAt,
          actor.actor,
          actor.role,
          message,
          JSON.stringify(next),
        ],
      );
      await client.query("COMMIT");
      return next;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Reuse connections across dev module reloads and warm requests. Never exposed to clients.
const shared = globalThis as typeof globalThis & {
  gpuCatalogStore?: { url: string; store: CatalogStore };
};
export function catalogStore(databaseUrl: string): CatalogStore {
  if (!shared.gpuCatalogStore || shared.gpuCatalogStore.url !== databaseUrl) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
    });
    pool.on("error", () => {
      console.error("Catalogue database connection became unavailable");
    });
    shared.gpuCatalogStore = {
      url: databaseUrl,
      store: new CatalogStore(pool),
    };
  }
  return shared.gpuCatalogStore.store;
}
