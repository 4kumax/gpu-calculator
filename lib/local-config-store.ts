import {
  AppConfig,
  cloneDefaultConfig,
  LEGACY_STORAGE_KEY,
  parseConfig,
  normalizeDraftCatalog,
  STORAGE_KEY,
} from "./config";

export const DRAFT_KEY = "gpu-calculator:draft:v3";
export const HISTORY_KEY = "gpu-calculator:history:v3";
export const RECOVERY_KEY = "gpu-calculator:recovery:v3";
export const DRAFT_SESSION_KEY = "gpu-calculator:draft-session:v3";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ConfigSnapshot = {
  config: AppConfig;
  warnings: string[];
  error: string | null;
  recoveryRaw: string | null;
  sourceKey: string | null;
};
export type SaveResult = {
  ok: boolean;
  config?: AppConfig;
  errors: string[];
  warnings: string[];
  conflict?: boolean;
  current?: AppConfig;
};
export type CatalogHistoryEntry = {
  revision: number;
  updatedAt: string;
  message: string;
  actor?: string;
  role?: string;
  config?: AppConfig;
};
export type DraftEnvelope = {
  config: AppConfig;
  baseConfig: AppConfig;
  baseRevision?: number;
  updatedAt: string;
  mode: "local" | "shared";
};
export type ConfigDifference = { path: string; before: string; after: string };

const failureMessage = (error: unknown) =>
  error instanceof Error &&
  (error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ? "В браузере недостаточно места. Экспортируйте черновик и освободите хранилище."
    : "Браузер запретил доступ к локальному хранилищу. Экспортируйте черновик, чтобы сохранить изменения.";

export function readLocalConfig(storage: StorageLike): ConfigSnapshot {
  let raw: string | null = null;
  let sourceKey: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    sourceKey = raw === null ? null : STORAGE_KEY;
    if (raw === null) {
      raw = storage.getItem(LEGACY_STORAGE_KEY);
      sourceKey = raw === null ? null : LEGACY_STORAGE_KEY;
    }
    if (raw === null)
      return {
        config: cloneDefaultConfig(),
        warnings: [],
        error: null,
        recoveryRaw: null,
        sourceKey,
      };
    const parsed = parseConfig(JSON.parse(raw));
    if (parsed.config)
      return {
        config: parsed.config,
        warnings: parsed.warnings,
        error: null,
        recoveryRaw: null,
        sourceKey,
      };
    return {
      config: cloneDefaultConfig(),
      warnings: [],
      error: `Сохранённый каталог не прошёл проверку: ${parsed.errors.join(" ")}`,
      recoveryRaw: raw,
      sourceKey,
    };
  } catch (error) {
    return {
      config: cloneDefaultConfig(),
      warnings: [],
      error:
        raw === null
          ? failureMessage(error)
          : "Сохранённый каталог повреждён: не удалось прочитать JSON. Исходные данные доступны для восстановления.",
      recoveryRaw: raw,
      sourceKey,
    };
  }
}

export function readLocalHistory(storage: StorageLike): CatalogHistoryEntry[] {
  const raw = storage.getItem(HISTORY_KEY);
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("История каталога повреждена.");
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const entry = row as Record<string, unknown>;
    const parsed = parseConfig(entry.config, {
      preserveCalculationDefaults: true,
    });
    return parsed.config && typeof entry.message === "string"
      ? [
          {
            config: parsed.config,
            revision: parsed.config.revision,
            updatedAt: parsed.config.updatedAt,
            message: entry.message,
          },
        ]
      : [];
  });
}

