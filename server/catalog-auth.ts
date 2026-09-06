import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type CatalogRole = "viewer" | "editor";
export type CatalogSession = { role: CatalogRole; actor: string };
export type CatalogEnvironment = {
  databaseUrl: string;
  editorToken: string;
  viewerToken: string;
  secret: string;
  editorName: string;
  viewerName: string;
  ttlSeconds: number;
  secure: boolean;
  allowedOrigin?: string;
};

export const SESSION_COOKIE = "gpu_catalog_session";
const digest = (value: string) => createHash("sha256").update(value).digest();
const equal = (left: string, right: string) =>
  timingSafeEqual(digest(left), digest(right));

/** Missing database is intentional local mode; incomplete shared mode fails closed. */
export function catalogEnvironment(
  env: Record<string, string | undefined> = process.env,
): CatalogEnvironment | null {
  if (!env.DATABASE_URL?.trim()) return null;
  const editorToken = env.CATALOG_EDITOR_TOKEN ?? "";
  const viewerToken = env.CATALOG_VIEWER_TOKEN ?? "";
  const secret = env.CATALOG_SESSION_SECRET ?? "";
  const ttlSeconds = Number(env.CATALOG_SESSION_TTL_SECONDS ?? 28_800);
  if (
    [editorToken, viewerToken, secret].some(
      (value) => Buffer.byteLength(value) < 32,
    ) ||
    equal(editorToken, viewerToken) ||
    equal(secret, editorToken) ||
    equal(secret, viewerToken)
  ) {
    throw new Error("Invalid catalogue authentication configuration");
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86_400)
    throw new Error("Invalid session lifetime");
  let allowedOrigin: string | undefined;
  if (env.CATALOG_ALLOWED_ORIGIN) {
    const url = new URL(env.CATALOG_ALLOWED_ORIGIN);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error("Invalid catalogue origin");
    }
    allowedOrigin = url.origin;
  }
  return {
    databaseUrl: env.DATABASE_URL,
    editorToken,
    viewerToken,
    secret,
    ttlSeconds,
    allowedOrigin,
    editorName: (env.CATALOG_EDITOR_NAME || "Редактор").slice(0, 120),
    viewerName: (env.CATALOG_VIEWER_NAME || "Читатель").slice(0, 120),
    secure: env.NODE_ENV === "production",
  };
}

export function authenticateToken(
  token: unknown,
  env: CatalogEnvironment,
): CatalogRole | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  // Always compare both credentials using fixed-length hashes.
  const editor = equal(token, env.editorToken);
  const viewer = equal(token, env.viewerToken);
  return editor ? "editor" : viewer ? "viewer" : null;
}

const credentialFingerprint = (role: CatalogRole, env: CatalogEnvironment) =>
  createHmac("sha256", env.secret)
    .update(role === "editor" ? env.editorToken : env.viewerToken)
    .digest("base64url");

export function createSessionCookie(
  role: CatalogRole,
  env: CatalogEnvironment,
  now = Date.now(),
): string {
  const issued = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      role,
      iat: issued,
      exp: issued + env.ttlSeconds,
      credential: credentialFingerprint(role, env),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", env.secret)
    .update(payload)
    .digest("base64url");
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${env.ttlSeconds}${env.secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(env: CatalogEnvironment): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${env.secure ? "; Secure" : ""}`;
}

export function readSession(
  request: Request,
  env: CatalogEnvironment,
  now = Date.now(),
): CatalogSession | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!cookie || cookie.length > 2048) return null;
  const pieces = cookie.split(".");
  if (
    pieces.length !== 2 ||
    pieces.some((piece) => !/^[A-Za-z0-9_-]+$/.test(piece))
  )
    return null;
  const [payload, signature] = pieces;
  const expected = createHmac("sha256", env.secret)
    .update(payload)
    .digest("base64url");
  if (!equal(signature, expected)) return null;
  try {
    const data: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!data || typeof data !== "object") return null;
    const value = data as Record<string, unknown>;
    const seconds = Math.floor(now / 1000);
    if (
      value.v !== 1 ||
      (value.role !== "viewer" && value.role !== "editor") ||
      typeof value.iat !== "number" ||
      typeof value.exp !== "number" ||
      !Number.isSafeInteger(value.iat) ||
      !Number.isSafeInteger(value.exp) ||
      value.iat > seconds + 30 ||
      value.exp <= seconds ||
      value.exp <= value.iat ||
      value.exp - value.iat > env.ttlSeconds ||
      typeof value.credential !== "string" ||
      !equal(value.credential, credentialFingerprint(value.role, env))
    )
      return null;
    return {
      role: value.role,
      actor: value.role === "editor" ? env.editorName : env.viewerName,
    };
  } catch {
    return null;
  }
}

export function isSameOriginMutation(
  request: Request,
  env: CatalogEnvironment,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  try {
    return origin === (env.allowedOrigin ?? new URL(request.url).origin);
  } catch {
    return false;
  }
}
