"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileJson, Save, Settings2 } from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { AppConfig, cloneDefaultConfig, parseConfig } from "@/lib/config";
import {
  clearDraft,
  configDifferences,
  mergeDraftChanges,
  readDraft,
  saveDraft,
} from "@/lib/local-config-store";
import {
  AssumptionsEditor,
  GpusEditor,
  ModelsEditor,
  TasksEditor,
} from "@/components/settings/catalog-editors";
import {
  ProfilesEditor,
  QualityEditor,
} from "@/components/settings/evidence-editors";
import { DiffPreview } from "@/components/settings/diff-preview";

type Section =
  | "models"
  | "profiles"
  | "quality"
  | "gpus"
  | "assumptions"
  | "tasks"
  | "exchange";
const SECTIONS: Record<Section, { title: string; description: string }> = {
  models: {
    title: "Модели",
    description: "Характеристики и возможности моделей",
  },
  profiles: {
    title: "Профили запуска",
    description: "Связки модели и GPU, память, движок и производительность",
  },
  quality: {
    title: "Испытания качества",
    description: "Подтверждение пригодности для корпоративных задач",
  },
  gpus: {
    title: "GPU и цены",
    description: "Оборудование, отдельные источники покупки и аренды",
  },
  assumptions: {
    title: "Допущения TCO",
    description: "Финансовые и эксплуатационные параметры",
  },
  tasks: {
    title: "Правила задач",
    description: "Требования к качеству, контексту и возможностям",
  },
  exchange: {
    title: "Версии и обмен",
    description: "Предпросмотр импорта, обновления каталога и история ревизий",
  },
};
type PendingChange = { config: AppConfig; title: string; warnings: string[] };
function downloadRaw(raw: string, name: string): string | null {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    return null;
  } catch {
    return "Не удалось скачать JSON. Проверьте разрешение браузера на загрузку файлов и повторите экспорт.";
  } finally {
    anchor?.remove();
    if (url) {
      const createdUrl = url;
      setTimeout(() => URL.revokeObjectURL(createdUrl), 1000);
    }
  }
}

