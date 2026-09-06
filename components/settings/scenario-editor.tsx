import type { AppConfig, ScenarioInput } from "@/lib/config";
import { NumberField, SelectField } from "./fields";
import { TaskSelector } from "@/components/task-selector";
import { calculationDefaults, withCalculationDefaults } from "@/lib/scenarios";

type Props = {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
  selectedTaskIds: string[];
  onTaskSelectionChange: (ids: string[]) => void;
};
type NumericKey = {
  [K in keyof ScenarioInput]: ScenarioInput[K] extends number ? K : never;
}[keyof ScenarioInput];
const workloadFields: Array<{
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step?: number;
}> = [
  {
    key: "concurrency",
    label: "Одновременные запросы в пике",
    min: 1,
    max: 10000,
    step: 1,
  },
  {
    key: "largeModelSharePct",
    label: "Доля запросов на выбранную модель, %",
    min: 0.001,
    max: 100,
  },
  {
    key: "inputTokens",
    label: "Типичный вход, токенов",
    min: 1,
    max: 10000000,
    step: 1,
  },
  {
    key: "outputTokens",
    label: "Типичный ответ, токенов",
    min: 1,
    max: 10000000,
    step: 1,
  },
  {
    key: "targetTtftMs",
    label: "Первый токен не позднее, мс (0 — без требования)",
    min: 0,
    max: 10000000,
  },
  {
    key: "minTokensPerSecond",
    label: "Скорость ответа, токенов/с (0 — без требования)",
    min: 0,
    max: 1000000,
  },
];
export function ScenarioPresetsEditor({
  config,
  onChange,
  selectedTaskIds,
  onTaskSelectionChange,
}: Props) {
  const selected = { input: calculationDefaults(config) };
  const input = (patch: Partial<ScenarioInput>) =>
    onChange(withCalculationDefaults(config, patch));
  return (
    <div className="stack">
      <section className="panel settings-card">
        <p>
          Тот же набор сценариев, что на главной странице. Можно выбрать
          несколько. Изменения выбора и параметров применятся вместе после
          сохранения.
        </p>
        <TaskSelector
          tasks={config.tasks}
          selectedIds={selectedTaskIds}
          onChange={onTaskSelectionChange}
        />
      </section>
      <section className="panel settings-card">
        <h3>Нагрузка</h3>
        <p>
          Длина входа — фактический размер обычного запроса. Максимальный
          контекст в правилах задач проверяет возможности модели и не
          увеличивает нагрузку автоматически.
        </p>
        <div className="settings-form-grid">
          {workloadFields.map(({ key, ...field }) => (
            <NumberField
              key={key}
              {...field}
              value={selected.input[key]}
              onChange={(value) =>
                input({ [key]: value ?? selected.input[key] })
              }
            />
          ))}
        </div>
      </section>
      <section className="panel settings-card">
        <h3>Условия сравнения</h3>
        <div className="settings-form-grid">
          <SelectField
            label="Модель"
            value={selected.input.modelId}
            onChange={(modelId) => input({ modelId })}
          >
            <option value="auto">Все подходящие модели</option>
            {config.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
                {model.enabled ? "" : " · выключена"}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="GPU"
            value={selected.input.gpuId}
            onChange={(gpuId) => input({ gpuId })}
          >
            <option value="auto">Все типы GPU</option>
            {config.gpus.map((gpu) => (
              <option key={gpu.id} value={gpu.id}>
                {gpu.name}
                {gpu.enabled ? "" : " · выключен"}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Приоритет выбора"
            value={selected.input.priority}
            onChange={(priority) =>
              input({ priority: priority as ScenarioInput["priority"] })
            }
          >
            <option value="balance">
              Достаточное качество, затем стоимость
            </option>
            <option value="cost">Минимальная стоимость</option>
            <option value="quality">Максимальный класс качества</option>
          </SelectField>
          <NumberField
            label="Работа под нагрузкой, ч/мес. (720 — круглосуточно)"
            value={selected.input.hoursMonth}
            min={0}
            max={720}
            onChange={(value) =>
              input({ hoursMonth: value ?? selected.input.hoursMonth })
            }
          />
          <NumberField
            label="Горизонт сравнения, лет"
            value={selected.input.years}
            min={1}
            max={5}
            step={1}
            onChange={(value) =>
              input({ years: value ?? selected.input.years })
            }
          />
          <SelectField
            label="Резерв оборудования"
            value={selected.input.reserveMode}
            onChange={(reserveMode) =>
              input({
                reserveMode: reserveMode as ScenarioInput["reserveMode"],
              })
            }
          >
            <option value="none">Без резерва</option>
            <option value="nplus1">Один резервный сервер (N+1)</option>
          </SelectField>
          <SelectField
            label="Оплата аренды"
            value={selected.input.rentalMode}
            onChange={(rentalMode) =>
              input({ rentalMode: rentalMode as ScenarioInput["rentalMode"] })
            }
          >
            <option value="gpu-hour">GPU по часам использования</option>
            <option value="dedicated-node">
              Выделенный узел — 720 часов в месяц
            </option>
          </SelectField>
          <SelectField
            label="Оплата резервной конфигурации"
            value={selected.input.reserveRentalMode}
            onChange={(reserveRentalMode) =>
              input({
                reserveRentalMode:
                  reserveRentalMode as ScenarioInput["reserveRentalMode"],
              })
            }
          >
            <option value="always-on">
              Круглосуточный резерв — 720 ч/мес.
            </option>
            <option value="active-hours">Только в часы использования</option>
          </SelectField>
        </div>
      </section>
    </div>
  );
}
