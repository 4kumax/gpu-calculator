import {
  AppConfig,
  Assumptions,
  GpuConfig,
  ModelConfig,
  QualityTier,
  TaskRule,
} from "@/lib/config";
import {
  CapabilityField,
  EnabledField,
  NumberField,
  SelectField,
  TextField,
} from "./fields";

type EditorProps = { config: AppConfig; onChange: (config: AppConfig) => void };
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function ModelsEditor({ config, onChange }: EditorProps) {
  const update = (id: string, patch: Partial<ModelConfig>) =>
    onChange({
      ...config,
      models: config.models.map((model) =>
        model.id === id ? { ...model, ...patch } : model,
      ),
    });
  const add = (source = config.models[0]) => {
    const model: ModelConfig = {
      ...source,
      id: newId("model"),
      name: source ? `${source.name} — копия` : "Новая модель",
      enabled: true,
      evidence: "Инженерная оценка",
      sourceUrl: "",
      sourceDate: "",
      note: "Заполните характеристики и создайте профиль запуска перед использованием.",
    };
    onChange({ ...config, models: [...config.models, model] });
  };
  return (
    <div className="stack">
      <div className="panel settings-card">
        <div className="card-title-row">
          <p>
            Характеристики описывают модель. Производительность и качество
            подтверждаются отдельно в профилях и испытаниях.
          </p>
          <button className="button" onClick={() => add()}>
            Добавить модель
          </button>
        </div>
      </div>
      {config.models.map((model) => (
        <details className="panel settings-record" key={model.id}>
          <summary>
            <strong>{model.name || "Модель без названия"}</strong>
            <span>
              {model.enabled ? "Активна" : "Архив"} · {model.id}
            </span>
          </summary>
          <div className="settings-card">
            <EnabledField
              label={`Модель «${model.name}» включена`}
              value={model.enabled}
              onChange={(enabled) => update(model.id, { enabled })}
            />
            <div className="settings-form-grid">
              <TextField
                label="Название модели"
                value={model.name}
                onChange={(name) => update(model.id, { name })}
              />
              <TextField
                label="Разработчик"
                value={model.developer}
                onChange={(developer) => update(model.id, { developer })}
              />
              <SelectField
                label="Архитектура"
                value={model.architecture}
                onChange={(architecture) =>
                  update(model.id, {
                    architecture: architecture as ModelConfig["architecture"],
                  })
                }
              >
                <option>Dense</option>
                <option>MoE</option>
              </SelectField>
              <NumberField
                label="Всего параметров, млрд"
                value={model.totalParamsB}
                onChange={(value) =>
                  update(model.id, { totalParamsB: value ?? 0 })
                }
              />
              <NumberField
                label="Активных параметров, млрд"
                value={model.activeParamsB}
                onChange={(value) =>
                  update(model.id, { activeParamsB: value ?? 0 })
                }
              />
              <NumberField
                label="Нативный контекст, тыс. токенов"
                value={model.nativeContextK}
                step={1}
                onChange={(value) =>
                  update(model.id, { nativeContextK: value ?? 0 })
                }
              />
              <NumberField
                label="Максимальный контекст, тыс. токенов"
                value={model.maxContextK}
                step={1}
                onChange={(value) =>
                  update(model.id, { maxContextK: value ?? 0 })
                }
              />
              <NumberField
                label="Плановый класс качества"
                value={model.qualityTier}
                min={1}
                max={5}
                step={1}
                onChange={(value) =>
                  update(model.id, { qualityTier: (value ?? 1) as QualityTier })
                }
              />
              <SelectField
                label="GPU справочного профиля"
                value={model.recommendedGpuId}
                onChange={(recommendedGpuId) =>
                  update(model.id, { recommendedGpuId })
                }
              >
                {config.gpus.map((gpu) => (
                  <option key={gpu.id} value={gpu.id}>
                    {gpu.name}
                  </option>
                ))}
              </SelectField>
              <NumberField
                label="GPU в справочном профиле"
                value={model.minGpuCount}
                step={1}
                onChange={(value) =>
                  update(model.id, { minGpuCount: value ?? 0 })
                }
              />
              <NumberField
                label="Запросов в справочном профиле"
                value={model.sessionsPerReplica}
                step={1}
                onChange={(value) =>
                  update(model.id, { sessionsPerReplica: value ?? 0 })
                }
              />
              <TextField
                label="Формат весов"
                value={model.precision}
                onChange={(precision) => update(model.id, { precision })}
              />
              <NumberField
                label="Бит на вес"
                value={model.bitsPerWeight}
                onChange={(value) =>
                  update(model.id, { bitsPerWeight: value ?? 0 })
                }
              />
              <NumberField
                label="Размер чекпоинта, ГБ (необязательно)"
                value={model.checkpointWeightGb}
                optional
                onChange={(checkpointWeightGb) =>
                  update(model.id, { checkpointWeightGb })
                }
              />
              <TextField
                label="Лицензия"
                value={model.license}
                onChange={(license) => update(model.id, { license })}
              />
              <SelectField
                label="Основание характеристик"
                value={model.evidence}
                onChange={(evidence) =>
                  update(model.id, {
                    evidence: evidence as ModelConfig["evidence"],
                  })
                }
              >
                {[
                  "Публичные характеристики",
                  "Конфигурация проверена поставщиком",
                  "Инженерная оценка",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
              <TextField
                label="URL характеристик"
                type="url"
                value={model.sourceUrl}
                onChange={(sourceUrl) => update(model.id, { sourceUrl })}
              />
              <TextField
                label="Дата проверки характеристик"
                type="date"
                value={model.sourceDate}
                onChange={(sourceDate) => update(model.id, { sourceDate })}
              />
              <TextField
                label="Примечание"
                value={model.note}
                onChange={(note) => update(model.id, { note })}
              />
            </div>
            <CapabilityField
              label={`Возможности модели «${model.name}»`}
              value={model.capabilities}
              onChange={(capabilities) => update(model.id, { capabilities })}
            />
            <button className="button" onClick={() => add(model)}>
              Дублировать модель
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}

function QuoteEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: GpuConfig["purchaseQuote"];
  onChange: (value: GpuConfig["purchaseQuote"]) => void;
}) {
  return (
    <fieldset className="settings-subsection">
      <legend>{title}</legend>
      <div className="settings-form-grid">
        <SelectField
          label="Статус цены"
          value={value.kind}
          onChange={(kind) =>
            onChange({
              ...value,
              kind: kind as GpuConfig["purchaseQuote"]["kind"],
            })
          }
        >
          {["Публичная цена", "Коммерческая оценка", "Инженерная оценка"].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </SelectField>
        <TextField
          label="Поставщик / источник цены"
          value={value.sourceLabel}
          onChange={(sourceLabel) => onChange({ ...value, sourceLabel })}
        />
        <TextField
          label="URL предложения"
          type="url"
          value={value.sourceUrl}
          onChange={(sourceUrl) => onChange({ ...value, sourceUrl })}
        />
        <TextField
          label="Дата проверки цены"
          type="date"
          value={value.sourceDate}
          onChange={(sourceDate) => onChange({ ...value, sourceDate })}
        />
        <TextField
          label="Условия: НДС, комплектация, срок действия, тарификация"
          value={value.terms}
          onChange={(terms) => onChange({ ...value, terms })}
        />
      </div>
    </fieldset>
  );
}

export function GpusEditor({ config, onChange }: EditorProps) {
  const update = (id: string, patch: Partial<GpuConfig>) =>
    onChange({
      ...config,
      gpus: config.gpus.map((gpu) =>
        gpu.id === id ? { ...gpu, ...patch } : gpu,
      ),
    });
  const add = () => {
    const source = config.gpus[0];
    const quote = {
      kind: "Инженерная оценка" as const,
      sourceLabel: "",
      sourceUrl: "",
      sourceDate: "",
      terms: "Заполните условия предложения",
    };
    onChange({
      ...config,
      gpus: [
        ...config.gpus,
        {
          ...source,
          id: newId("gpu"),
          name: "Новый GPU",
          enabled: true,
          vendor: "",
          memoryGb: 80,
          nodeGpuCount: 8,
          nodePriceRub: 0,
          rentPerGpuHourRub: 0,
          nodePowerKw: 8,
          memoryBandwidthTb: 0,
          interconnect: "Уточните топологию",
          priceKind: "Инженерная оценка",
          sourceLabel: "",
          sourceUrl: "",
          sourceDate: "",
          purchaseQuote: { ...quote },
          rentalQuote: { ...quote },
        },
      ],
    });
  };
  return (
    <div className="stack">
      <div className="panel settings-card">
        <div className="card-title-row">
          <p>
            Покупка и аренда имеют отдельные источники и даты. Все суммы
            задаются в рублях.
          </p>
          <button className="button" onClick={add}>
            Добавить GPU
          </button>
        </div>
      </div>
      {config.gpus.map((gpu) => (
        <details className="panel settings-record" key={gpu.id}>
          <summary>
            <strong>{gpu.name || "GPU без названия"}</strong>
            <span>
              {gpu.enabled ? "Активен" : "Архив"} · {gpu.id}
            </span>
          </summary>
          <div className="settings-card">
            <EnabledField
              label={`GPU «${gpu.name}» включён`}
              value={gpu.enabled}
              onChange={(enabled) => update(gpu.id, { enabled })}
            />
            <div className="settings-form-grid">
              <TextField
                label="Название GPU"
                value={gpu.name}
                onChange={(name) => update(gpu.id, { name })}
              />
              <TextField
                label="Производитель"
                value={gpu.vendor}
                onChange={(vendor) => update(gpu.id, { vendor })}
              />
              <NumberField
                label="Память одного GPU, ГБ"
                value={gpu.memoryGb}
                onChange={(value) => update(gpu.id, { memoryGb: value ?? 0 })}
              />
              <NumberField
                label="GPU в серверном узле"
                value={gpu.nodeGpuCount}
                step={1}
                onChange={(value) =>
                  update(gpu.id, { nodeGpuCount: value ?? 0 })
                }
              />
              <NumberField
                label="Цена покупки узла, ₽"
                value={gpu.nodePriceRub}
                onChange={(value) =>
                  update(gpu.id, { nodePriceRub: value ?? 0 })
                }
              />
              <NumberField
                label="Цена аренды GPU-часа, ₽"
                value={gpu.rentPerGpuHourRub}
                onChange={(value) =>
                  update(gpu.id, { rentPerGpuHourRub: value ?? 0 })
                }
              />
              <NumberField
                label="Мощность узла, кВт"
                value={gpu.nodePowerKw}
                onChange={(value) =>
                  update(gpu.id, { nodePowerKw: value ?? 0 })
                }
              />
              <NumberField
                label="Пропускная способность памяти, ТБ/с"
                value={gpu.memoryBandwidthTb}
                onChange={(value) =>
                  update(gpu.id, { memoryBandwidthTb: value ?? 0 })
                }
              />
              <TextField
                label="Межсоединение / топология"
                value={gpu.interconnect}
                onChange={(interconnect) => update(gpu.id, { interconnect })}
              />
            </div>
            <QuoteEditor
              title="Предложение покупки узла"
              value={gpu.purchaseQuote}
              onChange={(purchaseQuote) => update(gpu.id, { purchaseQuote })}
            />
            <QuoteEditor
              title="Предложение аренды GPU"
              value={gpu.rentalQuote}
              onChange={(rentalQuote) => update(gpu.id, { rentalQuote })}
            />
          </div>
        </details>
      ))}
    </div>
  );
}

export function TasksEditor({ config, onChange }: EditorProps) {
  const update = (id: string, patch: Partial<TaskRule>) =>
    onChange({
      ...config,
      tasks: config.tasks.map((task) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    });
  const add = () =>
    onChange({
      ...config,
      tasks: [
        ...config.tasks,
        {
          id: newId("task"),
          enabled: true,
          title: "Новая задача",
          description: "",
          category: "Новая категория",
          minQualityTier: 2,
          minContextK: 128,
          requiredCapabilities: ["текст"],
        },
      ],
    });
  return (
    <div className="stack">
      <div className="panel settings-card">
        <button className="button" onClick={add}>
          Добавить задачу
        </button>
      </div>
      {config.tasks.map((task) => (
        <details className="panel settings-record" key={task.id}>
          <summary>
            <strong>{task.title || "Задача без названия"}</strong>
            <span>
              {task.enabled ? "Активна" : "Архив"} · {task.id}
            </span>
          </summary>
          <div className="settings-card">
            <EnabledField
              label={`Задача «${task.title}» включена`}
              value={task.enabled}
              onChange={(enabled) => update(task.id, { enabled })}
            />
            <div className="settings-form-grid">
              <TextField
                label="Название задачи"
                value={task.title}
                onChange={(title) => update(task.id, { title })}
              />
              <TextField
                label="Описание задачи"
                value={task.description}
                onChange={(description) => update(task.id, { description })}
              />
              <TextField
                label="Категория"
                value={task.category}
                onChange={(category) => update(task.id, { category })}
              />
              <NumberField
                label="Минимальный класс качества"
                value={task.minQualityTier}
                min={1}
                max={5}
                step={1}
                onChange={(value) =>
                  update(task.id, {
                    minQualityTier: (value ?? 1) as QualityTier,
                  })
                }
              />
              <NumberField
                label="Минимальный контекст, тыс. токенов"
                value={task.minContextK}
                step={1}
                onChange={(value) =>
                  update(task.id, { minContextK: value ?? 0 })
                }
              />
            </div>
            <CapabilityField
              label={`Обязательные возможности для «${task.title}»`}
              value={task.requiredCapabilities}
              onChange={(requiredCapabilities) =>
                update(task.id, { requiredCapabilities })
              }
            />
          </div>
        </details>
      ))}
    </div>
  );
}

const ASSUMPTION_LABELS: Record<string, string> = {
  defaultHoursMonth: "Использование по умолчанию, ч/мес.",
  defaultYears: "Горизонт по умолчанию, лет",
  defaultConcurrency: "Параллельность для совместимости со старыми файлами",
  defaultInputTokens: "Вход при незаданной длине в старом расчёте, токенов",
  defaultOutputTokens: "Ответ при незаданной длине в старом расчёте, токенов",
  electricityRubKwh: "Электроэнергия, ₽/кВт·ч",
  pue: "PUE центра обработки данных",
  supportPctCapexYear: "Поддержка, % CAPEX/год",
  fitoutPctCapex: "Ввод в эксплуатацию, % CAPEX",
  idlePowerPct: "Мощность в ожидании, %",
  memoryOverheadPct: "Запас памяти весов, %",
  usableMemoryPct: "Используемая память GPU, %",
  rackMonthPerNodeRub: "Размещение узла, ₽/мес.",
  networkStorageMonthRub: "Сеть и хранилище (базовое допущение), ₽/мес.",
  operationsMonthRub: "Эксплуатация (базовое допущение), ₽/мес.",
  rentalServicePct: "Надбавка к аренде, %",
  contingencyPct: "Непредвиденные затраты, %",
  residualValuePct: "Остаточная стоимость, %",
  stalePriceDays: "Срок актуальности цены, дней",
};
export function AssumptionsEditor({ config, onChange }: EditorProps) {
  const renderField = ([key, value]: [string, number]) => (
    <NumberField
      key={key}
      label={ASSUMPTION_LABELS[key] ?? key}
      value={value}
      onChange={(next) =>
        onChange({
          ...config,
          assumptions: {
            ...config.assumptions,
            [key]: next ?? 0,
          } as Assumptions,
        })
      }
    />
  );
  const fields = Object.entries(config.assumptions).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  return (
    <div className="stack">
      <section className="panel settings-card">
        <h3>Финансовые и эксплуатационные параметры</h3>
        <div className="settings-form-grid">
          {fields
            .filter(([key]) => !key.startsWith("default"))
            .map(renderField)}
        </div>
      </section>
      <details className="panel settings-card">
        <summary>Совместимость с прежними расчётами</summary>
        <p>
          Текущие сценарии хранят нагрузку и срок сравнения в собственных
          параметрах. Значения ниже используются как резерв для прежних файлов с
          незаданными параметрами.
        </p>
        <div className="settings-form-grid">
          {fields.filter(([key]) => key.startsWith("default")).map(renderField)}
        </div>
      </details>
    </div>
  );
}
