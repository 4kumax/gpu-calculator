"use client";

import { Check } from "lucide-react";
import type { TaskRule } from "@/lib/config";

export function TaskSelector({
  tasks,
  selectedIds,
  onChange,
  disabled = false,
  label = "Сценарии использования",
}: {
  tasks: TaskRule[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const enabledIds = tasks
    .filter((task) => task.enabled)
    .map((task) => task.id);
  const missing = selectedIds.filter(
    (id) => !tasks.some((task) => task.id === id),
  );
  return (
    <section className="task-selection" aria-label={label}>
      <div className="task-selection-heading">
        <div>
          <h2>{label}</h2>
          <p>Выберите одну или несколько задач</p>
        </div>
        <div className="task-selection-actions">
          <button
            className="text-button"
            type="button"
            disabled={
              disabled || enabledIds.every((id) => selectedIds.includes(id))
            }
            onClick={() => onChange(enabledIds)}
          >
            Выбрать все
          </button>
          <button
            className="text-button"
            type="button"
            disabled={disabled || !selectedIds.length}
            onClick={() => onChange([])}
          >
            Снять выбор
          </button>
        </div>
      </div>
      <div className="use-case-grid">
        {tasks.map((task) => {
          const checked = selectedIds.includes(task.id);
          return (
            <label
              key={task.id}
              className={`use-case-card ${checked ? "selected" : ""} ${!task.enabled ? "unavailable" : ""}`}
            >
              <input
                type="checkbox"
                aria-label={task.title}
                checked={checked}
                disabled={disabled || (!task.enabled && !checked)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selectedIds, task.id]
                      : selectedIds.filter((id) => id !== task.id),
                  )
                }
              />
              <span className="use-case-copy">
                <strong>{task.title}</strong>
                <span>{task.description}</span>
                {!task.enabled && <small>Задача отключена в параметрах</small>}
              </span>
              <span className="use-case-check" aria-hidden="true">
                {checked && <Check size={13} />}
              </span>
            </label>
          );
        })}
      </div>
      {missing.length > 0 && (
        <div className="notice-box" role="alert">
          <p>
            Некоторые выбранные задачи удалены из каталога. Уберите их из
            выбора, чтобы продолжить расчёт.
          </p>
          {missing.map((id) => (
            <button
              className="text-button"
              key={id}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(selectedIds.filter((value) => value !== id))
              }
            >
              Убрать «{id}»
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
