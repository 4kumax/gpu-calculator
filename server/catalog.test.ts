import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { newDb } from "pg-mem";
import { cloneDefaultConfig } from "../lib/config";
import {
  authenticateToken,
  catalogEnvironment,
  CatalogEnvironment,
  createSessionCookie,
  isSameOriginMutation,
  readSession,
  SESSION_COOKIE,
} from "./catalog-auth";
import { createCatalogHandlers } from "./catalog-http";
import { CatalogStore, RevisionConflict } from "./catalog-store";

const ENV: CatalogEnvironment = {
  databaseUrl: "postgres://test.invalid/catalog_test",
  editorToken: "editor-".repeat(8),
  viewerToken: "viewer-".repeat(8),
  secret: "secret-".repeat(8),
  editorName: "Команда каталога",
  viewerName: "Читатель",
  ttlSeconds: 3600,
  secure: true,
  allowedOrigin: "https://gpu.example.test",
};

function request(
  path = "/api/catalog",
  options: {
    method?: string;
    role?: "editor" | "viewer";
    body?: unknown;
    origin?: string | null;
    cookie?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (options.origin !== null)
    headers.set("origin", options.origin ?? "https://gpu.example.test");
  if (options.body !== undefined)
    headers.set("content-type", "application/json");
  if (options.cookie || options.role)
    headers.set(
      "cookie",
      options.cookie ?? createSessionCookie(options.role!, ENV).split(";")[0],
    );
  return new Request(`https://gpu.example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function memoryStore() {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  // pg-mem validates SQL CRUD but does not implement PG triggers, advisory locks or real transactions.
  return { pool, store: new CatalogStore(pool, { postgresGuards: false }) };
}

test("shared configuration fails closed, while an absent database selects local mode", () => {
  assert.equal(catalogEnvironment({}), null);
  assert.throws(() => catalogEnvironment({ DATABASE_URL: ENV.databaseUrl }));
  const complete = {
    DATABASE_URL: ENV.databaseUrl,
    CATALOG_EDITOR_TOKEN: ENV.editorToken,
    CATALOG_VIEWER_TOKEN: ENV.viewerToken,
    CATALOG_SESSION_SECRET: ENV.secret,
  };
  assert.equal(catalogEnvironment(complete)?.ttlSeconds, 28_800);
  assert.throws(() =>
    catalogEnvironment({ ...complete, CATALOG_VIEWER_TOKEN: ENV.editorToken }),
  );
  assert.throws(() =>
    catalogEnvironment({
      ...complete,
      CATALOG_SESSION_TTL_SECONDS: "Infinity",
    }),
  );
  assert.throws(() =>
    catalogEnvironment({
      ...complete,
      CATALOG_ALLOWED_ORIGIN: "https://gpu.example.test/path",
    }),
  );
});

test("role tokens, signed cookie expiry, tampering and credential rotation", () => {
  assert.equal(authenticateToken(ENV.editorToken, ENV), "editor");
  assert.equal(authenticateToken(ENV.viewerToken, ENV), "viewer");
  assert.equal(authenticateToken("wrong", ENV), null);
  assert.equal(authenticateToken({ token: ENV.editorToken }, ENV), null);
  const now = Date.parse("2026-09-06T12:00:00Z");
  const cookie = createSessionCookie("editor", ENV, now);
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=3600; Secure$/);
  const req = request("/api/catalog", { cookie });
  assert.deepEqual(readSession(req, ENV, now), {
    role: "editor",
    actor: ENV.editorName,
  });
  assert.equal(readSession(req, ENV, now + 3600_000), null);
  assert.equal(readSession(req, ENV, now - 60_000), null);
  assert.equal(
    readSession(req, { ...ENV, secret: "new-secret".repeat(8) }, now),
    null,
  );
  assert.equal(
    readSession(req, { ...ENV, editorToken: "new-editor".repeat(8) }, now),
    null,
  );
  const [encoded, signature] = cookie
    .split(";")[0]
    .slice(SESSION_COOKIE.length + 1)
    .split(".");
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString(),
  ) as Record<string, unknown>;
  payload.role = "viewer";
  const forged = `${SESSION_COOKIE}=${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  assert.equal(readSession(request("/", { cookie: forged }), ENV, now), null);
});

test("same-origin mutations reject missing, cross-site and suffix-confusion origins", () => {
  assert.equal(isSameOriginMutation(request(), ENV), true);
  assert.equal(
    isSameOriginMutation(request("/", { origin: null }), ENV),
    false,
  );
  assert.equal(
    isSameOriginMutation(
      request("/", { origin: "https://gpu.example.test.attacker.test" }),
      ENV,
    ),
    false,
  );
  assert.equal(
    isSameOriginMutation(request("/", { origin: "null" }), ENV),
    false,
  );
  const req = request();
  req.headers.set("sec-fetch-site", "cross-site");
  assert.equal(isSameOriginMutation(req, ENV), false);
});

test("API never touches shared data for unauthenticated clients and enforces viewer/editor roles", async () => {
  let touches = 0;
  const blockedStore = () => {
    touches += 1;
    throw new Error("Must not access database");
  };
  const local = createCatalogHandlers({
    environment: () => null,
    store: blockedStore,
  });
  assert.deepEqual(await (await local.get(request())).json(), {
    configured: false,
    authenticated: false,
    role: null,
  });
  const api = createCatalogHandlers({
    environment: () => ENV,
    store: blockedStore,
  });
  assert.deepEqual(await (await api.get(request())).json(), {
    configured: true,
    authenticated: false,
    role: null,
  });
  assert.equal((await api.history(request())).status, 401);
  assert.equal((await api.snapshot(request(), "1")).status, 401);
  assert.equal(
    (await api.put(request("/", { method: "PUT", body: {}, role: "viewer" })))
      .status,
    403,
  );
  assert.equal(
    (await api.put(request("/", { method: "PUT", body: {} }))).status,
    401,
  );
  assert.equal(
    (
      await api.put(
        request("/", {
          method: "PUT",
          body: {},
          role: "editor",
          origin: "https://attacker.test",
        }),
      )
    ).status,
    403,
  );
  assert.equal(touches, 0);
});

test("login/logout use only HttpOnly cookies and mutation origin checks", async () => {
  const api = createCatalogHandlers({
    environment: () => ENV,
    store: () => {
      throw new Error("Unexpected DB access");
    },
  });
  const response = await api.login(
    request("/api/catalog/session", {
      method: "POST",
      body: { token: ENV.viewerToken },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    configured: true,
    authenticated: true,
    role: "viewer",
  });
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (
      await api.login(
        request("/", { method: "POST", body: { token: "wrong" } }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await api.login(
        request("/", {
          method: "POST",
          body: { token: ENV.editorToken },
          origin: null,
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api.logout(
        request("/", { method: "DELETE", origin: "https://attacker.test" }),
      )
    ).status,
    403,
  );
  assert.match(
    (await api.logout(request("/", { method: "DELETE" }))).headers.get(
      "set-cookie",
    )!,
    /Max-Age=0/,
  );
});

test("catalogue API validates unknown input, publishes explicitly and preserves historical snapshots", async () => {
  const { store, pool } = memoryStore();
  try {
    const api = createCatalogHandlers({
      environment: () => ENV,
      store: () => store,
    });
    const initial = await (
      await api.get(request("/", { role: "viewer" }))
    ).json();
    assert.equal(initial.config.revision, 0);
    assert.deepEqual(initial.history, []);
    assert.equal(
      (await pool.query("SELECT * FROM gpu_catalog_current")).rows.length,
      0,
      "reading unpublished defaults must not publish",
    );
    for (const config of [null, [], { schemaVersion: 3 }]) {
      assert.equal(
        (
          await api.put(
            request("/", {
              method: "PUT",
              role: "editor",
              body: { config, expectedRevision: 0 },
            }),
          )
        ).status,
        400,
      );
    }
    const first = await api.put(
      request("/", {
        method: "PUT",
        role: "editor",
        body: {
          config: initial.config,
          expectedRevision: 0,
          message: "Первый каталог",
        },
      }),
    );
    assert.equal(first.status, 200, await first.clone().text());
    const published = (await first.json()).config;
    assert.equal(published.revision, 1);
    const edited = structuredClone(published);
    edited.assumptions.electricityRubKwh += 1;
    const second = await api.put(
      request("/", {
        method: "PUT",
        role: "editor",
        body: { config: edited, expectedRevision: 1, message: "Тариф" },
      }),
    );
    assert.equal(second.status, 200);
    assert.equal((await second.json()).config.revision, 2);
    const conflict = await api.put(
      request("/", {
        method: "PUT",
        role: "editor",
        body: { config: published, expectedRevision: 1 },
      }),
    );
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).revision, 2);
    const history = (
      await (await api.history(request("/", { role: "viewer" }))).json()
    ).history;
    assert.deepEqual(
      history.map((entry: { revision: number }) => entry.revision),
      [2, 1],
    );
    assert.equal(history[0].actor, ENV.editorName);
    assert.equal(history[0].message, "Тариф");
    const snapshot = await api.snapshot(request("/", { role: "viewer" }), "1");
    assert.deepEqual((await snapshot.json()).config, published);
    assert.equal(
      (await api.snapshot(request("/", { role: "viewer" }), "999")).status,
      404,
    );
    assert.equal(
      (await api.snapshot(request("/", { role: "viewer" }), "1 OR 1=1")).status,
      400,
    );
    assert.equal((await store.current()).revision, 2);
    await assert.rejects(
      store.save(
        cloneDefaultConfig(),
        2,
        { role: "viewer", actor: "forged" },
        "",
      ),
      /Editor role/,
    );
  } finally {
    await pool.end();
  }
});

test("malformed/oversized requests are rejected; internal errors never disclose server details", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const api = createCatalogHandlers({
    environment: () => ENV,
    store: () => {
      throw new Error("secret-password@private-host");
    },
  });
  const malformed = request("/", { method: "PUT", role: "editor", body: {} });
  malformed.headers.set("content-length", String(3 * 1024 * 1024));
  assert.equal((await api.put(malformed)).status, 413);
  const nonJson = request("/", { method: "PUT", role: "editor", body: {} });
  nonJson.headers.set("content-type", "text/plain");
  assert.equal((await api.put(nonJson)).status, 415);
  const response = await api.get(request("/", { role: "viewer" }));
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.doesNotMatch(text, /secret-password|private-host/);
  assert.equal(JSON.parse(text).configured, true);
  const badEnv = createCatalogHandlers({
    environment: () => {
      throw new Error("invalid token setup");
    },
    store: () => {
      throw new Error("unused");
    },
  });
  assert.equal((await badEnv.get(request())).status, 503);
});

test(
  "PostgreSQL: concurrent first publish, CAS, transaction rollback and append-only audit",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
        /test/i.test(url.pathname),
      "Integration tests require a local disposable database whose name contains test",
    );
    const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
      connectionString: url.href,
      options: `-c search_path=${schema},public`,
      max: 5,
    });
    try {
      const store = new CatalogStore(pool);
      const defaults = await store.current();
      assert.equal(defaults.revision, 0);
      const actor = { role: "editor" as const, actor: "Integration test" };
      const results = await Promise.allSettled([
        store.save(defaults, 0, actor, "first contender"),
        store.save(defaults, 0, actor, "second contender"),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const rejected = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof RevisionConflict);
      assert.equal((await store.history()).length, 1);
      const before = await store.current();
      await assert.rejects(
        store.save(before, 1, actor, null as unknown as string),
      );
      assert.deepEqual(
        await store.current(),
        before,
        "history failure must roll back the current catalogue update",
      );
      assert.equal((await store.history()).length, 1);
      for (const statement of [
        "UPDATE gpu_catalog_history SET message = 'tampered'",
        "DELETE FROM gpu_catalog_history",
        "TRUNCATE gpu_catalog_history",
      ]) {
        await assert.rejects(pool.query(statement), /append-only/);
      }
      assert.deepEqual((await store.snapshot(1))?.config, before);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
