"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppConfig, cloneDefaultConfig, parseConfig } from "@/lib/config";
import {
  CatalogHistoryEntry,
  ConfigSnapshot,
  isConfigStorageKey,
  readLocalConfig,
  readLocalHistory,
  SaveResult,
  saveLocalConfig,
} from "@/lib/local-config-store";

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "error"
  | "authentication-required"
  | "conflict";
type SharedState = {
  configured: boolean;
  authenticated: boolean;
  role: "viewer" | "editor" | null;
  revision: number;
};
export type SaveOptions = {
  expectedRevision?: number;
  message?: string;
  recover?: boolean;
};
const UPDATE_EVENT = "gpu-config-updated";
function notifyConfigUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVENT));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("gpu-calculator:catalog");
      channel.postMessage("updated");
      channel.close();
    }
  } catch {
    /* Storage events still synchronize local changes. */
  }
}

function localSnapshot(): ConfigSnapshot {
  try {
    return readLocalConfig(window.localStorage);
  } catch {
    return {
      config: cloneDefaultConfig(),
      warnings: [],
      error:
        "Локальное хранилище недоступно. Изменения можно экспортировать в JSON.",
      recoveryRaw: null,
      sourceKey: null,
    };
  }
}

export function readConfig(): AppConfig {
  return typeof window === "undefined"
    ? cloneDefaultConfig()
    : localSnapshot().config;
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && !Array.isArray(body))
      return body as Record<string, unknown>;
  } catch {
    /* An unavailable backend must be visible, never silently written locally. */
  }
  throw new Error(
    "Сервер каталога вернул некорректный ответ. Локальные данные не изменены.",
  );
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию с каталогом.";
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(cloneDefaultConfig);
  const [loaded, setLoaded] = useState(false);
  const [modeKnown, setModeKnown] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [history, setHistory] = useState<CatalogHistoryEntry[]>([]);
  const [shared, setShared] = useState<SharedState>({
    configured: false,
    authenticated: false,
    role: null,
    revision: 0,
  });
  const stateRef = useRef({ config, shared, modeKnown });
  stateRef.current = { config, shared, modeKnown };
  const requestId = useRef(0);
  const firstSnapshot = useRef(true);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const local = localSnapshot();
    if (firstSnapshot.current) {
      firstSnapshot.current = false;
      setConfigState(local.config);
      setWarnings(local.warnings);
      setRecoveryRaw(local.recoveryRaw);
    }
    try {
      const response = await fetch("/api/catalog", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await responseBody(response);
      if (id !== requestId.current) return;
      if (!response.ok) {
        if (body.configured === true)
          setShared((previous) => ({ ...previous, configured: true }));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Общий каталог временно недоступен.",
        );
      }
      if (typeof body.configured !== "boolean")
        throw new Error(
          "Сервер не подтвердил режим хранения каталога. Сохранение приостановлено.",
        );
      setModeKnown(true);
      if (body.configured === true) {
        const authenticated = body.authenticated === true;
        const role =
          body.role === "viewer" || body.role === "editor" ? body.role : null;
        const parsed = body.config ? parseConfig(body.config) : null;
        if (body.config && !parsed?.config)
          throw new Error(
            `Общий каталог не прошёл проверку: ${parsed?.errors.join(" ")}`,
          );
        setShared({
          configured: true,
          authenticated,
          role,
          revision: parsed?.config?.revision ?? 0,
        });
        const unpublished =
          authenticated && (!parsed?.config || parsed.config.revision === 0);
        setConfigState(
          unpublished
            ? { ...local.config, revision: 0 }
            : (parsed?.config ?? local.config),
        );
        setHistory(
          Array.isArray(body.history)
            ? (body.history as CatalogHistoryEntry[])
            : [],
        );
        setWarnings([
          ...(unpublished
            ? local.warnings
            : (parsed?.warnings ?? local.warnings)),
          ...(unpublished
            ? [
                "Общий каталог ещё не опубликован. Показан локальный каталог; публикация произойдёт только после сохранения редактором.",
              ]
            : []),
        ]);
        setRecoveryRaw(local.recoveryRaw);
        setError(
          authenticated
            ? null
            : "Для общего каталога требуется вход. Сейчас показан локальный предварительный расчёт.",
        );
        setStatus(authenticated ? "ready" : "authentication-required");
      } else {
        setShared({
          configured: false,
          authenticated: false,
          role: null,
          revision: 0,
        });
        setConfigState(local.config);
        const nextWarnings = [...local.warnings];
        try {
          setHistory(readLocalHistory(window.localStorage));
        } catch {
          setHistory([]);
          nextWarnings.push(
            "Локальная история недоступна; текущий каталог сохранён отдельно.",
          );
        }
        setWarnings(nextWarnings);
        setRecoveryRaw(local.recoveryRaw);
        setError(local.error);
        setStatus(local.error ? "error" : "ready");
      }
    } catch (cause) {
      if (id !== requestId.current) return;
      setModeKnown(false);
      setError(errorText(cause));
      setStatus("error");
    } finally {
      if (id === requestId.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const storageSync = (event: StorageEvent) => {
      if (isConfigStorageKey(event.key)) void refresh();
    };
    const sync = () => {
      void refresh();
    };
    window.addEventListener("storage", storageSync);
    window.addEventListener(UPDATE_EVENT, sync);
    let channel: BroadcastChannel | null = null;
    try {
      channel =
        typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel("gpu-calculator:catalog")
          : null;
    } catch {
      /* Optional cross-tab transport. */
    }
    if (channel) channel.onmessage = sync;
    return () => {
      requestId.current += 1;
      window.removeEventListener("storage", storageSync);
      window.removeEventListener(UPDATE_EVENT, sync);
      channel?.close();
    };
  }, [refresh]);

  const save = useCallback(
    async (next: AppConfig, options: SaveOptions = {}): Promise<SaveResult> => {
      const current = stateRef.current;
      const parsed = parseConfig(next);
      if (!parsed.config)
        return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
      setStatus("saving");
      let result: SaveResult;
      try {
        if (!current.modeKnown)
          throw new Error(
            "Режим хранения каталога ещё не подтверждён. Повторите загрузку перед сохранением.",
          );
        if (current.shared.configured) {
          if (!current.shared.authenticated || current.shared.role !== "editor")
            throw new Error(
              "Изменять общий каталог может только авторизованный редактор.",
            );
          const response = await fetch("/api/catalog", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: parsed.config,
              expectedRevision:
                options.expectedRevision ?? current.shared.revision,
              message: options.message ?? "Изменение настроек",
            }),
          });
          const body = await responseBody(response);
          if (!response.ok) {
            result = {
              ok: false,
              errors: strings(body.errors).length
                ? strings(body.errors)
                : [
                    typeof body.error === "string"
                      ? body.error
                      : "Не удалось сохранить общий каталог.",
                  ],
              warnings: [],
              conflict: response.status === 409,
            };
            if (result.conflict) await refresh();
          } else {
            const saved = parseConfig(body.config);
            if (!saved.config)
              throw new Error("Сервер не подтвердил новую ревизию каталога.");
            result = {
              ok: true,
              config: saved.config,
              errors: [],
              warnings: [...saved.warnings, ...strings(body.warnings)],
            };
            setShared((previous) => ({
              ...previous,
              revision: saved.config!.revision,
            }));
          }
        } else {
          const commit = () =>
            saveLocalConfig(window.localStorage, parsed.config, {
              expectedRevision:
                options.expectedRevision ?? current.config.revision,
              message: options.message,
              recover: options.recover,
            });
          result = navigator.locks
            ? await navigator.locks.request(
                "gpu-calculator:catalog-save",
                commit,
              )
            : commit();
        }
      } catch (cause) {
        result = { ok: false, errors: [errorText(cause)], warnings: [] };
      }
      if (result.ok && result.config) {
        setConfigState(result.config);
        setError(null);
        setRecoveryRaw(null);
        setWarnings(result.warnings);
        setStatus("ready");
        notifyConfigUpdate();
      } else {
        if (result.current) setConfigState(result.current);
        setError(result.errors.join(" "));
        setStatus(result.conflict ? "conflict" : "error");
      }
      return result;
    },
    [refresh],
  );

  const reset = useCallback(
    (options?: SaveOptions) =>
      save(cloneDefaultConfig(), {
        ...options,
        message: options?.message ?? "Восстановление встроенного каталога",
      }),
    [save],
  );
  const login = useCallback(
    async (token: string): Promise<string[]> => {
      try {
        const response = await fetch("/api/catalog/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await responseBody(response);
        if (!response.ok)
          throw new Error(
            typeof body.error === "string" ? body.error : "Не удалось войти.",
          );
        await refresh();
        notifyConfigUpdate();
        return [];
      } catch (cause) {
        return [errorText(cause)];
      }
    },
    [refresh],
  );
  const logout = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch("/api/catalog/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await responseBody(response);
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Не удалось завершить сессию.",
        );
      }
      await refresh();
      notifyConfigUpdate();
      return [];
    } catch (cause) {
      return [errorText(cause)];
    }
  }, [refresh]);
  const loadHistory = useCallback(
    async (revision: number): Promise<AppConfig> => {
      if (!stateRef.current.shared.configured) {
        const record = readLocalHistory(window.localStorage).find(
          (item) => item.revision === revision,
        );
        if (!record?.config)
          throw new Error("Ревизия отсутствует в локальной истории.");
        return record.config;
      }
      const response = await fetch(`/api/catalog/history/${revision}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await responseBody(response);
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Не удалось загрузить ревизию.",
        );
      const parsed = parseConfig(body.config, {
        preserveCalculationDefaults: true,
      });
      if (!parsed.config) throw new Error(parsed.errors.join(" "));
      return parsed.config;
    },
    [],
  );

  return {
    config,
    loaded,
    status,
    error,
    warnings,
    recoveryRaw,
    history,
    modeKnown,
    canSave:
      modeKnown &&
      (!shared.configured ||
        (shared.authenticated && shared.role === "editor")),
    mode: shared.configured ? ("shared" as const) : ("local" as const),
    ...shared,
    sharedRevision: shared.revision,
    save,
    reset,
    refresh,
    login,
    logout,
    loadHistory,
  };
}
