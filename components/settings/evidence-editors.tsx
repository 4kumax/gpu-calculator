import {
  AppConfig,
  DeploymentProfile,
  QualityAssessment,
  QualityTier,
} from "@/lib/config";
import { EnabledField, NumberField, SelectField, TextField } from "./fields";

type EditorProps = { config: AppConfig; onChange: (config: AppConfig) => void };
export function ProfilesEditor({ config, onChange }: EditorProps) {
  const update = (id: string, patch: Partial<DeploymentProfile>) =>
    onChange({
      ...config,
      deploymentProfiles: config.deploymentProfiles.map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile,
      ),
    });
  const add = () => {
    const model =
      config.models.find((item) => item.enabled) ?? config.models[0];
    const gpu =
      config.gpus.find((item) => item.id === model.recommendedGpuId) ??
      config.gpus[0];
    const profile: DeploymentProfile = {
      id: `profile-${crypto.randomUUID()}`,
      enabled: true,
      modelId: model.id,
      gpuId: gpu.id,
      engine: "Укажите движок",
      engineVersion: "Укажите версию",
      precision: model.precision,
      gpuCount: model.minGpuCount,
      tensorParallel: model.minGpuCount,
      pipelineParallel: 1,
      maxContextTokens: model.nativeContextK * 1000,
      maxConcurrency: 1,
      kvCacheGbPer1kTokens: 0.1,
      workspaceGbPerGpu: 2,
      status: "estimated",
      sourceUrl: "",
      sourceDate: "",
      notes: "Инженерный профиль: требуется нагрузочное испытание.",
    };
    onChange({
      ...config,
      deploymentProfiles: [...config.deploymentProfiles, profile],
    });
  };
  return (
    <div className="stack">
      <div className="panel settings-card">
        <div className="card-title-row">
          <p>
            Профиль связывает модель, GPU, движок, топологию, контекст и
            ёмкость. Измеренный статус требует результатов испытаний.
          </p>
          <button className="button" onClick={add}>
            Добавить профиль
          </button>
        </div>
      </div>
      {config.deploymentProfiles.map((profile) => {
        const benchmark = profile.benchmark;
        return (
          <details className="panel settings-record" key={profile.id}>
            <summary>
              <strong>
                {config.models.find((model) => model.id === profile.modelId)
                  ?.name ?? profile.modelId}{" "}
                ·{" "}
                {config.gpus.find((gpu) => gpu.id === profile.gpuId)?.name ??
                  profile.gpuId}
              </strong>
              <span>
                {profile.status === "measured" ? "Измерен" : "Оценка"} ·{" "}
                {profile.gpuCount} GPU · {profile.id}
              </span>
            </summary>
            <div className="settings-card">
              <EnabledField
                label="Профиль включён"
                value={profile.enabled}
                onChange={(enabled) => update(profile.id, { enabled })}
              />
              <div className="settings-form-grid">
                <SelectField
                  label="Модель профиля"
                  value={profile.modelId}
                  onChange={(modelId) => update(profile.id, { modelId })}
                >
                  {config.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="GPU профиля"
                  value={profile.gpuId}
                  onChange={(gpuId) => update(profile.id, { gpuId })}
                >
                  {config.gpus.map((gpu) => (
                    <option key={gpu.id} value={gpu.id}>
                      {gpu.name}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Движок запуска"
                  value={profile.engine}
                  onChange={(engine) => update(profile.id, { engine })}
                />
                <TextField
                  label="Версия движка"
                  value={profile.engineVersion}
                  onChange={(engineVersion) =>
                    update(profile.id, { engineVersion })
                  }
                />
                <TextField
                  label="Формат весов в профиле"
                  value={profile.precision}
                  onChange={(precision) => update(profile.id, { precision })}
                />
                <NumberField
                  label="GPU на реплику"
                  value={profile.gpuCount}
                  step={1}
                  onChange={(value) =>
                    update(profile.id, { gpuCount: value ?? 0 })
                  }
                />
                <NumberField
                  label="Tensor parallel"
                  value={profile.tensorParallel}
                  step={1}
                  onChange={(value) =>
                    update(profile.id, { tensorParallel: value ?? 0 })
                  }
                />
                <NumberField
                  label="Pipeline parallel"
                  value={profile.pipelineParallel}
                  step={1}
                  onChange={(value) =>
                    update(profile.id, { pipelineParallel: value ?? 0 })
                  }
                />
                <NumberField
                  label="Максимальный контекст, токенов"
                  value={profile.maxContextTokens}
                  step={1}
                  onChange={(value) =>
                    update(profile.id, { maxContextTokens: value ?? 0 })
                  }
                />
                <NumberField
                  label="Максимальная параллельность профиля"
                  value={profile.maxConcurrency}
                  step={1}
                  onChange={(value) =>
                    update(profile.id, { maxConcurrency: value ?? 0 })
                  }
                />
                <NumberField
                  label="KV-cache на 1000 токенов одного запроса, ГБ"
                  value={profile.kvCacheGbPer1kTokens}
                  onChange={(value) =>
                    update(profile.id, { kvCacheGbPer1kTokens: value ?? 0 })
                  }
                />
                <NumberField
                  label="Рабочая память на GPU, ГБ"
                  value={profile.workspaceGbPerGpu}
                  onChange={(value) =>
                    update(profile.id, { workspaceGbPerGpu: value ?? 0 })
                  }
                />
                <SelectField
                  label="Подтверждение профиля"
                  value={profile.status}
                  onChange={(status) =>
                    update(profile.id, {
                      status: status as DeploymentProfile["status"],
                      benchmark:
                        status === "measured"
                          ? (benchmark ?? {
                              inputTokens: 0,
                              outputTokens: 0,
                              concurrency: 0,
                              ttftMs: 0,
                              tokensPerSecond: 0,
                            })
                          : benchmark,
                    })
                  }
                >
                  <option value="estimated">Инженерная оценка</option>
                  <option value="measured">Измерено</option>
                </SelectField>
                <TextField
                  label="URL рецепта / отчёта испытаний"
                  type="url"
                  value={profile.sourceUrl}
                  onChange={(sourceUrl) => update(profile.id, { sourceUrl })}
                />
                <TextField
                  label="Дата проверки профиля"
                  type="date"
                  value={profile.sourceDate}
                  onChange={(sourceDate) => update(profile.id, { sourceDate })}
                />
                <TextField
                  label="Условия и ограничения профиля"
                  value={profile.notes}
                  onChange={(notes) => update(profile.id, { notes })}
                />
              </div>
              {benchmark && (
                <fieldset className="settings-subsection">
                  <legend>Нагрузочный тест</legend>
                  <div className="settings-form-grid">
                    {(
                      [
                        ["inputTokens", "Токенов на входе"],
                        ["outputTokens", "Токенов в ответе"],
                        ["concurrency", "Параллельных запросов в тесте"],
                        ["ttftMs", "Время до первого токена, мс"],
                        ["tokensPerSecond", "Скорость, токенов/с"],
                      ] as const
                    ).map(([key, label]) => (
                      <NumberField
                        key={key}
                        label={label}
                        value={benchmark[key]}
                        onChange={(value) =>
                          update(profile.id, {
                            benchmark: { ...benchmark, [key]: value ?? 0 },
                          })
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="button"
                    onClick={() =>
                      update(profile.id, {
                        benchmark: undefined,
                        status: "estimated",
                      })
                    }
                  >
                    Удалить результат и вернуть статус оценки
                  </button>
                </fieldset>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function QualityEditor({ config, onChange }: EditorProps) {
  const update = (id: string, patch: Partial<QualityAssessment>) =>
    onChange({
      ...config,
      qualityAssessments: config.qualityAssessments.map((assessment) =>
        assessment.id === id ? { ...assessment, ...patch } : assessment,
      ),
    });
  const add = () => {
    const model =
      config.models.find((item) => item.enabled) ?? config.models[0];
    const task = config.tasks.find((item) => item.enabled) ?? config.tasks[0];
    if (!task) return;
    onChange({
      ...config,
      qualityAssessments: [
        ...config.qualityAssessments,
        {
          id: `quality-${crypto.randomUUID()}`,
          modelId: model.id,
          taskId: task.id,
          status: "planned",
          qualityTier: model.qualityTier,
          sampleSize: 0,
          dataset: "Опишите набор целевых задач",
          sourceUrl: "",
          sourceDate: "",
          notes: "Испытание запланировано; измеренных результатов ещё нет.",
        },
      ],
    });
  };
  return (
    <div className="stack">
      <div className="panel settings-card">
        <div className="card-title-row">
          <p>
            Плановая оценка пригодности хранится отдельно от измеренного
            качества на корпоративном наборе задач.
          </p>
          <button
            className="button"
            disabled={!config.tasks.length}
            onClick={add}
          >
            Добавить испытание
          </button>
        </div>
      </div>
      {config.qualityAssessments.length === 0 && (
        <p className="panel settings-card">
          Испытания ещё не добавлены. Создайте план проверки моделей на целевых
          задачах.
        </p>
      )}
      {config.qualityAssessments.map((assessment) => (
        <details className="panel settings-record" key={assessment.id}>
          <summary>
            <strong>
              {config.models.find((model) => model.id === assessment.modelId)
                ?.name ?? assessment.modelId}{" "}
              ·{" "}
              {config.tasks.find((task) => task.id === assessment.taskId)
                ?.title ?? assessment.taskId}
            </strong>
            <span>
              {assessment.status === "measured" ? "Измерено" : "Запланировано"}{" "}
              · {assessment.sampleSize} примеров
            </span>
          </summary>
          <div className="settings-card">
            <div className="settings-form-grid">
              <SelectField
                label="Модель испытания"
                value={assessment.modelId}
                onChange={(modelId) => update(assessment.id, { modelId })}
              >
                {config.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Задача испытания"
                value={assessment.taskId}
                onChange={(taskId) => update(assessment.id, { taskId })}
              >
                {config.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Статус испытания"
                value={assessment.status}
                onChange={(status) =>
                  update(assessment.id, {
                    status: status as QualityAssessment["status"],
                  })
                }
              >
                <option value="planned">Запланировано</option>
                <option value="measured">Измерено</option>
              </SelectField>
              <NumberField
                label="Класс качества для задачи"
                value={assessment.qualityTier}
                min={1}
                max={5}
                step={1}
                onChange={(value) =>
                  update(assessment.id, {
                    qualityTier: (value ?? 1) as QualityTier,
                  })
                }
              />
              <NumberField
                label="Размер выборки, примеров"
                value={assessment.sampleSize}
                step={1}
                onChange={(value) =>
                  update(assessment.id, { sampleSize: value ?? 0 })
                }
              />
              <TextField
                label="Название / версия набора данных"
                value={assessment.dataset}
                onChange={(dataset) => update(assessment.id, { dataset })}
              />
              <TextField
                label="URL отчёта испытаний"
                type="url"
                value={assessment.sourceUrl}
                onChange={(sourceUrl) => update(assessment.id, { sourceUrl })}
              />
              <TextField
                label="Дата испытания"
                type="date"
                value={assessment.sourceDate}
                onChange={(sourceDate) => update(assessment.id, { sourceDate })}
              />
              <TextField
                label="Методика и ограничения"
                value={assessment.notes}
                onChange={(notes) => update(assessment.id, { notes })}
              />
              <NumberField
                label="Правильных ответов, % (необязательно)"
                value={assessment.correctAnswerPct}
                optional
                min={0}
                max={100}
                onChange={(correctAnswerPct) =>
                  update(assessment.id, { correctAnswerPct })
                }
              />
              <NumberField
                label="Ошибок извлечения, % (необязательно)"
                value={assessment.extractionErrorPct}
                optional
                min={0}
                max={100}
                onChange={(extractionErrorPct) =>
                  update(assessment.id, { extractionErrorPct })
                }
              />
              <NumberField
                label="Успешных вызовов инструментов, % (необязательно)"
                value={assessment.toolSuccessPct}
                optional
                min={0}
                max={100}
                onChange={(toolSuccessPct) =>
                  update(assessment.id, { toolSuccessPct })
                }
              />
            </div>
            <button
              className="button danger"
              onClick={() =>
                onChange({
                  ...config,
                  qualityAssessments: config.qualityAssessments.filter(
                    (item) => item.id !== assessment.id,
                  ),
                })
              }
            >
              Удалить испытание из черновика
            </button>
          </div>
        </details>
      ))}
    </div>
  );
}
