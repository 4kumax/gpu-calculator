"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Save, Upload } from "lucide-react";
import { calculate, compactRub, type CalculationInput } from "@/lib/calculator";
import { type AppConfig } from "@/lib/config";
import {
  CALCULATOR_VERSION,
  createScenario,
  downloadJson,
  MAX_SCENARIOS,
  migrateScenario,
  parseScenario,
  readScenarios,
  SCENARIO_STORAGE_KEY,
  scenarioReport,
  type Scenario,
} from "@/lib/scenarios";

export function ScenarioManager({
  config,
  input,
  onLoad,
  disabled,
  defaultName = "",
}: {
  config: AppConfig;
  input: CalculationInput;
  onLoad: (scenario: Scenario) => void;
  disabled?: boolean;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Scenario | null>(null);
  const [ready, setReady] = useState(false);
  const [pendingMigration, setPendingMigration] = useState<Scenario | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
        const parsed = readScenarios(raw);
        if (!parsed.value) {
          setRecovery(raw);
          setError(parsed.errors.join(" "));
        } else {
          setScenarios(parsed.value);
          setRecovery(null);
          setError("");
        }
      } catch {
        setError("Браузер запретил доступ к сохранённым сценариям.");
      }
      setReady(true);
    };
    load();
    const sync = (event: StorageEvent) => {
      if (event.key === SCENARIO_STORAGE_KEY || event.key === null) load();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const commit = async (change: (current: Scenario[]) => Scenario[]) => {
    const operation = () => {
      const current = readScenarios(localStorage.getItem(SCENARIO_STORAGE_KEY));
      if (!current.value)
        throw new Error(
          "Сначала восстановите повреждённое хранилище сценариев. Его данные не были перезаписаны.",
        );
      const next = change(current.value);
      if (next.length > MAX_SCENARIOS)
        throw new Error(
          `Можно сохранить до ${MAX_SCENARIOS} сценариев. Экспортируйте и удалите лишние.`,
        );
      localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(next));
      setScenarios(next);
    };
    try {
      if (navigator.locks)
        await navigator.locks.request(SCENARIO_STORAGE_KEY, operation);
      else operation();
      setError("");
      return true;
    } catch (cause) {
      setMessage("");
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить сценарий.",
      );
      return false;
    }
  };
  const save = async () => {
    try {
      const scenario = createScenario(name, config, input);
      if (await commit((current) => [...current, scenario])) {
        setMessage(
          `Сценарий «${scenario.name}» сохранён вместе с каталогом и допущениями.`,
        );
        setName("");
        setSelected((current) => [...current.slice(0, 3), scenario.id]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить сценарий.",
      );
    }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Файл сценария превышает 5 МБ.");
      const raw: unknown = JSON.parse(await file.text());
      const parsed = parseScenario(raw);
      if (!parsed.value) {
        const migrated = migrateScenario(raw);
        if (migrated.value) {
          setPendingMigration(migrated.value);
          setError("");
          return;
        }
        throw new Error(parsed.errors.join(" "));
      }
      const scenario = parsed.value;
      if (
        await commit((current) => {
          if (current.some((item) => item.id === scenario.id))
            throw new Error(
              "Этот сценарий уже сохранён. Импорт не изменил существующий расчёт.",
            );
          return [...current, scenario];
        })
      ) {
        setMessage(`Импортирован сценарий «${scenario.name}».`);
        setSelected((current) => [...current.slice(0, 3), scenario.id]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось прочитать сценарий.",
      );
    }
  };
  const compared = useMemo(
    () =>
      scenarios
        .filter((item) => selected.includes(item.id))
        .map((scenario) => ({
          scenario,
          result: calculate(scenario.config, scenario.input),
        })),
    [scenarios, selected],
  );
  const exportJson = (filename: string, value: unknown) => {
    try {
      downloadJson(filename, value);
    } catch {
      setError("Браузер не смог выгрузить файл. Исходные данные сохранены.");
    }
  };
  return (
    <section
      className="panel panel-body scenario-manager"
      aria-labelledby="scenarios-title"
    >
      <div className="card-title-row">
        <div>
          <h2 id="scenarios-title">Сохранённые варианты</h2>
          <p className="help-text">
            Сохраните вариант с текущими ценами или сравните несколько решений.
          </p>
        </div>
        <span>
          {scenarios.length}/{MAX_SCENARIOS}
        </span>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-box" role="status">
          {message}
        </div>
      )}
      {pendingMigration && (
        <div className="notice-box" role="status">
          <p>
            Файл создан прежней версией алгоритма. Можно сохранить новый
            пересчёт «{pendingMigration.name}». Исходный файл останется без
            изменений; результаты могут отличаться.
          </p>
          <div className="action-row">
            <button
              className="button primary"
              onClick={async () => {
                if (await commit((current) => [...current, pendingMigration])) {
                  setMessage(
                    "Сохранён отдельный пересчёт по обновлённому алгоритму.",
                  );
                  setPendingMigration(null);
                }
              }}
            >
              Сохранить пересчёт
            </button>
            <button
              className="button"
              onClick={() => setPendingMigration(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {recovery && (
        <div className="action-row">
          <button
            className="button"
            onClick={async () => {
              const operation = () => {
                const original = localStorage.getItem(SCENARIO_STORAGE_KEY);
                if (original !== recovery)
                  throw new Error(
                    "Список изменился в другой вкладке. Обновите страницу перед пересчётом.",
                  );
                const list: unknown = JSON.parse(recovery);
                if (!Array.isArray(list) || list.length > MAX_SCENARIOS)
                  throw new Error(
                    "Данные не являются списком сценариев прежней версии.",
                  );
                let count = 0;
                const migrated = list.map((item) => {
                  const current = parseScenario(item);
                  if (current.value) return current.value;
                  const updated = migrateScenario(item);
                  if (!updated.value) throw new Error(updated.errors.join(" "));
                  count++;
                  return updated.value;
                });
                if (!count)
                  throw new Error("Сценариев прежней версии не найдено.");
                const checked = readScenarios(JSON.stringify(migrated));
                if (!checked.value) throw new Error(checked.errors.join(" "));
                localStorage.setItem(
                  `${SCENARIO_STORAGE_KEY}:before-v${CALCULATOR_VERSION}:${Date.now()}`,
                  recovery,
                );
                localStorage.setItem(
                  SCENARIO_STORAGE_KEY,
                  JSON.stringify(checked.value),
                );
                setScenarios(checked.value);
                setSelected([]);
                setRecovery(null);
                setError("");
                setMessage(
                  `Пересчитано сценариев: ${count}. Исходная библиотека сохранена отдельной резервной копией в браузере.`,
                );
              };
              try {
                if (navigator.locks)
                  await navigator.locks.request(
                    SCENARIO_STORAGE_KEY,
                    operation,
                  );
                else operation();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Не удалось пересчитать сценарии. Исходный список сохранён.",
                );
              }
            }}
          >
            Пересчитать старые сценарии с резервной копией
          </button>
          <button
            className="button"
            onClick={() =>
              exportJson("scenario-storage-recovery.json", { raw: recovery })
            }
          >
            Скачать исходные данные для восстановления
          </button>
          <button
            className="button"
            onClick={() => {
              try {
                localStorage.setItem(
                  `${SCENARIO_STORAGE_KEY}:recovery`,
                  recovery,
                );
                localStorage.setItem(SCENARIO_STORAGE_KEY, "[]");
                setScenarios([]);
                setSelected([]);
                setRecovery(null);
                setError("");
                setMessage(
                  "Исходные данные скопированы в резервную копию. Можно сохранять новые сценарии.",
                );
              } catch {
                setError(
                  "Не удалось создать резервную копию. Исходный список не изменён.",
                );
              }
            }}
          >
            Создать резервную копию и очистить список
          </button>
        </div>
      )}
      <div className="scenario-actions">
        <label className="field">
          <span>Название нового сценария</span>
          <input
            className="control"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Пилот, 8 пользователей"
          />
        </label>
        <button
          className="button primary"
          disabled={!ready || disabled || !name.trim() || !!recovery}
          onClick={save}
        >
          <Save size={15} />
          Сохранить сценарий
        </button>
        <button
          className="button"
          disabled={disabled}
          onClick={() => {
            try {
              downloadJson(
                "gpu-calculation.json",
                scenarioReport(
                  createScenario(
                    name.trim() || "Текущий расчёт",
                    config,
                    input,
                  ),
                ),
              );
              setMessage(
                "Экспортированы параметры, каталог и полный результат расчёта.",
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Не удалось экспортировать расчёт.",
              );
            }
          }}
        >
          <Download size={15} />
          Экспорт расчёта
        </button>
        <button
          className="button"
          disabled={!ready || !!recovery}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} />
          Импорт сценария
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = "";
          }}
        />
      </div>
      {!!scenarios.length && (
        <div className="table-scroll">
          <table className="comparison-table">
            <caption>Выберите до четырёх сценариев для сравнения</caption>
            <thead>
              <tr>
                <th>Сравнить</th>
                <th>Сценарий</th>
                <th>Дата / каталог</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Сравнить ${scenario.name}`}
                      checked={selected.includes(scenario.id)}
                      disabled={
                        !selected.includes(scenario.id) && selected.length >= 4
                      }
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, scenario.id]
                            : current.filter((id) => id !== scenario.id),
                        )
                      }
                    />
                  </td>
                  <th scope="row">{scenario.name}</th>
                  <td>
                    {new Date(scenario.createdAt).toLocaleDateString("ru-RU")}
                    <br />
                    {scenario.config.catalogVersion} · рев.{" "}
                    {scenario.config.revision}
                  </td>
                  <td>
                    <div className="action-row">
                      <button
                        className="button"
                        onClick={() => {
                          onLoad(scenario);
                          setMessage(
                            `Открыт «${scenario.name}» с сохранёнными ценами.`,
                          );
                        }}
                      >
                        Открыть
                      </button>
                      <button
                        className="button"
                        onClick={() =>
                          exportJson(
                            `gpu-scenario-${scenario.id}.json`,
                            scenarioReport(scenario),
                          )
                        }
                      >
                        JSON
                      </button>
                      <button
                        className="button danger"
                        onClick={async () => {
                          if (
                            await commit((current) =>
                              current.filter((item) => item.id !== scenario.id),
                            )
                          ) {
                            setRemoved(scenario);
                            setSelected((current) =>
                              current.filter((id) => id !== scenario.id),
                            );
                            setMessage(
                              `Сценарий «${scenario.name}» удалён. Его можно восстановить кнопкой ниже.`,
                            );
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removed && (
        <button
          className="button"
          onClick={async () => {
            if (
              await commit((current) =>
                current.some((item) => item.id === removed.id)
                  ? current
                  : [...current, removed],
              )
            ) {
              setRemoved(null);
              setMessage("Сценарий восстановлен.");
            }
          }}
        >
          Восстановить «{removed.name}»
        </button>
      )}
      {!!compared.length && (
        <div className="table-scroll">
          <table className="comparison-table scenario-comparison">
            <caption>
              Результаты на сохранённых параметрах каждого сценария
            </caption>
            <thead>
              <tr>
                <th>Показатель</th>
                {compared.map(({ scenario }) => (
                  <th key={scenario.id}>{scenario.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Модель / GPU</th>
                {compared.map(({ scenario, result }) => (
                  <td key={scenario.id}>
                    {result.model.name}
                    <br />
                    {result.gpuCount} × {result.gpu.name}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Нагрузка / срок</th>
                {compared.map(({ scenario }) => (
                  <td key={scenario.id}>
                    {scenario.input.concurrency} запросов ·{" "}
                    {scenario.input.hoursMonth} ч/мес.
                    <br />
                    {scenario.input.years} лет
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Покупка</th>
                {compared.map(({ scenario, result }) => (
                  <td key={scenario.id}>{compactRub(result.buyTco)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Аренда</th>
                {compared.map(({ scenario, result }) => (
                  <td key={scenario.id}>{compactRub(result.rentTco)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Основание</th>
                {compared.map(({ scenario, result }) => (
                  <td key={scenario.id}>
                    {!result.selectionValid
                      ? "Требования не выполнены"
                      : result.confidence === "measured"
                        ? "Есть измерения"
                        : "Предварительная оценка"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