export function saveLocalConfig(
  storage: StorageLike,
  candidate: unknown,
  options: { expectedRevision: number; message?: string; recover?: boolean },
): SaveResult {
  const parsed = parseConfig(candidate);
  if (!parsed.config)
    return { ok: false, errors: parsed.errors, warnings: parsed.warnings };
  const current = readLocalConfig(storage);
  if (current.error && (!current.recoveryRaw || !options.recover))
    return {
      ok: false,
      errors: [current.error],
      warnings: [],
      current: current.config,
    };
  if (current.config.revision !== options.expectedRevision)
    return {
      ok: false,
      errors: [
        "Каталог изменён в другой вкладке. Сравните версии перед сохранением.",
      ],
      warnings: [],
      conflict: true,
      current: current.config,
    };
  const saved = {
    ...parsed.config,
    revision: current.config.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const warnings = [...parsed.warnings];
  try {
    if (current.recoveryRaw) storage.setItem(RECOVERY_KEY, current.recoveryRaw);
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    return { ok: false, errors: [failureMessage(error)], warnings: [] };
  }
  try {
    const history = readLocalHistory(storage);
    const prior = history.some(
      (row) => row.revision === current.config.revision,
    )
      ? []
      : [
          {
            config: current.config,
            revision: current.config.revision,
            updatedAt: current.config.updatedAt,
            message: "Версия перед изменением",
          },
        ];
    storage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        [
          {
            config: saved,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
            message: options.message?.trim() || "Изменение настроек",
          },
          ...prior,
          ...history,
        ].slice(0, 15),
      ),
    );
  } catch {
    warnings.push(
      "Каталог сохранён, но резервная история не записана. Экспортируйте новую ревизию в JSON.",
    );
  }
  return { ok: true, config: saved, errors: [], warnings };
}

export function isConfigStorageKey(key: string | null): boolean {
  return key === null || key === STORAGE_KEY || key === LEGACY_STORAGE_KEY;
}

const draftKey = (slot?: string) => (slot ? `${DRAFT_KEY}:${slot}` : DRAFT_KEY);
export function saveDraft(
  storage: StorageLike,
  draft: DraftEnvelope,
  slot?: string,
): string | null {
  try {
    storage.setItem(draftKey(slot), JSON.stringify(draft));
    return null;
  } catch (error) {
    return failureMessage(error);
  }
}

// A draft can contain temporarily invalid values (for example an empty name).
// Validate its runtime shape separately from the rules required for publication.
function sameShape(reference: unknown, candidate: unknown): boolean {
  if (reference === null || reference === undefined)
    return candidate === null || candidate === undefined;
  if (Array.isArray(reference))
    return (
      Array.isArray(candidate) &&
      (reference.length === 0 ||
        candidate.every((item) => sameShape(reference[0], item)))
    );
  if (typeof reference === "object") {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return false;
    const expected = reference as Record<string, unknown>,
      actual = candidate as Record<string, unknown>;
    return Object.entries(expected).every(
      ([key, value]) =>
        ([
          "checkpointWeightGb",
          "catalogUpdateVersion",
          "months",
          "benchmark",
          "correctAnswerPct",
          "extractionErrorPct",
          "toolSuccessPct",
        ].includes(key) &&
          !(key in actual)) ||
        (key in actual && sameShape(value, actual[key])),
    );
  }
  return (
    typeof candidate === typeof reference &&
    (typeof candidate !== "number" || Number.isFinite(candidate))
  );
}

function safeDraftShape(value: unknown): boolean {
  const template = cloneDefaultConfig();
  template.models[0].checkpointWeightGb = 1;
  template.deploymentProfiles[0].benchmark = {
    inputTokens: 1,
    outputTokens: 1,
    concurrency: 1,
    ttftMs: 1,
    tokensPerSecond: 1,
  };
  template.qualityAssessments = [
    {
      id: "example",
      modelId: "example",
      taskId: "example",
      status: "planned",
      qualityTier: 1,
      sampleSize: 0,
      dataset: "",
      sourceUrl: "",
      sourceDate: "",
      notes: "",
      correctAnswerPct: 0,
      extractionErrorPct: 0,
      toolSuccessPct: 0,
    },
  ];
  return (
    sameShape(template, value) &&
    (value as AppConfig).schemaVersion === 4 &&
    (value as AppConfig).models.length > 0 &&
    (value as AppConfig).gpus.length > 0
  );
}

