import { calculate, type CalculationInput } from "./calculator";
import { parseConfig, type AppConfig } from "./config";

export const CALCULATOR_VERSION = "3.0.0";
export const INPUT_STORAGE_KEY = "gpu-calculator:input:v1";
export const SCENARIO_STORAGE_KEY = "gpu-calculator:scenarios:v1";
export const MAX_SCENARIOS = 20;

export type Scenario = {
  version: 1;
  calculatorVersion: string;
  id: string;
  name: string;
  createdAt: string;
  input: CalculationInput;
  config: AppConfig;
};

type ParseResult<T> = { value: T | null; errors: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function calculationDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const length = value.length === 10 ? 10 : 19;
  return (
    new Date(value).toISOString().slice(0, length) === value.slice(0, length)
  );
}

export function defaultInput(config: AppConfig): CalculationInput {
  return {
    taskIds: ["contracts", "estimates", "incidents", "agents"].filter((id) =>
      config.tasks.some((task) => task.id === id && task.enabled),
    ),
    modelId: "auto",
    gpuId: "auto",
    hoursMonth: config.assumptions.defaultHoursMonth,
    years: config.assumptions.defaultYears,
    concurrency: config.assumptions.defaultConcurrency,
    reserveMode: "none",
    largeModelSharePct: 100,
    priority: "balance",
    inputTokens: 0,
    outputTokens: 1024,
    targetTtftMs: 0,
    minTokensPerSecond: 0,
    rentalMode: "gpu-hour",
    reserveRentalMode: "always-on",
  };
}

export function parseInput(value: unknown): ParseResult<CalculationInput> {
  if (!object(value))
    return { value: null, errors: ["Параметры расчёта должны быть объектом."] };
  const errors: string[] = [];
  const numeric = (
    key: string,
    min: number,
    max: number,
    integer: boolean,
    optional = false,
  ) => {
    const v = value[key];
    if (optional && v === undefined) return;
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (integer && !Number.isInteger(v))
    )
      errors.push(
        `Поле ${key}: ожидается ${integer ? "целое " : ""}число от ${min} до ${max}.`,
      );
  };
  for (const key of ["modelId", "gpuId"])
    if (
      typeof value[key] !== "string" ||
      !(value[key] as string).trim() ||
      (value[key] as string).length > 200
    )
      errors.push(`Поле ${key}: требуется идентификатор.`);
  if (
    !Array.isArray(value.taskIds) ||
    value.taskIds.length > 1000 ||
    value.taskIds.some(
      (id) => typeof id !== "string" || !id.trim() || id.length > 200,
    ) ||
    new Set(value.taskIds).size !== value.taskIds.length
  )
    errors.push(
      "Список задач содержит неверные или повторяющиеся идентификаторы.",
    );
  const enumeration = (key: string, choices: string[], optional = false) => {
    if (optional && value[key] === undefined) return;
    if (
      typeof value[key] !== "string" ||
      !choices.includes(value[key] as string)
    )
      errors.push(`Поле ${key}: неизвестное значение.`);
  };
  enumeration("priority", ["cost", "balance", "quality"]);
  enumeration("reserveMode", ["none", "nplus1"]);
  enumeration("rentalMode", ["gpu-hour", "dedicated-node"], true);
  enumeration("reserveRentalMode", ["active-hours", "always-on"], true);
  numeric("hoursMonth", 0, 730, false);
  numeric("years", 1, 5, true);
  numeric("concurrency", 1, 10000, true);
  numeric("largeModelSharePct", 0.001, 100, false);
  numeric("inputTokens", 0, 10000000, true, true);
  numeric("outputTokens", 1, 10000000, true, true);
  numeric("targetTtftMs", 0, 10000000, false, true);
  numeric("minTokensPerSecond", 0, 1000000, false, true);
  if (value.asOf !== undefined && !calculationDate(value.asOf))
    errors.push("Дата расчёта некорректна.");
  if (errors.length) return { value: null, errors };
  const keys = [
    "taskIds",
    "modelId",
    "gpuId",
    "hoursMonth",
    "years",
    "concurrency",
    "reserveMode",
    "largeModelSharePct",
    "priority",
    "inputTokens",
    "outputTokens",
    "targetTtftMs",
    "minTokensPerSecond",
    "rentalMode",
    "reserveRentalMode",
    "asOf",
  ];
  return {
    value: Object.fromEntries(
      keys
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    ) as CalculationInput,
    errors: [],
  };
}

