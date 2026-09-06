import { parseConfig } from "../lib/config";
import {
  authenticateToken,
  catalogEnvironment,
  CatalogEnvironment,
  clearSessionCookie,
  createSessionCookie,
  isSameOriginMutation,
  readSession,
} from "./catalog-auth";
import { CatalogStore, catalogStore, RevisionConflict } from "./catalog-store";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
type Dependencies = {
  environment: () => CatalogEnvironment | null;
  store: (url: string) => CatalogStore;
};
class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(
  value: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new HttpError(415, "JSON_REQUIRED", "Ожидается JSON.");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new HttpError(
      413,
      "BODY_TOO_LARGE",
      "Размер запроса превышает 2 МБ.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_JSON", "Пустой запрос.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(
          413,
          "BODY_TOO_LARGE",
          "Размер запроса превышает 2 МБ.",
        );
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON", "Не удалось прочитать JSON.");
  } finally {
    reader.releaseLock();
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "INVALID_BODY", "Ожидается объект запроса.");
  return value as Record<string, unknown>;
}

export function createCatalogHandlers(
  dependencies: Dependencies = {
    environment: catalogEnvironment,
    store: catalogStore,
  },
) {
  const guarded =
    (
      handler: (
        request: Request,
        env: CatalogEnvironment | null,
      ) => Promise<Response>,
    ) =>
    async (request: Request): Promise<Response> => {
      try {
        return await handler(request, dependencies.environment());
      } catch (error) {
        if (error instanceof RevisionConflict)
          return json(
            {
              error:
                "Каталог уже изменён. Загрузите актуальную ревизию перед сохранением.",
              code: "REVISION_CONFLICT",
              revision: error.revision,
            },
            409,
          );
        if (error instanceof HttpError)
          return json({ error: error.message, code: error.code }, error.status);
        // Do not return database errors, connection strings, credential values or stacks.
        console.error("Shared catalogue request failed");
        return json(
          {
            configured: true,
            error:
              "Общий каталог недоступен. Проверьте подключение и настройки сервера.",
            code: "CATALOG_UNAVAILABLE",
          },
          503,
        );
      }
    };
  const required = (env: CatalogEnvironment | null): CatalogEnvironment => {
    if (!env)
      throw new HttpError(
        503,
        "LOCAL_MODE",
        "Общий каталог не настроен; доступен локальный режим.",
      );
    return env;
  };
  const session = (request: Request, env: CatalogEnvironment) => {
    const auth = readSession(request, env);
    if (!auth)
      throw new HttpError(
        401,
        "AUTH_REQUIRED",
        "Войдите для доступа к общему каталогу.",
      );
    return auth;
  };
  const sameOrigin = (request: Request, env: CatalogEnvironment) => {
    if (!isSameOriginMutation(request, env))
      throw new HttpError(
        403,
        "ORIGIN_REJECTED",
        "Источник запроса не разрешён.",
      );
  };

  return {
    get: guarded(async (request, env) => {
      if (!env)
        return json({ configured: false, authenticated: false, role: null });
      const auth = readSession(request, env);
      if (!auth)
        return json({ configured: true, authenticated: false, role: null });
      const store = dependencies.store(env.databaseUrl);
      const [config, history] = await Promise.all([
        store.current(),
        store.history(),
      ]);
      return json({
        configured: true,
        authenticated: true,
        role: auth.role,
        config,
        history,
      });
    }),
    login: guarded(async (request, environment) => {
      const env = required(environment);
      sameOrigin(request, env);
      const input = object(await readJson(request));
      const role = authenticateToken(input.token, env);
      if (!role)
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "Неверный ключ доступа.",
        );
      return json({ configured: true, authenticated: true, role }, 200, {
        "Set-Cookie": createSessionCookie(role, env),
      });
    }),
    logout: guarded(async (request, environment) => {
      const env = required(environment);
      sameOrigin(request, env);
      return json({ configured: true, authenticated: false, role: null }, 200, {
        "Set-Cookie": clearSessionCookie(env),
      });
    }),
    put: guarded(async (request, environment) => {
      const env = required(environment);
      sameOrigin(request, env);
      const auth = session(request, env);
      if (auth.role !== "editor")
        throw new HttpError(
          403,
          "EDITOR_REQUIRED",
          "Сохранять общий каталог может только редактор.",
        );
      const input = object(await readJson(request));
      if (
        typeof input.expectedRevision !== "number" ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0 ||
        input.expectedRevision >= Number.MAX_SAFE_INTEGER
      ) {
        throw new HttpError(
          400,
          "INVALID_REVISION",
          "Укажите корректную ожидаемую ревизию.",
        );
      }
      if (
        input.message !== undefined &&
        (typeof input.message !== "string" || input.message.length > 1000)
      )
        throw new HttpError(
          400,
          "INVALID_MESSAGE",
          "Комментарий должен быть строкой до 1000 символов.",
        );
      const parsed = parseConfig(input.config);
      if (!parsed.config || parsed.errors.length)
        return json(
          {
            error: "Конфигурация содержит ошибки.",
            code: "INVALID_CONFIG",
            errors: parsed.errors,
          },
          400,
        );
      const config = await dependencies
        .store(env.databaseUrl)
        .save(
          parsed.config,
          input.expectedRevision,
          auth,
          typeof input.message === "string" ? input.message.trim() : "",
        );
      return json({ config, warnings: parsed.warnings });
    }),
    history: guarded(async (request, environment) => {
      const env = required(environment);
      session(request, env);
      return json({
        history: await dependencies.store(env.databaseUrl).history(),
      });
    }),
    snapshot: (request: Request, revision: string) =>
      guarded(async (currentRequest, environment) => {
        const env = required(environment);
        session(currentRequest, env);
        if (
          !/^[1-9]\d*$/.test(revision) ||
          !Number.isSafeInteger(Number(revision))
        )
          throw new HttpError(400, "INVALID_REVISION", "Некорректная ревизия.");
        const snapshot = await dependencies
          .store(env.databaseUrl)
          .snapshot(Number(revision));
        if (!snapshot)
          throw new HttpError(404, "REVISION_NOT_FOUND", "Ревизия не найдена.");
        return json(snapshot);
      })(request),
  };
}

export const catalogHandlers = createCatalogHandlers();