export function readDraft(
  storage: StorageLike,
  slot?: string,
): { draft: DraftEnvelope | null; error: string | null; recoveryRaw?: string } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(draftKey(slot));
    if (!raw) return { draft: null, error: null };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const entry = value as Record<string, unknown>;
    const base = parseConfig(entry.baseConfig);
    let candidate = entry.config;
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (candidate as Record<string, unknown>).schemaVersion === 3 &&
      base.config
    ) {
      const legacyDraft = candidate as Record<string, unknown>;
      const assumptions = legacyDraft.assumptions;
      candidate = {
        ...legacyDraft,
        schemaVersion: 4,
        scenarioPresets: JSON.parse(
          JSON.stringify(base.config.scenarioPresets),
        ),
        defaultScenarioId: base.config.defaultScenarioId,
        assumptions:
          assumptions &&
          typeof assumptions === "object" &&
          !Array.isArray(assumptions)
            ? {
                ...assumptions,
                defaultInputTokens: base.config.assumptions.defaultInputTokens,
                defaultOutputTokens:
                  base.config.assumptions.defaultOutputTokens,
              }
            : assumptions,
      };
    }
    if (
      !base.config ||
      typeof entry.updatedAt !== "string" ||
      !["local", "shared"].includes(String(entry.mode)) ||
      !safeDraftShape(candidate)
    )
      throw new Error();
    return {
      draft: {
        config: normalizeDraftCatalog(candidate as AppConfig),
        baseConfig: base.config,
        baseRevision:
          typeof entry.baseRevision === "number" &&
          Number.isSafeInteger(entry.baseRevision) &&
          entry.baseRevision >= 0
            ? entry.baseRevision
            : base.config.revision,
        updatedAt: entry.updatedAt,
        mode: entry.mode as DraftEnvelope["mode"],
      },
      error: null,
    };
  } catch {
    return {
      draft: null,
      error:
        "Сохранённый черновик не удалось открыть. Его исходный JSON можно скачать для восстановления.",
      recoveryRaw: raw ?? undefined,
    };
  }
}

export function clearDraft(storage: StorageLike, slot?: string): string | null {
  try {
    storage.removeItem(draftKey(slot));
    return null;
  } catch (error) {
    return failureMessage(error);
  }
}

export function configDifferences(
  before: AppConfig,
  after: AppConfig,
): ConfigDifference[] {
  const differences: ConfigDifference[] = [];
  const printable = (value: unknown) =>
    value === undefined
      ? "—"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  const visit = (left: unknown, right: unknown, path: string) => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (
      Array.isArray(left) &&
      Array.isArray(right) &&
      [...left, ...right].every(
        (item) =>
          item && typeof item === "object" && typeof item.id === "string",
      )
    ) {
      const a = new Map(left.map((item) => [item.id, item])),
        b = new Map(right.map((item) => [item.id, item]));
      for (const id of new Set([...a.keys(), ...b.keys()]))
        visit(a.get(id), b.get(id), `${path}[${id}]`);
    } else if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      const a = left as Record<string, unknown>,
        b = right as Record<string, unknown>;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (!["revision", "updatedAt"].includes(key))
          visit(a[key], b[key], path ? `${path}.${key}` : key);
    } else
      differences.push({
        path,
        before: printable(left),
        after: printable(right),
      });
  };
  visit(before, after, "");
  return differences;
}

export function mergeDraftChanges(
  base: AppConfig,
  draft: AppConfig,
  current: AppConfig,
): AppConfig {
  const merge = (old: unknown, edited: unknown, latest: unknown): unknown => {
    if (JSON.stringify(old) === JSON.stringify(edited)) return latest;
    if (
      Array.isArray(old) &&
      Array.isArray(edited) &&
      Array.isArray(latest) &&
      [...old, ...edited, ...latest].every(
        (item) =>
          item && typeof item === "object" && typeof item.id === "string",
      )
    ) {
      const a = new Map(old.map((item) => [item.id, item])),
        b = new Map(edited.map((item) => [item.id, item])),
        c = new Map(latest.map((item) => [item.id, item]));
      return [...new Set([...b.keys(), ...c.keys()])].flatMap((id) => {
        if (!b.has(id) && a.has(id)) return [];
        const value = merge(a.get(id), b.get(id), c.get(id));
        return value === undefined ? [] : [value];
      });
    }
    if (
      old &&
      edited &&
      latest &&
      typeof old === "object" &&
      typeof edited === "object" &&
      typeof latest === "object" &&
      !Array.isArray(old) &&
      !Array.isArray(edited) &&
      !Array.isArray(latest)
    ) {
      const a = old as Record<string, unknown>,
        b = edited as Record<string, unknown>,
        c = latest as Record<string, unknown>;
      return Object.fromEntries(
        [...new Set([...Object.keys(b), ...Object.keys(c)])].map((key) => [
          key,
          merge(a[key], b[key], c[key]),
        ]),
      );
    }
    return edited;
  };
  return {
    ...(merge(base, draft, current) as AppConfig),
    revision: current.revision,
    updatedAt: current.updatedAt,
  };
}
