"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { calculate, type CalculationInput } from "@/lib/calculator";
import { cloneDefaultConfig, parseConfig, type AppConfig } from "@/lib/config";
import {
  defaultInput,
  downloadJson,
  INPUT_STORAGE_KEY,
  parseInput,
  type Scenario,
} from "@/lib/scenarios";
import { CalculatorControls } from "@/components/calculator-controls";
import { CalculatorResults } from "@/components/calculator-results";
import { ScenarioManager } from "@/components/scenario-manager";

export default function CalculatorPage() {
  const {
    config,
    loaded,
    status,
    error: configError,
    warnings: configWarnings,
  } = useConfig();
  const [input, setInput] = useState<CalculationInput>(() =>
    defaultInput(cloneDefaultConfig()),
  );
  const [snapshot, setSnapshot] = useState<AppConfig | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const activeConfig = snapshot ?? config;

  useEffect(() => {
    if (!loaded || initialized || status === "authentication-required") return;
    let initialInput = defaultInput(config);
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(INPUT_STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (!saved || typeof saved !== "object" || Array.isArray(saved))
          throw new Error("Некорректный формат сохранённого расчёта.");
        const record = saved as Record<string, unknown>;
        const parsed = parseInput(record.input);
        if (!parsed.value) throw new Error(parsed.errors.join(" "));
        if (record.snapshot) {
          const savedConfig = parseConfig(record.snapshot);
          if (!savedConfig.config)
            throw new Error(
              "Не удалось восстановить каталог сохранённого расчёта.",
            );
          setSnapshot(savedConfig.config);
          setSnapshotName(
            typeof record.snapshotName === "string"
              ? record.snapshotName
              : "Сохранённый расчёт",
          );
        }
        initialInput = parsed.value;
      }
    } catch (cause) {
      if (raw) setRecoveryRaw(raw);
      setStorageError(
        `Восстановление расчёта: ${cause instanceof Error ? cause.message : "хранилище недоступно"} Исходные данные не изменены.`,
      );
    }
    setInput(initialInput);
    setInitialized(true);
  }, [loaded, initialized, config, status]);

  useEffect(() => {
    if (!initialized || recoveryRaw) return;
    try {
      localStorage.setItem(
        INPUT_STORAGE_KEY,
        JSON.stringify({ input, snapshot, snapshotName }),
      );
    } catch {
      setStorageError(
        "Не удалось сохранить текущий расчёт в браузере. Вы можете экспортировать его в JSON.",
      );
    }
  }, [initialized, input, snapshot, snapshotName, recoveryRaw]);

  const calculation = useMemo(() => {
    try {
      return { result: calculate(activeConfig, input), error: "" };
    } catch (cause) {
      return {
        result: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Не удалось выполнить расчёт.",
      };
    }
  }, [activeConfig, input]);
  const loadScenario = (scenario: Scenario) => {
    setInput(scenario.input);
    setSnapshot(scenario.config);
    setSnapshotName(scenario.name);
  };
  const useCurrentCatalog = () => {
    setSnapshot(null);
    setSnapshotName("");
    setInput((current) => ({ ...current, asOf: undefined }));
  };

  if (!loaded || (!initialized && status !== "authentication-required"))
    return (
      <main className="page-shell">
        <div className="panel panel-body" role="status">
          Загрузка каталога и сохранённого расчёта…
        </div>
      </main>
    );
  if (status === "authentication-required")
    return (
      <main className="page-shell">
        <div className="panel panel-body">
          <h1>Общий каталог</h1>
          <p>Для доступа к корпоративному каталогу требуется вход.</p>
          <Link className="button primary" href="/settings">
            Войти в настройках
          </Link>
        </div>
      </main>
    );

  if (status === "error" && configError)
    return (
      <main className="page-shell">
        <div className="error-box" role="alert">
          <h1>Каталог недоступен</h1>
          <p>{configError}</p>
          <Link className="button" href="/settings">
            Открыть настройки и восстановление
          </Link>
        </div>
      </main>
    );

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <SlidersHorizontal size={15} />
            Управленческий калькулятор
          </div>
          <h1>GPU-инфраструктура для корпоративных задач</h1>
        </div>
        <p>
          Сопоставьте задачи, профиль нагрузки и оборудование. Сравните покупку
          и аренду, сохраните сценарий с его исходными данными.
        </p>
      </div>
      {configError && (
        <div className="error-box" role="alert">
          {configError} <Link href="/settings">Открыть настройки</Link>
        </div>
      )}
      {!!configWarnings.length && (
        <div className="notice-box" role="status">
          {configWarnings.join(" ")}{" "}
          <Link href="/settings">Проверить каталог</Link>
        </div>
      )}
      {storageError && (
        <div className="error-box" role="alert">
          <p>{storageError}</p>
          {recoveryRaw && (
            <div className="action-row">
              <button
                className="button"
                onClick={() => {
                  try {
                    downloadJson("calculation-recovery.json", {
                      raw: recoveryRaw,
                    });
                  } catch {
                    setStorageError(
                      "Не удалось скачать исходные данные. Они сохранены в хранилище браузера; повторите попытку экспорта.",
                    );
                  }
                }}
              >
                Скачать исходные данные
              </button>
              <button
                className="button"
                onClick={() => {
                  try {
                    localStorage.setItem(
                      `${INPUT_STORAGE_KEY}:recovery`,
                      recoveryRaw,
                    );
                    localStorage.removeItem(INPUT_STORAGE_KEY);
                    setRecoveryRaw(null);
                    setStorageError("");
                    setInput(defaultInput(config));
                    setSnapshot(null);
                  } catch {
                    setStorageError(
                      "Не удалось создать резервную копию. Экспортируйте исходные данные вручную.",
                    );
                  }
                }}
              >
                Создать резервную копию и начать заново
              </button>
            </div>
          )}
        </div>
      )}
      {snapshot && (
        <div className="notice-box snapshot-banner">
          <div>
            <b>Открыт сценарий «{snapshotName}»</b>
            <p>
              Каталог {snapshot.catalogVersion}, ревизия {snapshot.revision}.
              Источники проверяются на дату{" "}
              {new Date(input.asOf ?? snapshot.updatedAt).toLocaleDateString(
                "ru-RU",
              )}
              .
            </p>
          </div>
          <button className="button" onClick={useCurrentCatalog}>
            Пересчитать по текущему каталогу
          </button>
        </div>
      )}
      <div className="workspace-grid">
        <CalculatorControls
          config={activeConfig}
          input={input}
          onChange={(patch) =>
            setInput((current) => ({ ...current, ...patch }))
          }
        />
        {calculation.result ? (
          <CalculatorResults
            config={activeConfig}
            input={input}
            result={calculation.result}
          />
        ) : (
          <div className="error-box" role="alert">
            <b>Расчёт невозможен</b>
            <p>{calculation.error}</p>
            <button
              className="button"
              onClick={() => setInput(defaultInput(activeConfig))}
            >
              Восстановить параметры расчёта
            </button>
          </div>
        )}
      </div>
      <ScenarioManager
        config={activeConfig}
        input={input}
        onLoad={loadScenario}
        disabled={!calculation.result}
      />
      <footer className="footer-note">
        <span>
          Предварительная оценка. Статус источников и измерений приведён в
          деталях результата.
        </span>
        <span>
          Каталог {activeConfig.catalogVersion} · ревизия{" "}
          {activeConfig.revision} ·{" "}
          {new Date(activeConfig.updatedAt).toLocaleDateString("ru-RU")}
        </span>
      </footer>
    </main>
  );
}
