import type { AppConfig } from "./config";

export const TASK_SELECTION_KEY = "gpu-calculator:task-selection:v1";
export const TASK_SELECTION_EVENT = "gpu-calculator:task-selection-change";
export type TaskSelectionStorage = Pick<Storage, "getItem" | "setItem">;
export type TaskSelectionState = {
  taskIds: string[];
  error: string | null;
  recoveryRaw: string | null;
  /** A valid choice recovered from a previous UI, not yet stored under the canonical key. */
  migrationNeeded?: boolean;
};

export function configuredTaskIds(config: AppConfig): string[] {
  return [
    ...(config.scenarioPresets.find(
      (preset) => preset.id === config.defaultScenarioId,
    )?.input.taskIds ?? []),
  ];
}
export function parseTaskIds(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.length <= 1000 &&
    value.every(
      (id) =>
        typeof id === "string" && id.trim().length > 0 && id.length <= 200,
    ) &&
    new Set(value).size === value.length
    ? [...value]
    : null;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readTaskSelection(
  storage: TaskSelectionStorage,
  config: AppConfig,
): TaskSelectionState {
  const fallback = configuredTaskIds(config);
  let raw: string | null = null;
  try {
    raw = storage.getItem(TASK_SELECTION_KEY);
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      const ids =
        record(value) && value.version === 1
          ? parseTaskIds(value.taskIds)
          : null;
      if (!ids) throw new Error("invalid-selection");
      return { taskIds: ids, error: null, recoveryRaw: null };
    }
    // An explicitly selected earlier preset or saved snapshot can retain the user's task choice.
    const oldViewRaw = storage.getItem("gpu-calculator:executive-view:v4");
    if (oldViewRaw) {
      try {
        const view: unknown = JSON.parse(oldViewRaw);
        if (record(view)) {
          const snapshotIds =
            record(view.snapshot) && record(view.snapshot.input)
              ? parseTaskIds(view.snapshot.input.taskIds)
              : null;
          const presetIds =
            typeof view.presetId === "string" && view.presetId
              ? config.scenarioPresets.find(
                  (preset) => preset.id === view.presetId,
                )?.input.taskIds
              : null;
          if (snapshotIds || presetIds)
            return {
              taskIds: [...(snapshotIds ?? presetIds!)],
              error: null,
              recoveryRaw: null,
              migrationNeeded: true,
            };
        }
      } catch {
        /* Keep the previous screen's recovery data untouched. */
      }
    }
    const oldInputRaw = storage.getItem("gpu-calculator:input:v1");
    if (oldInputRaw) {
      try {
        const previous: unknown = JSON.parse(oldInputRaw);
        const input =
          record(previous) && record(previous.input)
            ? previous.input
            : previous;
        const ids = record(input) ? parseTaskIds(input.taskIds) : null;
        if (ids)
          return {
            taskIds: ids,
            error: null,
            recoveryRaw: null,
            migrationNeeded: true,
          };
      } catch {
        /* Another version owns recovery of this older entry. */
      }
    }
    return { taskIds: fallback, error: null, recoveryRaw: null };
  } catch {
    return {
      taskIds: fallback,
      error:
        raw === null
          ? "Браузер запретил чтение выбранных сценариев."
          : "Сохранённый выбор сценариев повреждён. Исходные данные сохранены; их нужно восстановить перед записью.",
      recoveryRaw: raw,
    };
  }
}

/** Persist a valid legacy choice before another UI can replace its previous storage envelope. */
export function loadTaskSelection(
  storage: TaskSelectionStorage,
  config: AppConfig,
): TaskSelectionState {
  const state = readTaskSelection(storage, config);
  if (!state.migrationNeeded || state.error) return state;
  try {
    // A newer explicit choice always wins over a migration discovered earlier.
    if (storage.getItem(TASK_SELECTION_KEY) !== null)
      return readTaskSelection(storage, config);
    storage.setItem(
      TASK_SELECTION_KEY,
      JSON.stringify({ version: 1, taskIds: state.taskIds }),
    );
    return { ...state, migrationNeeded: false };
  } catch {
    return {
      ...state,
      error:
        "Не удалось перенести сохранённый выбор сценариев. Исходные данные сохранены; проверьте доступ к хранилищу и свободное место.",
    };
  }
}

export function writeTaskSelection(
  storage: TaskSelectionStorage,
  config: AppConfig,
  value: unknown,
): { ok: boolean; error: string | null } {
  const taskIds = parseTaskIds(value);
  if (!taskIds)
    return {
      ok: false,
      error:
        "Выбор сценариев содержит некорректные или повторяющиеся идентификаторы.",
    };
  const current = readTaskSelection(storage, config);
  if (current.error) return { ok: false, error: current.error };
  try {
    storage.setItem(
      TASK_SELECTION_KEY,
      JSON.stringify({ version: 1, taskIds }),
    );
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error:
        "Не удалось сохранить выбор сценариев в браузере. Проверьте доступ к хранилищу и свободное место.",
    };
  }
}

export function recoverTaskSelection(
  storage: TaskSelectionStorage,
  value: unknown,
  expectedRaw: string,
): { ok: boolean; error: string | null } {
  const taskIds = parseTaskIds(value);
  if (!taskIds)
    return {
      ok: false,
      error: "Невозможно восстановить некорректный набор сценариев.",
    };
  try {
    if (storage.getItem(TASK_SELECTION_KEY) !== expectedRaw)
      return {
        ok: false,
        error:
          "Выбор изменился в другой вкладке. Обновите страницу перед восстановлением.",
      };
    storage.setItem(
      `${TASK_SELECTION_KEY}:recovery:${Date.now()}`,
      expectedRaw,
    );
    storage.setItem(
      TASK_SELECTION_KEY,
      JSON.stringify({ version: 1, taskIds }),
    );
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error:
        "Не удалось создать резервную копию и восстановить выбор. Исходные данные сохранены.",
    };
  }
}
