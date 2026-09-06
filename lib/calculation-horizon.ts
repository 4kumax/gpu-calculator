import type { AppConfig } from "./config";
import { calculationMonths } from "./horizon";

export const HORIZON_STORAGE_KEY = "gpu-calculator:horizon:v1";
export const HORIZON_CHANGE_EVENT = "gpu-calculator:horizon-change";
export type HorizonStorage = Pick<Storage, "getItem" | "setItem">;
export type HorizonState = {
  months: number;
  error: string | null;
  recoveryRaw: string | null;
};
export const validHorizon = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 120;
export function configuredMonths(config: AppConfig): number {
  const current = config.scenarioPresets.find(
    (preset) => preset.id === config.defaultScenarioId,
  );
  if (!current) throw new Error("Отсутствуют параметры текущего расчёта.");
  return calculationMonths(current.input);
}
export function readCalculationHorizon(
  storage: HorizonStorage,
  config: AppConfig,
): HorizonState {
  const fallback = configuredMonths(config);
  let raw: string | null = null;
  try {
    raw = storage.getItem(HORIZON_STORAGE_KEY);
    if (raw === null)
      return { months: fallback, error: null, recoveryRaw: null };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    const entry = data as Record<string, unknown>;
    if (entry.version !== 1 || !validHorizon(entry.months)) throw new Error();
    return { months: entry.months, error: null, recoveryRaw: null };
  } catch {
    return {
      months: fallback,
      error:
        raw === null
          ? "Браузер запретил чтение срока расчёта."
          : "Сохранённый срок расчёта повреждён. Исходные данные сохранены для восстановления в Параметрах.",
      recoveryRaw: raw,
    };
  }
}
export function writeCalculationHorizon(
  storage: HorizonStorage,
  config: AppConfig,
  months: unknown,
): { ok: boolean; error: string | null } {
  if (!validHorizon(months))
    return {
      ok: false,
      error: "Срок расчёта должен составлять от 1 до 120 целых месяцев.",
    };
  const current = readCalculationHorizon(storage, config);
  if (current.error) return { ok: false, error: current.error };
  try {
    storage.setItem(
      HORIZON_STORAGE_KEY,
      JSON.stringify({ version: 1, months }),
    );
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error:
        "Не удалось сохранить срок расчёта в браузере. Проверьте доступ к хранилищу и свободное место.",
    };
  }
}
export function recoverCalculationHorizon(
  storage: HorizonStorage,
  months: unknown,
  expectedRaw: string,
): { ok: boolean; error: string | null } {
  if (!validHorizon(months))
    return { ok: false, error: "Укажите срок от 1 до 120 целых месяцев." };
  try {
    if (storage.getItem(HORIZON_STORAGE_KEY) !== expectedRaw)
      return {
        ok: false,
        error:
          "Срок изменился в другой вкладке. Обновите страницу перед восстановлением.",
      };
    storage.setItem(
      `${HORIZON_STORAGE_KEY}:recovery:${Date.now()}`,
      expectedRaw,
    );
    storage.setItem(
      HORIZON_STORAGE_KEY,
      JSON.stringify({ version: 1, months }),
    );
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error:
        "Не удалось создать резервную копию и восстановить срок расчёта. Исходные данные сохранены.",
    };
  }
}
