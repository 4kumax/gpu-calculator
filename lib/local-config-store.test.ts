import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaultConfig, LEGACY_STORAGE_KEY, STORAGE_KEY } from "./config";
import {
  clearDraft,
  configDifferences,
  DRAFT_KEY,
  HISTORY_KEY,
  isConfigStorageKey,
  mergeDraftChanges,
  readDraft,
  readLocalConfig,
  readLocalHistory,
  RECOVERY_KEY,
  saveDraft,
  saveLocalConfig,
  StorageLike,
} from "./local-config-store";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  readError = false;
  failKey: string | null = null;
  getItem(key: string) {
    if (this.readError) throw new Error("Denied");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) {
      const error = new Error("Full");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

test("CAS отклоняет устаревшую ревизию и сохраняет опубликованные изменения", () => {
  const storage = new MemoryStorage(),
    base = cloneDefaultConfig();
  const first = structuredClone(base);
  first.models[0].name = "Изменение первой вкладки";
  const published = saveLocalConfig(storage, first, {
    expectedRevision: base.revision,
  });
  assert.equal(published.ok, true);
  const second = structuredClone(base);
  second.models[0].name = "Изменение второй вкладки";
  const rejected = saveLocalConfig(storage, second, {
    expectedRevision: base.revision,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.conflict, true);
  assert.equal(rejected.current?.revision, base.revision + 1);
  assert.equal(
    readLocalConfig(storage).config.models[0].name,
    first.models[0].name,
  );
});

test("исчерпание квоты не сообщает об успешном сохранении и не меняет каталог", () => {
  const storage = new MemoryStorage(),
    base = cloneDefaultConfig();
  storage.setItem(STORAGE_KEY, JSON.stringify(base));
  storage.failKey = STORAGE_KEY;
  const changed = structuredClone(base);
  changed.models[0].name = "Не записано";
  const result = saveLocalConfig(storage, changed, {
    expectedRevision: base.revision,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /недостаточно места/);
  assert.deepEqual(readLocalConfig(storage).config, base);
});

test("запрет чтения хранилища виден и не допускает запись поверх неизвестного состояния", () => {
  const storage = new MemoryStorage();
  storage.readError = true;
  assert.match(readLocalConfig(storage).error ?? "", /запретил доступ/);
  const result = saveLocalConfig(storage, cloneDefaultConfig(), {
    expectedRevision: cloneDefaultConfig().revision,
  });
  assert.equal(result.ok, false);
  assert.equal(storage.data.size, 0);
});

test("повреждённый JSON сохраняется до явного восстановления и резервируется при замене", () => {
  const storage = new MemoryStorage(),
    raw = '{"schemaVersion":3,broken';
  storage.setItem(STORAGE_KEY, raw);
  const snapshot = readLocalConfig(storage);
  assert.equal(snapshot.recoveryRaw, raw);
  assert.ok(snapshot.error);
  assert.equal(
    saveLocalConfig(storage, cloneDefaultConfig(), {
      expectedRevision: snapshot.config.revision,
    }).ok,
    false,
  );
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const result = saveLocalConfig(storage, cloneDefaultConfig(), {
    expectedRevision: snapshot.config.revision,
    recover: true,
  });
  assert.equal(result.ok, true);
  assert.equal(storage.getItem(RECOVERY_KEY), raw);
});

test("история содержит предыдущую ревизию, а ошибка истории не скрывает результат основной записи", () => {
  const storage = new MemoryStorage(),
    base = cloneDefaultConfig();
  const first = saveLocalConfig(storage, base, {
    expectedRevision: base.revision,
    message: "Первая ревизия",
  });
  assert.equal(first.ok, true);
  assert.deepEqual(
    readLocalHistory(storage).map((row) => row.revision),
    [base.revision + 1, base.revision],
  );
  storage.failKey = HISTORY_KEY;
  const second = saveLocalConfig(storage, first.config, {
    expectedRevision: first.config!.revision,
  });
  assert.equal(second.ok, true);
  assert.match(second.warnings.join(" "), /история не записана/);
  assert.equal(readLocalConfig(storage).config.revision, base.revision + 2);
});

test("миграция v2 сохраняет исходный файл до явного сохранения v4", () => {
  const storage = new MemoryStorage();
  const {
    catalogVersion,
    catalogUpdateVersion,
    deploymentProfiles,
    qualityAssessments,
    scenarioPresets,
    defaultScenarioId,
    ...base
  } = cloneDefaultConfig();
  void catalogVersion;
  void catalogUpdateVersion;
  void deploymentProfiles;
  void qualityAssessments;
  void scenarioPresets;
  void defaultScenarioId;
  const { defaultInputTokens, defaultOutputTokens, ...assumptions } =
    base.assumptions;
  void defaultInputTokens;
  void defaultOutputTokens;
  const legacy = {
    ...base,
    schemaVersion: 2,
    assumptions,
    gpus: base.gpus.map(({ purchaseQuote, rentalQuote, ...gpu }) => {
      void purchaseQuote;
      void rentalQuote;
      return gpu;
    }),
  };
  const raw = JSON.stringify(legacy);
  storage.setItem(LEGACY_STORAGE_KEY, raw);
  const loaded = readLocalConfig(storage);
  assert.equal(loaded.error, null);
  assert.equal(loaded.config.schemaVersion, 4);
  assert.ok(loaded.warnings.length);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw);
  assert.equal(
    saveLocalConfig(storage, loaded.config, {
      expectedRevision: loaded.config.revision,
    }).ok,
    true,
  );
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw);
});

test("черновик восстанавливает временно незаполненные поля без публикации", () => {
  const storage = new MemoryStorage(),
    base = cloneDefaultConfig(),
    draft = structuredClone(base);
  draft.models[0].name = "";
  draft.gpus[0].nodePriceRub = -1;
  assert.equal(
    saveDraft(storage, {
      config: draft,
      baseConfig: base,
      updatedAt: new Date().toISOString(),
      mode: "local",
    }),
    null,
  );
  const restored = readDraft(storage);
  assert.equal(restored.error, null);
  assert.deepEqual(restored.draft?.config, draft);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test("черновики разных вкладок изолированы, отмена одного не удаляет другой", () => {
  const storage = new MemoryStorage(),
    base = cloneDefaultConfig();
  const first = structuredClone(base);
  first.models[0].name = "Первая вкладка";
  const second = structuredClone(base);
  second.models[0].name = "Вторая вкладка";
  for (const [slot, config] of [
    ["first", first],
    ["second", second],
  ] as const)
    saveDraft(
      storage,
      {
        config,
        baseConfig: base,
        updatedAt: new Date().toISOString(),
        mode: "local",
      },
      slot,
    );
  assert.equal(
    readDraft(storage, "first").draft?.config.models[0].name,
    "Первая вкладка",
  );
  clearDraft(storage, "first");
  assert.equal(readDraft(storage, "first").draft, null);
  assert.equal(
    readDraft(storage, "second").draft?.config.models[0].name,
    "Вторая вкладка",
  );
});

test("небезопасная структура черновика отклоняется с сохранением raw для восстановления", () => {
  const changes = [
    (value: Record<string, unknown>) => {
      value.qualityAssessments = [null];
    },
    (value: Record<string, unknown>) => {
      (value.models as Array<Record<string, unknown>>)[0].name = 123;
    },
    (value: Record<string, unknown>) => {
      (
        value.deploymentProfiles as Array<Record<string, unknown>>
      )[0].benchmark = { inputTokens: { bad: 1 } };
    },
    (value: Record<string, unknown>) => {
      (value.models as Array<Record<string, unknown>>)[0].checkpointWeightGb =
        "12";
    },
  ];
  for (const mutate of changes) {
    const storage = new MemoryStorage(),
      base = cloneDefaultConfig(),
      candidate = structuredClone(base) as unknown as Record<string, unknown>;
    mutate(candidate);
    const raw = JSON.stringify({
      config: candidate,
      baseConfig: base,
      mode: "local",
      updatedAt: new Date().toISOString(),
    });
    storage.setItem(DRAFT_KEY, raw);
    const restored = readDraft(storage);
    assert.equal(restored.draft, null);
    assert.ok(restored.error);
    assert.equal(restored.recoveryRaw, raw);
    assert.equal(storage.getItem(DRAFT_KEY), raw);
  }
});

test("предпросмотр показывает содержательные изменения и игнорирует назначаемую ревизию", () => {
  const before = cloneDefaultConfig(),
    after = structuredClone(before);
  after.revision += 100;
  after.updatedAt = new Date().toISOString();
  assert.deepEqual(configDifferences(before, after), []);
  after.gpus[0].purchaseQuote.terms = "НДС включён";
  assert.deepEqual(
    configDifferences(before, after).map((item) => item.path),
    [`gpus[${after.gpus[0].id}].purchaseQuote.terms`],
  );
});

test("перенос черновика сохраняет чужие независимые изменения и явно отдаёт приоритет своему конфликтующему полю", () => {
  const base = cloneDefaultConfig(),
    mine = structuredClone(base),
    current = structuredClone(base);
  mine.models[0].name = "Моё название";
  mine.gpus[0].purchaseQuote.terms = "Мои условия";
  current.models[0].name = "Чужое название";
  current.models[0].note = "Чужое независимое примечание";
  current.gpus[1].rentPerGpuHourRub = 999;
  current.revision += 1;
  const merged = mergeDraftChanges(base, mine, current);
  assert.equal(merged.models[0].name, mine.models[0].name);
  assert.equal(merged.models[0].note, current.models[0].note);
  assert.equal(
    merged.gpus[0].purchaseQuote.terms,
    mine.gpus[0].purchaseQuote.terms,
  );
  assert.equal(merged.gpus[1].rentPerGpuHourRub, 999);
  assert.equal(merged.revision, current.revision);
});

test("события черновиков и посторонних ключей не обновляют активный каталог", () => {
  for (const key of [DRAFT_KEY, `${DRAFT_KEY}:tab`, HISTORY_KEY, "unrelated"])
    assert.equal(isConfigStorageKey(key), false);
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY, null])
    assert.equal(isConfigStorageKey(key), true);
});

test("v3 draft migration preserves incomplete edits and adds scenario defaults without mutating raw", () => {
  const storage = new MemoryStorage();
  const config: Record<string, any> = structuredClone(cloneDefaultConfig());
  config.schemaVersion = 3;
  delete config.catalogUpdateVersion;
  delete config.scenarioPresets;
  delete config.defaultScenarioId;
  delete config.assumptions.defaultInputTokens;
  delete config.assumptions.defaultOutputTokens;
  const draft = structuredClone(config);
  draft.models[0].name = "";
  const envelope = {
    config: draft,
    baseConfig: config,
    updatedAt: "2026-09-06T12:00:00.000Z",
    mode: "local",
  };
  const raw = JSON.stringify(envelope);
  storage.setItem(DRAFT_KEY, raw);
  const loaded = readDraft(storage);
  assert.equal(loaded.error, null);
  assert.equal(loaded.draft?.config.schemaVersion, 4);
  assert.equal(loaded.draft?.config.models[0].name, "");
  assert.equal(loaded.draft?.config.scenarioPresets.length, 1);
  assert.equal(storage.getItem(DRAFT_KEY), raw);
});

test("historical catalog reads preserve the original monthly policy and GPU list", () => {
  const storage = new MemoryStorage();
  const old = cloneDefaultConfig();
  delete old.catalogUpdateVersion;
  old.gpus = old.gpus.filter((gpu) => gpu.id !== "h20");
  old.assumptions.defaultHoursMonth = 360;
  old.scenarioPresets[0].input.hoursMonth = 160;
  old.scenarioPresets[0].input.rentalMode = "gpu-hour";
  storage.setItem(
    HISTORY_KEY,
    JSON.stringify([
      { config: old, message: "До перехода на постоянную работу" },
    ]),
  );
  assert.deepEqual(readLocalHistory(storage)[0].config, old);
});
