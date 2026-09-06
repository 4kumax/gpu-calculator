"use client";

import { Check } from "lucide-react";
import { type AppConfig } from "@/lib/config";
import { type CalculationInput } from "@/lib/calculator";
import { NumberField } from "./number-field";

export function CalculatorControls({
  config,
  input,
  onChange,
}: {
  config: AppConfig;
  input: CalculationInput;
  onChange: (patch: Partial<CalculationInput>) => void;
}) {
  const tasks = config.tasks.filter((task) => task.enabled);
  const staleTasks = input.taskIds.filter(
    (id) => !tasks.some((task) => task.id === id),
  );
  return (
    <section className="stack" aria-label="Параметры расчёта">
      <div className="panel panel-body">
        <div className="panel-head">
          <span className="step">1</span>
          <div>
            <h2>Задачи</h2>
            <p>Требования к качеству, контексту и возможностям</p>
          </div>
        </div>
        {!!staleTasks.length && (
          <div className="error-box">
            <p>
              В каталоге недоступны выбранные задачи: {staleTasks.join(", ")}.
            </p>
            <button
              className="button"
              onClick={() =>
                onChange({
                  taskIds: input.taskIds.filter(
                    (id) => !staleTasks.includes(id),
                  ),
                })
              }
            >
              Убрать недоступные задачи
            </button>
          </div>
        )}
        <div className="task-grid">
          {tasks.map((task) => {
            const active = input.taskIds.includes(task.id);
            return (
              <button
                type="button"
                key={task.id}
                className={`task-card ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    taskIds: active
                      ? input.taskIds.filter((id) => id !== task.id)
                      : [...input.taskIds, task.id],
                  })
                }
              >
                <span>
                  <span className="task-title">{task.title}</span>
                  <span className="task-desc">{task.description}</span>
                  <span className="task-category">{task.category}</span>
                </span>
                <span className="check-box" aria-hidden="true">
                  {active && <Check size={13} />}
                </span>
              </button>
            );
          })}
        </div>
        {!input.taskIds.length && (
          <p className="help-text">
            Задачи не выбраны. Будет рассчитан свободный сценарий без требований
            к качеству.
          </p>
        )}
      </div>

      <div className="panel panel-body">
        <div className="panel-head">
          <span className="step">2</span>
          <div>
            <h2>Модель и профиль нагрузки</h2>
            <p>Подбор учитывает доступные профили запуска</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Модель</span>
            <select
              className="control"
              value={input.modelId}
              onChange={(event) => onChange({ modelId: event.target.value })}
            >
              <option value="auto">Автовыбор</option>
              {input.modelId !== "auto" &&
                !config.models.some(
                  (model) => model.enabled && model.id === input.modelId,
                ) && (
                  <option value={input.modelId}>
                    Недоступная модель: {input.modelId}
                  </option>
                )}
              {config.models
                .filter((model) => model.enabled)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Ускоритель</span>
            <select
              className="control"
              value={input.gpuId}
              onChange={(event) => onChange({ gpuId: event.target.value })}
            >
              <option value="auto">Автовыбор по профилям</option>
              {input.gpuId !== "auto" &&
                !config.gpus.some(
                  (gpu) => gpu.enabled && gpu.id === input.gpuId,
                ) && (
                  <option value={input.gpuId}>
                    Недоступный GPU: {input.gpuId}
                  </option>
                )}
              {config.gpus
                .filter((gpu) => gpu.enabled)
                .map((gpu) => (
                  <option key={gpu.id} value={gpu.id}>
                    {gpu.vendor} {gpu.name}
                  </option>
                ))}
            </select>
            <small>
              При выборе GPU модели сравниваются на этом ускорителе.
            </small>
          </label>
          <NumberField
            label="Пиковые одновременные запросы"
            value={input.concurrency}
            min={1}
            max={10000}
            onChange={(concurrency) => onChange({ concurrency })}
          />
          <NumberField
            label="Доля нагрузки на модель, %"
            value={input.largeModelSharePct}
            min={0.001}
            max={100}
            step={0.1}
            onChange={(largeModelSharePct) => onChange({ largeModelSharePct })}
            hint="Стоимость остальных маршрутов не входит в этот расчёт."
          />
          <NumberField
            label="Длина входа, токенов"
            value={input.inputTokens ?? 0}
            onChange={(inputTokens) => onChange({ inputTokens })}
            hint="0 — использовать контекст, необходимый для выбранных задач."
          />
          <NumberField
            label="Длина ответа, токенов"
            value={input.outputTokens ?? 1024}
            min={1}
            onChange={(outputTokens) => onChange({ outputTokens })}
          />
          <NumberField
            label="Первый токен не позднее, мс"
            value={input.targetTtftMs ?? 0}
            onChange={(targetTtftMs) => onChange({ targetTtftMs })}
            hint="0 — без ограничения. Подтверждение требует измеренного профиля."
          />
          <NumberField
            label="Скорость ответа не ниже, токенов/с"
            value={input.minTokensPerSecond ?? 0}
            max={1000000}
            step={0.1}
            onChange={(minTokensPerSecond) => onChange({ minTokensPerSecond })}
            hint="0 — без ограничения."
          />
          <label className="field full">
            <span>Приоритет</span>
            <select
              className="control"
              value={input.priority}
              onChange={(event) =>
                onChange({
                  priority: event.target.value as CalculationInput["priority"],
                })
              }
            >
              <option value="balance">
                Минимально достаточное качество, затем стоимость
              </option>
              <option value="cost">Минимальная совокупная стоимость</option>
              <option value="quality">
                Максимальный класс качества, затем стоимость
              </option>
            </select>
            <small>
              Класс качества — оценка каталога. Результаты проверок на ваших
              задачах показаны отдельно.
            </small>
          </label>
        </div>
      </div>

      <div className="panel panel-body">
        <div className="panel-head">
          <span className="step">3</span>
          <div>
            <h2>Экономика и резерв</h2>
            <p>Условия покупки и аренды на одном горизонте</p>
          </div>
        </div>
        <div className="form-grid">
          <NumberField
            label="Работа под нагрузкой, ч/мес."
            value={input.hoursMonth}
            max={720}
            step={0.1}
            onChange={(hoursMonth) => onChange({ hoursMonth })}
          />
          <NumberField
            label="Горизонт расчёта, лет"
            value={input.years}
            min={1}
            max={5}
            onChange={(years) => onChange({ years })}
          />
          <label className="field">
            <span>Резервирование</span>
            <select
              className="control"
              value={input.reserveMode}
              onChange={(event) =>
                onChange({
                  reserveMode: event.target
                    .value as CalculationInput["reserveMode"],
                })
              }
            >
              <option value="none">Без резерва</option>
              <option value="nplus1">N+1 серверный узел</option>
            </select>
          </label>
          <label className="field">
            <span>Условия аренды</span>
            <select
              className="control"
              value={input.rentalMode ?? "gpu-hour"}
              onChange={(event) =>
                onChange({
                  rentalMode: event.target
                    .value as CalculationInput["rentalMode"],
                })
              }
            >
              <option value="gpu-hour">GPU по часам использования</option>
              <option value="dedicated-node">
                Выделенные узлы, 720 ч/мес.
              </option>
            </select>
            <small>
              Тариф узла рассчитан из ставки GPU-часа и числа GPU в узле.
            </small>
          </label>
          {input.reserveMode === "nplus1" && (
            <label className="field full">
              <span>Оплата резервного узла в аренде</span>
              <select
                className="control"
                value={input.reserveRentalMode ?? "always-on"}
                onChange={(event) =>
                  onChange({
                    reserveRentalMode: event.target
                      .value as CalculationInput["reserveRentalMode"],
                  })
                }
              >
                <option value="always-on">Постоянный резерв, 720 ч/мес.</option>
                <option value="active-hours">
                  Резерв только в часы нагрузки
                </option>
              </select>
            </label>
          )}
        </div>
      </div>
    </section>
  );
}
