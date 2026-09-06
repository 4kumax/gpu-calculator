"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { compareDeployments, type ComparisonRow } from "@/lib/comparison";
import { calculate } from "@/lib/calculator";
import {
  createScenario,
  downloadJson,
  parseScenario,
  scenarioInput,
  scenarioReport,
  type Scenario,
} from "@/lib/scenarios";
import { ExecutiveComparison } from "@/components/executive-comparison";
import { ScenarioManager } from "@/components/scenario-manager";

const VIEW_STORAGE_KEY = "gpu-calculator:executive-view:v4";

export default function CalculatorPage() {
  const store = useConfig();
  const [presetId, setPresetId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Scenario | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const savedRef = useRef<HTMLDetailsElement>(null);
  const activeConfig = snapshot?.config ?? store.config;
  const presets = store.config.scenarioPresets.filter(
    (preset) => preset.enabled,
  );
  const activePreset =
    presets.find((preset) => preset.id === presetId) ??
    presets.find((preset) => preset.id === store.config.defaultScenarioId) ??
    presets[0];
  const input = useMemo(
    () =>
      snapshot?.input ??
      scenarioInput(
        store.config,
        activePreset?.id ?? store.config.defaultScenarioId,
      ),
    [snapshot, store.config, activePreset?.id],
  );

  useEffect(() => {
    if (
      !store.loaded ||
      store.status === "authentication-required" ||
      initialized
    )
      return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Не удалось прочитать сохранённый выбор.");
        const data = value as Record<string, unknown>;
        if (typeof data.presetId === "string") setPresetId(data.presetId);
        if (typeof data.selectedId === "string") setSelectedId(data.selectedId);
        if (data.snapshot) {
          const parsed = parseScenario(data.snapshot);
          if (!parsed.value) throw new Error(parsed.errors.join(" "));
          setSnapshot(parsed.value);
        }
      }
    } catch (cause) {
      setRecovery(raw);
      setError(
        cause instanceof Error
          ? cause.message
          : "Хранилище браузера недоступно.",
      );
    }
    setInitialized(true);
  }, [store.loaded, store.status, initialized]);

  useEffect(() => {
    if (
      !initialized ||
      recovery ||
      store.status === "error" ||
      store.status === "authentication-required"
    )
      return;
    try {
      localStorage.setItem(
        VIEW_STORAGE_KEY,
        JSON.stringify({ presetId, selectedId, snapshot }),
      );
    } catch {
      setError(
        "Выбор не удалось сохранить в браузере. Экспортируйте расчёт, чтобы сохранить его.",
      );
    }
  }, [initialized, presetId, selectedId, snapshot, recovery, store.status]);

  const calculation = useMemo(() => {
    try {
      const matrix = compareDeployments(activeConfig, input);
      const fixed =
        input.modelId !== "auto" || input.gpuId !== "auto"
          ? calculate(activeConfig, input)
          : null;
      const preferred = fixed
        ? (matrix.rows.find(
            (row) =>
              row.model.id === fixed.model.id && row.gpu.id === fixed.gpu.id,
          ) ?? null)
        : null;
      return { comparison: matrix, preferred, error: "" };
    } catch (cause) {
      return {
        comparison: null,
        preferred: null,
        error: cause instanceof Error ? cause.message : "Расчёт недоступен.",
      };
    }
  }, [activeConfig, input]);
  const comparison = calculation.comparison;
  const selected =
    comparison?.rows.find((row) => row.id === selectedId && row.result) ??
    calculation.preferred ??
    comparison?.recommended ??
    comparison?.modelRows.find((row) => row.result) ??
    null;
  const finalInput = selected
    ? { ...input, modelId: selected.model.id, gpuId: selected.gpu.id }
    : input;
  const scenarioName = snapshot?.name ?? activePreset?.title ?? "Расчёт";
  const choosePreset = (id: string) => {
    setPresetId(id);
    setSnapshot(null);
    setSelectedId(null);
  };
  const exportCalculation = () => {
    try {
      downloadJson(
        "gpu-decision.json",
        scenarioReport(createScenario(scenarioName, activeConfig, finalInput)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось экспортировать расчёт.",
      );
    }
  };

  if (store.status === "authentication-required")
    return (
      <main className="executive-shell">
        <div className="empty-state">
          <h1>Общий каталог</h1>
          <p>Войдите, чтобы открыть сценарии и сравнить варианты.</p>
          <Link className="button primary" href="/settings">
            Войти в настройках
          </Link>
        </div>
      </main>
    );
  if (!store.loaded || !initialized)
    return (
      <main className="executive-shell">
        <div className="empty-state" role="status">
          Загрузка сценариев…
        </div>
      </main>
    );
  if (store.status === "error" && store.error)
    return (
      <main className="executive-shell">
        <div className="error-box" role="alert">
          <h1>Каталог недоступен</h1>
          <p>{store.error}</p>
          <Link href="/settings">Открыть параметры и восстановление</Link>
        </div>
      </main>
    );

  return (
    <main className="executive-shell">
      <header className="executive-page-heading">
        <div>
          <span className="page-kicker">ПЛАНИРОВАНИЕ ИНФРАСТРУКТУРЫ</span>
          <h1>ИИ для вашего бизнеса</h1>
          <p>Выберите сценарий. Сравните модели, оборудование и стоимость.</p>
        </div>
        <Link className="settings-shortcut" href="/settings">
          <SlidersHorizontal size={16} />
          Параметры
        </Link>
      </header>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          {recovery && (
            <div className="action-row">
              <button
                className="button"
                onClick={() => {
                  try {
                    downloadJson("gpu-view-recovery.json", { raw: recovery });
                  } catch {
                    setError(
                      "Не удалось экспортировать данные. Исходные данные сохранены.",
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
                      `${VIEW_STORAGE_KEY}:recovery`,
                      recovery,
                    );
                    localStorage.removeItem(VIEW_STORAGE_KEY);
                    setRecovery(null);
                    setError("");
                    setPresetId("");
                    setSnapshot(null);
                    setSelectedId(null);
                  } catch {
                    setError("Не удалось создать резервную копию.");
                  }
                }}
              >
                Создать копию и восстановить выбор
              </button>
            </div>
          )}
        </div>
      )}

      <section
        className="business-scenarios"
        aria-labelledby="business-scenarios-title"
      >
        <div className="section-eyebrow">
          <h2 id="business-scenarios-title">Ваш сценарий</h2>
          <span>Параметры уже заданы</span>
        </div>
        <div className="preset-grid">
          {presets.map((preset, index) => {
            const active = !snapshot && activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                className={`preset-card ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() => choosePreset(preset.id)}
              >
                <span className="preset-top">
                  <span className="preset-number">0{index + 1}</span>
                  <span className="preset-check">
                    {active && <Check size={13} />}
                  </span>
                </span>
                <strong>{preset.title}</strong>
                <span className="preset-description">{preset.description}</span>
                <span className="preset-period">
                  {preset.input.years * 12} месяцев ·{" "}
                  {preset.input.reserveMode === "nplus1"
                    ? "с резервом"
                    : "без резерва"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="scenario-context">
        <div>
          <h2>{scenarioName}</h2>
          <span>
            {snapshot
              ? "Сохранённые параметры и цены"
              : "Все варианты рассчитаны на одинаковой нагрузке"}
          </span>
        </div>
        <div className="context-actions">
          {snapshot && (
            <button
              className="text-button"
              onClick={() => {
                setSnapshot(null);
                setSelectedId(null);
              }}
            >
              К текущим сценариям
            </button>
          )}
          <button
            className="text-button"
            disabled={!selected?.result}
            onClick={() => {
              if (savedRef.current) {
                savedRef.current.open = true;
                savedRef.current.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }
            }}
          >
            <FolderOpen size={14} />
            Сохранить вариант
          </button>
          <button
            className="text-button"
            disabled={!selected?.result}
            onClick={exportCalculation}
          >
            <Download size={14} />
            Экспорт
          </button>
        </div>
      </div>

      {comparison ? (
        <ExecutiveComparison
          config={activeConfig}
          input={input}
          comparison={comparison}
          selected={selected}
          onSelect={(row: ComparisonRow) => setSelectedId(row.id)}
        />
      ) : (
        <div className="error-box" role="alert">
          <p>{calculation.error}</p>
          <Link href="/settings">Проверить параметры сценария</Link>
        </div>
      )}

      <details className="saved-workspace quiet-details" ref={savedRef}>
        <summary>
          Сохранённые варианты и сравнение сценариев <ChevronDown size={16} />
        </summary>
        <ScenarioManager
          config={activeConfig}
          input={finalInput}
          defaultName={scenarioName}
          onLoad={(scenario) => {
            setSnapshot(scenario);
            setSelectedId(null);
          }}
          disabled={!selected?.result}
        />
      </details>

      {!!store.warnings.length && (
        <details className="catalog-notes quiet-details">
          <summary>
            Обновление каталога <ChevronDown size={14} />
          </summary>
          <ul>
            {store.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <Link href="/settings">
            Проверить параметры <ArrowUpRight size={12} />
          </Link>
        </details>
      )}
      <footer className="executive-footer">
        <span>
          Плановая стоимость в рублях. Источники и допущения доступны в деталях.
        </span>
        <span>Каталог {activeConfig.catalogVersion}</span>
      </footer>
    </main>
  );
}
