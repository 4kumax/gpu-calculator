"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "@/lib/config";
import {
  configuredMonths,
  HORIZON_CHANGE_EVENT,
  HORIZON_STORAGE_KEY,
  readCalculationHorizon,
  recoverCalculationHorizon,
  writeCalculationHorizon,
} from "@/lib/calculation-horizon";

export function useCalculationHorizon(config: AppConfig, enabled = true) {
  const [months, setValue] = useState(() => configuredMonths(config));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!enabled) return;
    try {
      const current = readCalculationHorizon(window.localStorage, config);
      setValue(current.months);
      setError(current.error);
      setRecoveryRaw(current.recoveryRaw);
    } catch {
      setError("Браузер запретил доступ к сохранённому сроку расчёта.");
    }
    setLoaded(true);
  }, [config, enabled]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === HORIZON_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener(HORIZON_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(HORIZON_CHANGE_EVENT, refresh);
    };
  }, [enabled, refresh]);
  const setMonths = useCallback(
    (next: number): boolean => {
      if (!enabled) return false;
      try {
        const result = writeCalculationHorizon(
          window.localStorage,
          config,
          next,
        );
        setError(result.error);
        if (!result.ok) return false;
        setValue(next);
        setRecoveryRaw(null);
        setLoaded(true);
        window.dispatchEvent(new Event(HORIZON_CHANGE_EVENT));
        return true;
      } catch {
        setError("Не удалось сохранить срок расчёта.");
        return false;
      }
    },
    [config, enabled],
  );
  const recoverMonths = useCallback(
    (next: number): boolean => {
      if (!enabled || recoveryRaw === null) return false;
      try {
        const result = recoverCalculationHorizon(
          window.localStorage,
          next,
          recoveryRaw,
        );
        setError(result.error);
        if (!result.ok) return false;
        setValue(next);
        setRecoveryRaw(null);
        setLoaded(true);
        window.dispatchEvent(new Event(HORIZON_CHANGE_EVENT));
        return true;
      } catch {
        setError("Не удалось восстановить срок расчёта.");
        return false;
      }
    },
    [enabled, recoveryRaw],
  );
  return { months, setMonths, loaded, error, recoveryRaw, recoverMonths };
}