export function createScenario(
  name: string,
  config: AppConfig,
  input: CalculationInput,
  now = new Date(),
): Scenario {
  const title = name.trim();
  if (!title || title.length > 100)
    throw new Error("Название сценария должно содержать от 1 до 100 символов.");
  const parsed = parseInput(input);
  if (!parsed.value) throw new Error(parsed.errors.join(" "));
  const snapshot = JSON.parse(JSON.stringify(config)) as AppConfig;
  const frozenInput = {
    ...parsed.value,
    asOf: input.asOf ?? now.toISOString(),
  };
  calculate(snapshot, frozenInput);
  return {
    version: 1,
    calculatorVersion: CALCULATOR_VERSION,
    id: crypto.randomUUID(),
    name: title,
    createdAt: now.toISOString(),
    input: JSON.parse(JSON.stringify(frozenInput)),
    config: snapshot,
  };
}

export function parseScenario(value: unknown): ParseResult<Scenario> {
  if (!object(value))
    return { value: null, errors: ["Сценарий должен быть объектом."] };
  const errors: string[] = [];
  if (value.version !== 1) errors.push("Неизвестная версия файла сценария.");
  if (value.calculatorVersion !== CALCULATOR_VERSION)
    errors.push(
      `Для воспроизведения этого сценария требуется версия калькулятора ${String(value.calculatorVersion)}. Текущая версия — ${CALCULATOR_VERSION}.`,
    );
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 200)
    errors.push("Некорректный ID сценария.");
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 100
  )
    errors.push("Некорректное название сценария.");
  if (!calculationDate(value.createdAt))
    errors.push("Некорректная дата сценария.");
  const config = parseConfig(value.config);
  const input = parseInput(value.input);
  errors.push(...config.errors, ...input.errors);
  if (errors.length || !config.config || !input.value)
    return { value: null, errors };
  if (!input.value.asOf) input.value.asOf = value.createdAt as string;
  try {
    calculate(config.config, input.value);
  } catch (error) {
    return {
      value: null,
      errors: [
        error instanceof Error
          ? error.message
          : "Не удалось воспроизвести расчёт.",
      ],
    };
  }
  return {
    value: {
      version: 1,
      calculatorVersion: CALCULATOR_VERSION,
      id: value.id as string,
      name: value.name as string,
      createdAt: value.createdAt as string,
      input: input.value,
      config: config.config,
    },
    errors: [],
  };
}

export function readScenarios(raw: string | null): ParseResult<Scenario[]> {
  if (!raw) return { value: [], errors: [] };
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > MAX_SCENARIOS)
      return {
        value: null,
        errors: [`Допускается не более ${MAX_SCENARIOS} сценариев.`],
      };
    const parsed = data.map(parseScenario);
    const errors = parsed.flatMap((item, index) =>
      item.errors.map((error) => `Сценарий ${index + 1}: ${error}`),
    );
    const scenarios = parsed.flatMap((item) =>
      item.value ? [item.value] : [],
    );
    if (new Set(scenarios.map((item) => item.id)).size !== scenarios.length)
      errors.push("Идентификаторы сценариев повторяются.");
    return errors.length
      ? { value: null, errors }
      : { value: scenarios, errors: [] };
  } catch {
    return {
      value: null,
      errors: [
        "Не удалось прочитать сохранённые сценарии. Исходные данные не изменены.",
      ],
    };
  }
}

export function scenarioReport(scenario: Scenario) {
  return { ...scenario, result: calculate(scenario.config, scenario.input) };
}

export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
