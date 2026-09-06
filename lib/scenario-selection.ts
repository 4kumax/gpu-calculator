import type { AppConfig } from "./config";
import {
  HORIZON_STORAGE_KEY,
  readCalculationHorizon,
  validHorizon,
  writeCalculationHorizon,
} from "./calculation-horizon";
import {
  parseTaskIds,
  readTaskSelection,
  TASK_SELECTION_KEY,
  writeTaskSelection,
} from "./task-selection";

export type ScenarioSelectionStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export type ScenarioSelectionResult = { ok: boolean; error: string | null };

/**
 * Apply the two snapshot choices synchronously and restore their exact prior
 * entries on failure. The caller broadcasts change events only after success.
 * Web Storage has no multi-key transaction; a failed rollback is reported.
 */
export function applyScenarioSelection(
  storage: ScenarioSelectionStorage,
  config: AppConfig,
  selection: { months: unknown; taskIds: unknown },
): ScenarioSelectionResult {
  if (!validHorizon(selection.months))
    return {
      ok: false,
      error: "Срок расчёта должен составлять от 1 до 120 целых месяцев.",
    };
  const taskIds = parseTaskIds(selection.taskIds);
  if (!taskIds)
    return {
      ok: false,
      error:
        "Выбор сценариев содержит некорректные или повторяющиеся идентификаторы.",
    };

  const previous = new Map<string, string | null>();
  try {
    previous.set(HORIZON_STORAGE_KEY, storage.getItem(HORIZON_STORAGE_KEY));
    previous.set(TASK_SELECTION_KEY, storage.getItem(TASK_SELECTION_KEY));
    const horizon = readCalculationHorizon(storage, config);
    const tasks = readTaskSelection(storage, config);
    if (horizon.error || tasks.error)
      return { ok: false, error: horizon.error || tasks.error };
    for (const [key, raw] of previous)
      if (storage.getItem(key) !== raw)
        return {
          ok: false,
          error:
            "Условия расчёта изменились в другой вкладке. Повторите загрузку сохранённого варианта.",
        };
  } catch {
    return {
      ok: false,
      error:
        "Не удалось прочитать прежний срок и выбор задач. Сохранённый вариант не загружен; проверьте доступ к хранилищу браузера.",
    };
  }

  // Track attempted writes too: a storage adapter may write before throwing.
  const touched = new Set<string>();
  const trackedStorage = {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, raw: string) => {
      touched.add(key);
      storage.setItem(key, raw);
    },
  };
  const rollback = (error: string | null): ScenarioSelectionResult => {
    let restored = true;
    for (const key of [...touched].reverse()) {
      const raw = previous.get(key)!;
      try {
        if (storage.getItem(key) === raw) continue;
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
        if (storage.getItem(key) !== raw) restored = false;
      } catch {
        restored = false;
      }
    }
    return {
      ok: false,
      error: restored
        ? `${error || "Не удалось загрузить сохранённый вариант."} Прежний срок и выбор задач сохранены.`
        : "Сохранённый вариант не загружен: не удалось полностью восстановить прежний срок и выбор задач после ошибки записи. Условия могли измениться частично. Обновите страницу и проверьте срок и задачи в Параметрах перед повторной загрузкой.",
    };
  };
  try {
    const horizon = writeCalculationHorizon(
      trackedStorage,
      config,
      selection.months,
    );
    if (!horizon.ok) return rollback(horizon.error);
    const tasks = writeTaskSelection(trackedStorage, config, taskIds);
    if (!tasks.ok) return rollback(tasks.error);
    return { ok: true, error: null };
  } catch {
    return rollback("Не удалось загрузить сохранённый вариант.");
  }
}
