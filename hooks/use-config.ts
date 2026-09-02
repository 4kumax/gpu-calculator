"use client";

import { useCallback, useEffect, useState } from "react";
import { AppConfig, cloneDefaultConfig, STORAGE_KEY, validateConfig } from "@/lib/config";

export function readConfig(): AppConfig {
  if (typeof window === "undefined") return cloneDefaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultConfig();
    const parsed = JSON.parse(raw) as AppConfig;
    return validateConfig(parsed).length ? cloneDefaultConfig() : parsed;
  } catch {
    return cloneDefaultConfig();
  }
}

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(cloneDefaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setConfigState(readConfig());
    setLoaded(true);
    const sync = () => setConfigState(readConfig());
    window.addEventListener("storage", sync);
    window.addEventListener("gpu-config-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("gpu-config-updated", sync);
    };
  }, []);

  const save = useCallback((next: AppConfig) => {
    const errors = validateConfig(next);
    if (errors.length) return errors;
    const saved = {...next, revision: next.revision + 1, updatedAt: new Date().toISOString()};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    setConfigState(saved);
    window.dispatchEvent(new Event("gpu-config-updated"));
    return [];
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = cloneDefaultConfig();
    setConfigState(fresh);
    window.dispatchEvent(new Event("gpu-config-updated"));
  }, []);

  return {config, setConfig: setConfigState, save, reset, loaded};
}