export default function SettingsPage() {
  const store = useConfig();
  const live = store.config;
  const [draft, setDraft] = useState<AppConfig>(cloneDefaultConfig);
  const [base, setBase] = useState<AppConfig>(cloneDefaultConfig);
  const [baseRevision, setBaseRevision] = useState(live.revision);
  const [draftMode, setDraftMode] = useState<"local" | "shared">("local");
  const [initialized, setInitialized] = useState(false);
  const [section, setSection] = useState<Section>("models");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftRecovery, setDraftRecovery] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [changeMessage, setChangeMessage] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentRevision =
    store.mode === "shared" ? store.sharedRevision : live.revision;
  const dirty = useMemo(
    () => configDifferences(base, draft).length > 0,
    [base, draft],
  );
  const conflict =
    initialized &&
    (baseRevision !== currentRevision ||
      draftMode !== store.mode ||
      JSON.stringify(base) !== JSON.stringify(live));
  const readOnly =
    store.configured && (!store.authenticated || store.role !== "editor");
  const initialPublication =
    store.configured &&
    store.authenticated &&
    store.role === "editor" &&
    store.sharedRevision === 0;

  useEffect(() => {
    if (!store.loaded || initialized) return;
    let restored: ReturnType<typeof readDraft> = { draft: null, error: null };
    try {
      restored = readDraft(window.sessionStorage);
    } catch {
      restored.error =
        "Сохранение черновиков в этой вкладке недоступно. Экспортируйте изменения перед выходом.";
    }
    if (restored.draft) {
      setDraft(restored.draft.config);
      setBase(restored.draft.baseConfig);
      setBaseRevision(
        restored.draft.baseRevision ?? restored.draft.baseConfig.revision,
      );
      setDraftMode(restored.draft.mode);
      setMessage(
        "Восстановлен сохранённый черновик. Калькулятор использует опубликованную ревизию до сохранения изменений.",
      );
    } else {
      setDraft(live);
      setBase(live);
      setBaseRevision(currentRevision);
      setDraftMode(store.mode);
    }
    setDraftError(restored.error);
    setDraftRecovery(restored.recoveryRaw ?? null);
    setInitialized(true);
  }, [store.loaded, initialized, live, currentRevision, store.mode]);

  useEffect(() => {
    if (!initialized || busy || dirty || !conflict) return;
    setDraft(live);
    setBase(live);
    setBaseRevision(currentRevision);
    setDraftMode(store.mode);
  }, [initialized, busy, dirty, conflict, live, currentRevision, store.mode]);

  useEffect(() => {
    if (!initialized || draftRecovery) return;
    try {
      const error = dirty
        ? saveDraft(window.sessionStorage, {
            config: draft,
            baseConfig: base,
            baseRevision,
            mode: draftMode,
            updatedAt: new Date().toISOString(),
          })
        : clearDraft(window.sessionStorage);
      setDraftError(error);
    } catch {
      setDraftError(
        "Не удалось сохранить черновик в браузере. Экспортируйте JSON перед переходом на другую страницу.",
      );
    }
  }, [initialized, dirty, draft, base, baseRevision, draftMode, draftRecovery]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, draftError]);

  const exportRaw = (raw: string, name: string) => {
    const error = downloadRaw(raw, name);
    if (error) setErrors([error]);
  };
  const startFreshDraft = () => {
    try {
      const error = clearDraft(window.sessionStorage);
      if (error) {
        setErrors([error]);
        return;
      }
      setDraftRecovery(null);
      setDraftError(null);
    } catch {
      setErrors(["Не удалось очистить повреждённый черновик."]);
    }
  };
  const loadLive = () => {
    setDraft(live);
    setBase(live);
    setBaseRevision(currentRevision);
    setDraftMode(store.mode);
    setErrors([]);
    setMessage("Загружена текущая ревизия каталога.");
  };
  const keepDraft = () => {
    setDraft(mergeDraftChanges(base, draft, live));
    setBase(live);
    setBaseRevision(currentRevision);
    setDraftMode(store.mode);
    setErrors([]);
    setMessage(
      "Мои изменения перенесены на актуальную ревизию. При изменении одного поля в обеих версиях оставлено значение черновика. Проверьте результат и сохраните.",
    );
  };
  const handleSave = async () => {
    if (conflict || readOnly) return;
    const checked = parseConfig(draft);
    if (!checked.config) {
      setErrors(checked.errors);
      setMessage("");
      return;
    }
    setBusy(true);
    setErrors([]);
    setMessage("");
    try {
      const result = await store.save(checked.config, {
        expectedRevision: baseRevision,
        message:
          changeMessage ||
          (initialPublication
            ? "Первая публикация общего каталога"
            : "Изменение настроек"),
        recover: Boolean(store.recoveryRaw),
      });
      if (!result.ok || !result.config) {
        setErrors(result.errors);
        return;
      }
      setDraft(result.config);
      setBase(result.config);
      setBaseRevision(result.config.revision);
      setDraftMode(store.mode);
      setChangeMessage("");
      setMessage(
        `Ревизия ${result.config.revision} сохранена ${store.mode === "shared" ? "в общем каталоге" : "в этом браузере"}. ${result.warnings.length ? result.warnings.join(" ") : "Калькулятор использует новые параметры."}`,
      );
    } finally {
      setBusy(false);
    }
  };
  const importConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Файл превышает допустимый размер 2 МБ.");
      const value: unknown = JSON.parse(await file.text());
      const parsed = parseConfig(value);
      if (!parsed.config) {
        setErrors(parsed.errors);
        return;
      }
      setPending({
        config: parsed.config,
        title: `Импорт «${file.name}»`,
        warnings: parsed.warnings,
      });
      setErrors([]);
      setMessage("");
    } catch (error) {
      setErrors([
        error instanceof SyntaxError
          ? "Не удалось прочитать JSON-файл."
          : error instanceof Error
            ? error.message
            : "Не удалось импортировать файл.",
      ]);
    } finally {
      event.target.value = "";
    }
  };
  const previewHistory = async (revision: number) => {
    try {
      const config = await store.loadHistory(revision);
      setPending({
        config,
        title: `Восстановление ревизии ${revision}`,
        warnings: [],
      });
      setErrors([]);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Не удалось открыть историю.",
      ]);
    }
  };
  const sessionAction = async (action: "login" | "logout") => {
    setBusy(true);
    try {
      const found =
        action === "login" ? await store.login(token) : await store.logout();
      setErrors(found);
    } finally {
      setToken("");
      setBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Settings2 size={15} />
            Управление расчётной моделью
          </div>
          <h1>Параметры калькулятора</h1>
        </div>
        <p>
          Каталоги, подтверждённые профили запуска, цены и допущения. Изменения
          сначала сохраняются в черновик.
        </p>
      </div>
      {store.configured && (
        <section className="panel settings-card">
          <h2>Общий каталог</h2>
          {store.authenticated ? (
            <div className="card-title-row">
              <p>
                Роль: {store.role === "editor" ? "редактор" : "просмотр"}. Общая
                ревизия: {store.sharedRevision || "ещё не опубликована"}.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => void sessionAction("logout")}
              >
                Выйти
              </button>
            </div>
          ) : (
            <form
              className="session-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sessionAction("login");
              }}
            >
              <label className="field">
                <span>Ключ доступа к общему каталогу</span>
                <input
                  className="control"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <button
                className="button primary"
                type="submit"
                disabled={busy || !token}
              >
                Войти
              </button>
              <p>
                Ключ используется для входа и не сохраняется в локальном
                хранилище.
              </p>
            </form>
          )}
        </section>
      )}
      {store.error && (
        <div className="error-box" role="alert">
          <p>{store.error}</p>
          <button className="button" onClick={() => void store.refresh()}>
            Повторить загрузку
          </button>
        </div>
      )}
      {store.warnings.length > 0 && (
        <details className="panel settings-card">
          <summary>Замечания к каталогу ({store.warnings.length})</summary>
          <ul>
            {store.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {store.recoveryRaw && (
        <div className="status-banner" role="alert">
          <p>
            Повреждённые настройки сохранены для восстановления. Перед заменой
            каталога скачайте исходный файл. Успешное сохранение создаст
            резервную копию в браузере.
          </p>
          <button
            className="button"
            onClick={() =>
              exportRaw(store.recoveryRaw!, "gpu-catalog-recovery.json")
            }
          >
            Скачать исходные настройки
          </button>
        </div>
      )}
      {draftError && (
        <div className="error-box" role="alert">
          <p>{draftError}</p>
          {draftRecovery && (
            <button
              className="button"
              onClick={() =>
                exportRaw(draftRecovery, "gpu-draft-recovery.json")
              }
            >
              Скачать повреждённый черновик
            </button>
          )}
          {draftRecovery && (
            <button className="button" onClick={startFreshDraft}>
              Начать новый черновик
            </button>
          )}
          <button
            className="button"
            onClick={() =>
              exportRaw(JSON.stringify(draft, null, 2), "gpu-draft.json")
            }
          >
            Экспортировать текущий черновик
          </button>
        </div>
      )}
      {!initialized ? (
        <p role="status">Загрузка параметров…</p>
      ) : (
        <div className="settings-layout">
          <aside className="panel settings-nav" aria-label="Разделы параметров">
            {(Object.keys(SECTIONS) as Section[]).map((key) => (
              <button
                key={key}
                className={section === key ? "active" : ""}
                aria-current={section === key ? "page" : undefined}
                onClick={() => setSection(key)}
              >
                {SECTIONS[key].title}
              </button>
            ))}
            <div className="local-warning">
              {store.mode === "shared"
                ? "Опубликованные параметры доступны участникам с доступом. Черновик хранится в текущей вкладке. Перед её закрытием экспортируйте JSON."
                : "Локальный режим: каталог и история хранятся в браузере. Черновик восстанавливается при переходе и перезагрузке текущей вкладки; перед её закрытием экспортируйте JSON."}
            </div>
          </aside>
          <section className="settings-main">
            <div className="settings-toolbar">
              <div>
                <h2>{SECTIONS[section].title}</h2>
                <p>{SECTIONS[section].description}</p>
                <small>
                  {dirty
                    ? draftError
                      ? "Черновик не сохранён в этой вкладке"
                      : "Черновик сохранён в этой вкладке до её закрытия"
                    : "Нет несохранённых изменений"}
                </small>
              </div>
              <div className="action-row">
                <button
                  className="button"
                  onClick={() =>
                    exportRaw(
                      JSON.stringify(draft, null, 2),
                      `gpu-calculator-draft-r${baseRevision}.json`,
                    )
                  }
                >
                  <Download size={14} />
                  Экспорт
                </button>
                <button
                  className="button"
                  disabled={!dirty || busy}
                  onClick={loadLive}
                >
                  Отменить изменения
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !store.canSave ||
                    readOnly ||
                    conflict ||
                    (!dirty && !initialPublication && !store.recoveryRaw)
                  }
                  onClick={() => void handleSave()}
                >
                  <Save size={14} />
                  {busy
                    ? "Сохранение…"
                    : initialPublication
                      ? "Опубликовать общий каталог"
                      : "Сохранить изменения"}
                </button>
              </div>
            </div>
            {readOnly && (
              <p className="status-banner">
                {store.authenticated
                  ? "Доступен просмотр. Для изменения общего каталога войдите с ролью редактора."
                  : "Войдите, чтобы просматривать и изменять общий каталог. Показанные локальные данные не опубликованы."}
              </p>
            )}
            {errors.length > 0 && (
              <div className="error-box" role="alert">
                <b>Проверьте параметры:</b>
                <ul>
                  {errors.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {message && (
              <div className="success-box" role="status">
                {message}
              </div>
            )}
            {conflict && dirty && (
              <section
                className="panel settings-card status-banner"
                role="alert"
              >
                <h3>Каталог изменился, черновик сохранён</h3>
                <p>
                  Черновик основан на ревизии {baseRevision}; текущая ревизия —{" "}
                  {currentRevision}. Сравните изменения. При переносе
                  совпадающие поля получат значение из вашего черновика.
                </p>
                <DiffPreview
                  before={base}
                  after={live}
                  title="Изменения текущего каталога"
                />
                <DiffPreview
                  before={base}
                  after={draft}
                  title="Мои изменения"
                />
                <div className="action-row">
                  <button className="button" onClick={keepDraft}>
                    Перенести мои изменения
                  </button>
                  <button className="button" onClick={loadLive}>
                    Загрузить текущую версию
                  </button>
                </div>
              </section>
            )}
            {pending && (
              <section className="panel settings-card">
                <h3>{pending.title}</h3>
                {pending.warnings.length > 0 && (
                  <ul>
                    {pending.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                )}
                <DiffPreview before={draft} after={pending.config} />
                <p>
                  Применение обновит черновик. Действующая ревизия изменится
                  только после сохранения.
                </p>
                <div className="action-row">
                  <button
                    className="button primary"
                    disabled={readOnly}
                    onClick={() => {
                      setDraft(pending.config);
                      setChangeMessage(pending.title);
                      setPending(null);
                      setMessage(
                        "Изменения применены к черновику. Проверьте и сохраните новую ревизию.",
                      );
                    }}
                  >
                    Применить к черновику
                  </button>
                  <button className="button" onClick={() => setPending(null)}>
                    Закрыть предпросмотр
                  </button>
                </div>
              </section>
            )}
            {section !== "exchange" ? (
              <fieldset
                disabled={readOnly || busy}
                className="settings-editor"
                aria-label={SECTIONS[section].title}
              >
                {section === "models" && (
                  <ModelsEditor config={draft} onChange={setDraft} />
                )}{" "}
                {section === "profiles" && (
                  <ProfilesEditor config={draft} onChange={setDraft} />
                )}{" "}
                {section === "quality" && (
                  <QualityEditor config={draft} onChange={setDraft} />
                )}{" "}
                {section === "gpus" && (
                  <GpusEditor config={draft} onChange={setDraft} />
                )}{" "}
                {section === "tasks" && (
                  <TasksEditor config={draft} onChange={setDraft} />
                )}{" "}
                {section === "assumptions" && (
                  <AssumptionsEditor config={draft} onChange={setDraft} />
                )}
              </fieldset>
            ) : (
              <div className="stack">
                <div className="panel settings-card">
                  <h3>Импорт и обновление каталога</h3>
                  <p>
                    Файл проверяется до применения. Для обновления встроенных
                    данных или восстановления показывается сравнение с текущим
                    черновиком.
                  </p>
                  <div className="action-row">
                    <button
                      className="button"
                      disabled={readOnly}
                      onClick={() => fileRef.current?.click()}
                    >
                      <FileJson size={14} />
                      Выбрать JSON
                    </button>
                    <input
                      ref={fileRef}
                      hidden
                      aria-label="JSON-файл каталога"
                      type="file"
                      accept="application/json,.json"
                      onChange={importConfig}
                    />
                    <button
                      className="button"
                      disabled={readOnly}
                      onClick={() =>
                        setPending({
                          config: cloneDefaultConfig(),
                          title:
                            "Обновление / восстановление встроенного каталога",
                          warnings: [],
                        })
                      }
                    >
                      Сравнить со встроенным каталогом
                    </button>
                  </div>
                </div>
                <div className="panel settings-card">
                  <h3>Версия конфигурации</h3>
                  <div className="metric-grid">
                    <div className="metric">
                      <span>Схема</span>
                      <b>{draft.schemaVersion}</b>
                    </div>
                    <div className="metric">
                      <span>Версия каталога</span>
                      <b>{draft.catalogVersion}</b>
                    </div>
                    <div className="metric">
                      <span>Действующая ревизия</span>
                      <b>{currentRevision}</b>
                    </div>
                    <div className="metric">
                      <span>Черновик</span>
                      <b>{dirty ? "Изменён" : "Сохранён"}</b>
                    </div>
                  </div>
                </div>
                <div className="panel settings-card">
                  <h3>История ревизий</h3>
                  {store.history.length === 0 ? (
                    <p>История появится после первого сохранения.</p>
                  ) : (
                    <div className="config-table-wrap">
                      <table className="config-table">
                        <thead>
                          <tr>
                            <th scope="col">Ревизия</th>
                            <th scope="col">Дата</th>
                            <th scope="col">Изменение</th>
                            <th scope="col">Автор</th>
                            <th scope="col">Просмотр</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.history.map((item) => (
                            <tr key={item.revision}>
                              <td>{item.revision}</td>
                              <td>
                                {new Date(item.updatedAt).toLocaleString(
                                  "ru-RU",
                                )}
                              </td>
                              <td>{item.message}</td>
                              <td>{item.actor || "Этот браузер"}</td>
                              <td>
                                <button
                                  className="button"
                                  onClick={() =>
                                    void previewHistory(item.revision)
                                  }
                                >
                                  Сравнить
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
            {dirty && (
              <section className="panel settings-card">
                <label className="field">
                  <span>Описание изменения для истории</span>
                  <input
                    className="control"
                    value={changeMessage}
                    disabled={readOnly}
                    maxLength={1000}
                    onChange={(event) => setChangeMessage(event.target.value)}
                    placeholder="Например: обновлены предложения аренды H200"
                  />
                </label>
                <details>
                  <summary>Проверить изменения перед сохранением</summary>
                  <DiffPreview before={base} after={draft} />
                </details>
              </section>
            )}
          </section>
        </div>
      )}
      <footer className="footer-note">
        <span>
          {store.mode === "shared"
            ? "Общий каталог · доступ по ролям · история ревизий"
            : "Локальный каталог · черновики и история в этом браузере"}
        </span>
        <span>Ревизия {currentRevision}</span>
      </footer>
    </main>
  );
}
