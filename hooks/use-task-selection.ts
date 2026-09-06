"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "@/lib/config";
import {
  configuredTaskIds,
  loadTaskSelection,
  recoverTaskSelection,
  writeTaskSelection,
  TASK_SELECTION_EVENT,
  TASK_SELECTION_KEY,
} from "@/lib/task-selection";

export function useTaskSelection(config: AppConfig, enabled = true) {
  const [taskIds, setSelection] = useState<string[]>(() =>
    configuredTaskIds(config),
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!enabled) return;
    try {
      const result = loadTaskSelection(window.localStorage, config);
      setSelection(result.taskIds);
      setError(result.error);
      setRecoveryRaw(result.recoveryRaw);
    } catch {
      setError("Браузер запретил доступ к сохранённому выбору сценариев.");
    }
    setLoaded(true);
  }, [config, enabled]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const storage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === TASK_SELECTION_KEY ||
        event.key === "gpu-calculator:input:v1" ||
        event.key === "gpu-calculator:executive-view:v4"
      )
        refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener(TASK_SELECTION_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(TASK_SELECTION_EVENT, refresh);
    };
  }, [enabled, refresh]);
  const setTaskIds = useCallback(
    (next: string[]): boolean => {
      if (!enabled) return false;
      try {
        const result = writeTaskSelection(window.localStorage, config, next);
        setError(result.error);
        if (!result.ok) return false;
        setSelection([...next]);
        setRecoveryRaw(null);
        setLoaded(true);
        window.dispatchEvent(new Event(TASK_SELECTION_EVENT));
        return true;
      } catch {
        setError("Не удалось сохранить выбранные сценарии.");
        return false;
      }
    },
    [config, enabled],
  );
  const recoverTaskIds = useCallback(
    (next: string[]): boolean => {
      if (!enabled || recoveryRaw === null) return false;
      try {
        const result = recoverTaskSelection(
          window.localStorage,
          next,
          recoveryRaw,
        );
        setError(result.error);
        if (!result.ok) return false;
        setSelection([...next]);
        setRecoveryRaw(null);
        setLoaded(true);
        window.dispatchEvent(new Event(TASK_SELECTION_EVENT));
        return true;
      } catch {
        setError("Не удалось восстановить выбор сценариев.");
        return false;
      }
    },
    [enabled, recoveryRaw],
  );
  return { taskIds, setTaskIds, recoverTaskIds, loaded, error, recoveryRaw };
}
