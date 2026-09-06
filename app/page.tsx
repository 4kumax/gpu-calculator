"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Download,
  FolderOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { useTaskSelection } from "@/hooks/use-task-selection";
import { compareDeployments, type ComparisonRow } from "@/lib/comparison";
import { calculate } from "@/lib/calculator";
import {
  calculationDefaults,
  createScenario,
  downloadJson,
  parseScenario,
  scenarioReport,
  type Scenario,
} from "@/lib/scenarios";
import { ExecutiveComparison } from "@/components/executive-comparison";
import { ScenarioManager } from "@/components/scenario-manager";
import { TaskSelector } from "@/components/task-selector";

const VIEW_STORAGE_KEY = "gpu-calculator:executive-view:v4";
type SelectedChoice = { id: string; scope: string };

export default function CalculatorPage() {
  const store = useConfig();
  const taskSelection = useTaskSelection(
    store.config,
    store.loaded &&
      store.status !== "authentication-required" &&
      store.status !== "error",
  );
  const [choice, setChoice] = useState<SelectedChoice | null>(null);
  const [snapshot, setSnapshot] = useState<Scenario | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const savedRef = useRef<HTMLDetailsElement>(null);
  const activeConfig = snapshot?.config ?? store.config;
  const input = useMemo(
    () =>
      snapshot?.input ?? {
        ...calculationDefaults(store.config),
        taskIds: taskSelection.taskIds,
      },
    [snapshot, store.config, taskSelection.taskIds],
  );
  // A manual comparison belongs to one exact task set, workload and catalogue.
  // Changing those inputs must never keep a previously suitable model selected.
  const scope = useMemo(
    () =>
      JSON.stringify({
        input: { ...input, taskIds: [...input.taskIds].sort() },
        config: activeConfig,
        snapshotId: snapshot?.id,
      }),
    [input, activeConfig, snapshot?.id],
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
        if (
          typeof data.selectedId === "string" &&
          typeof data.selectionScope === "string"
        )
          setChoice({ id: data.selectedId, scope: data.selectionScope });
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
      !taskSelection.loaded ||
      taskSelection.error ||
      !snapshot ||
      JSON.stringify([...snapshot.input.taskIds].sort()) ===
        JSON.stringify([...taskSelection.taskIds].sort())
    )
      return;
    setSnapshot(null);
    setChoice(null);
    setMessage(
      "Выбор задач изменён. Расчёт использует текущие параметры; сохранённый вариант остался без изменений.",
    );
  }, [
    initialized,
    taskSelection.loaded,
    taskSelection.error,
    taskSelection.taskIds,
    snapshot,
  ]);

  useEffect(() => {
    if (
      !initialized ||
      !taskSelection.loaded ||
      taskSelection.error ||
      recovery ||
      store.status === "error" ||
      store.status === "authentication-required"
    )
      return;
    try {
      const activeChoice = choice?.scope === scope ? choice : null;
      localStorage.setItem(
        VIEW_STORAGE_KEY,
        JSON.stringify({
          selectedId: activeChoice?.id ?? null,
          selectionScope: activeChoice?.scope ?? null,
          snapshot,
        }),
      );
    } catch {
      setError(
        "Выбор не удалось сохранить в браузере. Экспортируйте расчёт, чтобы сохранить его.",
      );
    }
  }, [
    initialized,
    taskSelection.loaded,
    taskSelection.error,
    choice,
    scope,
    snapshot,
    recovery,
    store.status,
  ]);

  const calculation = useMemo(() => {
    if (!input.taskIds.length)
      return { comparison: null, preferred: null, error: "" };
    try {
      const matrix = compareDeployments(activeConfig, input);
      for (const [kind, id, items] of [
        ["Модель", input.modelId, activeConfig.models],
        ["GPU", input.gpuId, activeConfig.gpus],
      ] as const) {
        if (
          id !== "auto" &&
          !items.some((item) => item.enabled && item.id === id)
        )
          throw new Error(
            `${kind} «${id}» из параметров расчёта недоступна. Выберите доступный вариант или автоматический подбор в Параметрах.`,
          );
      }
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
    (choice?.scope === scope
      ? comparison?.rows.find((row) => row.id === choice.id && row.result)
      : null) ??
    calculation.preferred ??
    comparison?.recommended ??
    null;
  const finalInput = selected
    ? { ...input, modelId: selected.model.id, gpuId: selected.gpu.id }
    : input;
  const taskTitles = activeConfig.tasks
    .filter((task) => input.taskIds.includes(task.id))
    .map((task) => task.title);
  const scenarioName =
    snapshot?.name ??
    (taskTitles.length === 1
      ? taskTitles[0]
      : `Расчёт для ${input.taskIds.length} задач`);
  const changeTasks = (ids: string[]) => {
    if (!taskSelection.setTaskIds(ids)) return;
    if (snapshot)
      setMessage(
        "Выбор перенесён в текущий каталог. Сохранённый вариант остался без изменений.",
      );
    setSnapshot(null);
    setChoice(null);
  };
  const loadSnapshot = (scenario: Scenario) => {
    if (!taskSelection.setTaskIds(scenario.input.taskIds)) return;
    setSnapshot(scenario);
    setChoice(null);
    setMessage("");
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
          <p>Войдите, чтобы выбрать задачи и сравнить варианты.</p>
          <Link className="button primary" href="/settings">
            Войти в настройках
          </Link>
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
  if (!store.loaded || !initialized || !taskSelection.loaded)
    return (
      <main className="executive-shell">
        <div className="empty-state" role="status">
          Загрузка задач…
        </div>
      </main>
    );

  return (
    <main className="executive-shell">
      <header className="executive-page-heading">
        <div>
          <span className="page-kicker">ПЛАНИРОВАНИЕ ИНФРАСТРУКТУРЫ</span>
          <h1>ИИ для вашего бизнеса</h1>
          <p>Выберите задачи. Сравните подходящие модели, GPU и стоимость.</p>
        </div>
        <Link className="settings-shortcut" href="/settings">
          <SlidersHorizontal size={16} />
          Параметры
        </Link>
      </header>
      {(error || taskSelection.error) && (
        <div className="error-box" role="alert">
          <p>{error || taskSelection.error}</p>
          {taskSelection.error && (
            <Link href="/settings">Восстановить выбор в Параметрах</Link>
          )}
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
                    setSnapshot(null);
                    setChoice(null);
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
      {snapshot && (
        <div className="snapshot-context">
          <span>
            Открыт сохранённый вариант «{snapshot.name}» со своими параметрами и
            ценами.
          </span>
          <button
            className="text-button"
            onClick={() => changeTasks(snapshot.input.taskIds)}
          >
            Продолжить по текущим параметрам
          </button>
        </div>
      )}
      {message && (
        <p className="help-text" role="status">
          {message}
        </p>
      )}
      <TaskSelector
        tasks={activeConfig.tasks}
        selectedIds={input.taskIds}
        onChange={changeTasks}
      />
      <div className="scenario-context">
        <div>
          <h2>
            {snapshot
              ? snapshot.name
              : `Выбрано задач: ${input.taskIds.length}`}
          </h2>
          <span>
            {snapshot
              ? "Сохранённые параметры и цены"
              : `Единый расчёт · ${input.years * 12} месяцев · модель должна подходить для всех задач`}
          </span>
        </div>
        <div className="context-actions">
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
      {!input.taskIds.length ? (
        <div className="empty-state task-empty">
          <h2>Выберите задачи для сравнения</h2>
          <p>
            Подбор модели и расчёт стоимости появятся после выбора хотя бы одной
            задачи.
          </p>
        </div>
      ) : comparison ? (
        <ExecutiveComparison
          key={scope}
          config={activeConfig}
          input={input}
          comparison={comparison}
          selected={selected}
          onSelect={(row: ComparisonRow) => setChoice({ id: row.id, scope })}
        />
      ) : (
        <div className="error-box" role="alert">
          <p>{calculation.error}</p>
          <Link href="/settings">Проверить параметры расчёта</Link>
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
          onLoad={loadSnapshot}
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
