import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneDefaultConfig,
  createBusinessScenarioPresets,
  createAdditionalBusinessTasks,
  parseConfig,
  validateConfig,
} from "./config";

const plain = (): Record<string, any> =>
  JSON.parse(JSON.stringify(cloneDefaultConfig()));

test("unknown import is validated before any typed property is used", () => {
  for (const payload of [
    null,
    undefined,
    true,
    1,
    "config",
    [],
    { models: [null] },
    { schemaVersion: 3 },
  ]) {
    assert.doesNotThrow(() => validateConfig(payload));
    assert.equal(parseConfig(payload).config, null);
  }
});

test("import reports exact paths for every malformed scalar and nested structure", () => {
  const mutations: Array<[string, (config: Record<string, any>) => void]> = [
    [
      "models[0].name",
      (config) => {
        config.models[0].name = 123;
      },
    ],
    [
      "models[0].enabled",
      (config) => {
        config.models[0].enabled = "true";
      },
    ],
    [
      "gpus[0].enabled",
      (config) => {
        config.gpus[0].enabled = 1;
      },
    ],
    [
      "tasks[0].enabled",
      (config) => {
        config.tasks[0].enabled = null;
      },
    ],
    [
      "models[0].sourceDate",
      (config) => {
        config.models[0].sourceDate = "2026-02-30";
      },
    ],
    [
      "config.updatedAt",
      (config) => {
        config.updatedAt = "2026-09-02T24:00:00Z";
      },
    ],
    [
      "config.revision",
      (config) => {
        config.revision = 0.5;
      },
    ],
    [
      "config.catalogVersion",
      (config) => {
        config.catalogVersion = 3;
      },
    ],
    [
      "gpus[0].purchaseQuote.sourceDate",
      (config) => {
        config.gpus[0].purchaseQuote.sourceDate = {};
      },
    ],
    [
      "gpus[0].rentalQuote.kind",
      (config) => {
        config.gpus[0].rentalQuote.kind = "verified";
      },
    ],
    [
      "models[0].sourceUrl",
      (config) => {
        config.models[0].sourceUrl = "javascript:alert(1)";
      },
    ],
    [
      "gpus[0].sourceUrl",
      (config) => {
        config.gpus[0].sourceUrl = "https://user:password@example.com";
      },
    ],
    [
      "deploymentProfiles[0].benchmark",
      (config) => {
        config.deploymentProfiles[0].benchmark = null;
      },
    ],
    [
      "deploymentProfiles[0].maxConcurrency",
      (config) => {
        config.deploymentProfiles[0].maxConcurrency = Infinity;
      },
    ],
    [
      "assumptions.operationsMonthRub",
      (config) => {
        delete config.assumptions.operationsMonthRub;
      },
    ],
    [
      "tasks[0].requiredCapabilities",
      (config) => {
        config.tasks[0].requiredCapabilities = ["missing"];
      },
    ],
    [
      "models[0].precision",
      (config) => {
        config.models[0].precision = [];
      },
    ],
  ];
  for (const [path, mutate] of mutations) {
    const config = plain();
    mutate(config);
    const result = parseConfig(config);
    assert.equal(result.config, null, path);
    assert.ok(
      result.errors.some((error) => error.includes(path)),
      `${path}: ${result.errors.join("; ")}`,
    );
  }
});

test("strict schema rejects unknown inherited-key spellings and duplicate IDs", () => {
  const config = plain();
  Object.defineProperty(config, "__proto__", {
    value: { polluted: true },
    enumerable: true,
  });
  config.models[0].toString = "unexpected";
  config.gpus[1].id = config.gpus[0].id;
  const errors = validateConfig(config).join("\n");
  assert.match(errors, /config.__proto__/);
  assert.match(errors, /models\[0\].toString/);
  assert.match(errors, /идентификатор должен быть уникальным/);
});

test("schema-2 migration preserves prices but never attributes an unverified rental quote", () => {
  const legacy = plain();
  legacy.schemaVersion = 2;
  delete legacy.catalogUpdateVersion;
  delete legacy.catalogVersion;
  delete legacy.deploymentProfiles;
  delete legacy.qualityAssessments;
  delete legacy.scenarioPresets;
  delete legacy.defaultScenarioId;
  delete legacy.assumptions.defaultInputTokens;
  delete legacy.assumptions.defaultOutputTokens;
  for (const gpu of legacy.gpus) {
    delete gpu.purchaseQuote;
    delete gpu.rentalQuote;
  }
  const result = parseConfig(legacy);
  assert.ok(result.config, result.errors.join("\n"));
  assert.equal(result.config.schemaVersion, 4);
  assert.equal(result.config.revision, legacy.revision);
  assert.equal(
    result.config.gpus.find((gpu) => gpu.id === "h200")?.rentPerGpuHourRub,
    587.67,
  );
  const quote = result.config.gpus.find(
    (gpu) => gpu.id === "h200",
  )!.rentalQuote;
  assert.equal(quote.kind, "Инженерная оценка");
  assert.equal(quote.sourceUrl, "");
  assert.equal(quote.sourceDate, "");
  assert.ok(
    result.config.deploymentProfiles.every(
      (profile) => profile.status === "estimated" && !profile.benchmark,
    ),
  );
  assert.deepEqual(result.config.qualityAssessments, []);
  assert.ok(result.warnings.length);
  assert.equal(
    legacy.schemaVersion,
    2,
    "migration must not mutate source payload",
  );
  legacy.models[0].name = 123;
  assert.equal(
    parseConfig(legacy).config,
    null,
    "migration cannot hide invalid old fields",
  );
});

test("revision zero is valid for an unpublished shared catalogue", () => {
  const config = cloneDefaultConfig();
  config.revision = 0;
  assert.deepEqual(validateConfig(config), []);
});

test("measured profiles require provenance, real benchmark fields and compatible topology", () => {
  const config = cloneDefaultConfig();
  const profile = config.deploymentProfiles[0];
  profile.status = "measured";
  assert.match(validateConfig(config).join("\n"), /измеренный профиль требует/);
  profile.sourceUrl = "https://example.com/benchmark";
  profile.sourceDate = "2026-09-02";
  profile.benchmark = {
    inputTokens: 1000,
    outputTokens: 1000,
    concurrency: 8,
    ttftMs: 250,
    tokensPerSecond: 25,
  };
  assert.deepEqual(validateConfig(config), []);
  profile.tensorParallel = profile.gpuCount + 1;
  assert.match(validateConfig(config).join("\n"), /tensorParallel/);
  profile.tensorParallel = profile.gpuCount;
  profile.benchmark.concurrency = profile.maxConcurrency + 1;
  assert.match(
    validateConfig(config).join("\n"),
    /нагрузка выходит за границы/,
  );
  profile.workspaceGbPerGpu = 1_000_000;
  assert.match(validateConfig(config).join("\n"), /workspace должен оставлять/);
});

test("quality assessments require target links and measurable evidence", () => {
  const config = cloneDefaultConfig();
  config.qualityAssessments = [
    {
      id: "qa",
      modelId: config.models[0].id,
      taskId: "search",
      status: "measured",
      qualityTier: 2,
      sampleSize: 20,
      dataset: "Договоры v1",
      sourceUrl: "https://example.com/evaluation",
      sourceDate: "2026-09-02",
      notes: "",
      correctAnswerPct: 80,
    },
  ];
  assert.deepEqual(validateConfig(config), []);
  config.qualityAssessments[0].sampleSize = 0;
  assert.match(validateConfig(config).join("\n"), /требует выборку/);
  config.qualityAssessments[0].sampleSize = 20;
  config.qualityAssessments[0].taskId = "missing";
  assert.match(validateConfig(config).join("\n"), /отсутствующая задача/);
  config.qualityAssessments[0].correctAnswerPct = 101;
  assert.match(validateConfig(config).join("\n"), /correctAnswerPct/);
});

test("source dates may be missing only as explicit uncertainty, and public quotes require evidence", () => {
  const config = cloneDefaultConfig();
  config.gpus[0].purchaseQuote.kind = "Публичная цена";
  config.gpus[0].purchaseQuote.sourceUrl = "";
  assert.match(
    validateConfig(config).join("\n"),
    /публичная или коммерческая цена требует источник/,
  );
});

test("an enabled alternative deployment profile can replace a disabled legacy recommendation", () => {
  const config = cloneDefaultConfig();
  const model = config.models.find((item) => item.id === "qwen38-27b")!;
  config.models = [model];
  const profile = config.deploymentProfiles.find(
    (item) => item.modelId === model.id,
  )!;
  config.deploymentProfiles = [
    { ...profile, id: "qwen-alternative", gpuId: "l40s" },
  ];
  config.gpus.find((gpu) => gpu.id === model.recommendedGpuId)!.enabled = false;
  assert.deepEqual(validateConfig(config), []);
});

test("schema-3 migration adds explicit business workloads without changing existing catalog values", () => {
  const legacy = plain();
  legacy.schemaVersion = 3;
  delete legacy.catalogUpdateVersion;
  delete legacy.scenarioPresets;
  delete legacy.defaultScenarioId;
  delete legacy.assumptions.defaultInputTokens;
  delete legacy.assumptions.defaultOutputTokens;
  legacy.assumptions.defaultHoursMonth = 217;
  legacy.gpus[0].nodePriceRub = 1234567;
  const before = structuredClone(legacy);
  const result = parseConfig(legacy);
  assert.ok(result.config, result.errors.join("\n"));
  assert.equal(result.config.schemaVersion, 4);
  assert.equal(result.config.gpus[0].nodePriceRub, 1234567);
  assert.equal(result.config.assumptions.defaultHoursMonth, 720);
  assert.deepEqual(result.config.models, legacy.models);
  assert.deepEqual(result.config.deploymentProfiles, legacy.deploymentProfiles);
  assert.equal(result.config.scenarioPresets.length, 1);
  assert.equal(result.config.defaultScenarioId, "calculation-defaults");
  assert.ok(
    result.config.scenarioPresets.every(
      (preset) =>
        preset.input.inputTokens > 0 && preset.input.inputTokens <= 32768,
    ),
  );
  assert.deepEqual(legacy, before);
  assert.ok(result.warnings.some((warning) => warning.includes("v3")));
});

test("business scenario validation rejects missing workloads and invalid references before publication", () => {
  const cases: Array<[string, (config: Record<string, any>) => void]> = [
    [
      "defaultScenarioId",
      (config) => {
        config.defaultScenarioId = "missing";
      },
    ],
    [
      "defaultScenarioId",
      (config) => {
        config.scenarioPresets[0].enabled = false;
      },
    ],
    [
      "scenarioPresets[0].input.inputTokens",
      (config) => {
        config.scenarioPresets[0].input.inputTokens = 0;
      },
    ],
    [
      "scenarioPresets[0].input.reserveRentalMode",
      (config) => {
        delete config.scenarioPresets[0].input.reserveRentalMode;
      },
    ],
    [
      "scenarioPresets[0].input.taskIds",
      (config) => {
        config.scenarioPresets[0].input.taskIds = ["missing"];
      },
    ],
    [
      "scenarioPresets[0].input.gpuId",
      (config) => {
        config.scenarioPresets[0].input.gpuId = "missing";
      },
    ],
    [
      "scenarioPresets[0].input.modelId",
      (config) => {
        config.scenarioPresets[0].input.modelId = "missing";
      },
    ],
    [
      "scenarioPresets[1].id",
      (config) => {
        config.scenarioPresets.push(structuredClone(config.scenarioPresets[0]));
      },
    ],
  ];
  for (const [path, mutate] of cases) {
    const config = plain();
    mutate(config);
    const result = parseConfig(config);
    assert.equal(result.config, null, path);
    assert.ok(
      result.errors.some((error) => error.includes(path)),
      `${path}: ${result.errors.join(" ")}`,
    );
  }
});

test("migration corrects only the unmodified built-in Kimi weight assumption", () => {
  const legacy = plain();
  legacy.schemaVersion = 3;
  delete legacy.catalogUpdateVersion;
  delete legacy.scenarioPresets;
  delete legacy.defaultScenarioId;
  delete legacy.assumptions.defaultInputTokens;
  delete legacy.assumptions.defaultOutputTokens;
  const kimi = legacy.models.find(
    (model: Record<string, any>) => model.id === "kimi-k3",
  );
  delete kimi.checkpointWeightGb;
  const fixed = parseConfig(legacy);
  assert.equal(
    fixed.config?.models.find((model) => model.id === "kimi-k3")
      ?.checkpointWeightGb,
    1560.860324864,
  );
  assert.ok(fixed.warnings.some((warning) => warning.includes("Kimi")));
  assert.equal(kimi.checkpointWeightGb, undefined);
  kimi.checkpointWeightGb = 1700;
  assert.equal(
    parseConfig(legacy).config?.models.find((model) => model.id === "kimi-k3")
      ?.checkpointWeightGb,
    1700,
  );
  delete kimi.checkpointWeightGb;
  kimi.sourceUrl = "https://example.com/custom-checkpoint";
  assert.equal(
    parseConfig(legacy).config?.models.find((model) => model.id === "kimi-k3")
      ?.checkpointWeightGb,
    undefined,
  );
  kimi.sourceUrl = "https://huggingface.co/moonshotai/Kimi-K3";
  kimi.bitsPerWeight = 8;
  assert.equal(
    parseConfig(legacy).config?.models.find((model) => model.id === "kimi-k3")
      ?.checkpointWeightGb,
    undefined,
  );
});

test("fresh defaults retain the original combined corporate scenarios and workload", () => {
  const config = cloneDefaultConfig();
  const preset = config.scenarioPresets.find(
    (item) => item.id === config.defaultScenarioId,
  )!;
  assert.equal(config.tasks.length, 18);
  assert.deepEqual(preset.input.taskIds, [
    "contracts",
    "estimates",
    "incidents",
    "agents",
  ]);
  assert.equal(preset.input.concurrency, 8);
  assert.equal(preset.input.hoursMonth, 720);
  assert.equal(preset.input.rentalMode, "dedicated-node");
  assert.equal(preset.input.reserveRentalMode, "always-on");
  assert.equal(config.assumptions.defaultHoursMonth, 720);
  assert.equal(config.catalogUpdateVersion, 2);
  assert.equal(preset.input.years, 3);
  assert.equal(preset.input.priority, "balance");
  assert.equal(preset.input.months, 36);
});

test("untouched generated group defaults are retired without deleting records or user edits", () => {
  const old = cloneDefaultConfig();
  delete old.catalogUpdateVersion;
  old.scenarioPresets = createBusinessScenarioPresets(old.tasks);
  old.defaultScenarioId = "pilot";
  const original = structuredClone(old);
  const normalized = parseConfig(old);
  assert.ok(normalized.config);
  assert.equal(normalized.config.defaultScenarioId, "calculation-defaults");
  assert.deepEqual(
    normalized.config.scenarioPresets.slice(0, 4),
    old.scenarioPresets,
  );
  assert.deepEqual(normalized.config.gpus, old.gpus);
  assert.deepEqual(old, original);
  assert.ok(normalized.warnings.length);
  assert.deepEqual(
    parseConfig(old, { preserveCalculationDefaults: true }).config,
    old,
    "immutable snapshots retain their own default records",
  );
  old.scenarioPresets[0].input.hoursMonth = 217;
  const edited = parseConfig(old);
  assert.equal(edited.config?.defaultScenarioId, "pilot");
  assert.equal(edited.config?.scenarioPresets[0].input.hoursMonth, 720);
  assert.equal(
    edited.config?.scenarioPresets[0].input.concurrency,
    old.scenarioPresets[0].input.concurrency,
  );
});

test("live catalogs apply the 720-hour dedicated policy once while preserving custom prices and workload", () => {
  for (const hoursMonth of [160, 360, 730]) {
    const old = cloneDefaultConfig();
    delete old.catalogUpdateVersion;
    old.gpus = old.gpus.filter((gpu) => gpu.id !== "h20");
    old.catalogVersion = "customer-prices-17";
    old.assumptions.defaultHoursMonth = hoursMonth;
    old.assumptions.electricityRubKwh = 18;
    const active = old.scenarioPresets.find(
      (preset) => preset.id === old.defaultScenarioId,
    )!;
    active.input = {
      ...active.input,
      taskIds: ["frontier", "contracts"],
      concurrency: 13,
      inputTokens: 25000,
      outputTokens: 2500,
      years: 2,
      hoursMonth,
      rentalMode: "gpu-hour",
      reserveRentalMode: "active-hours",
    };
    old.gpus[0].nodePriceRub = 9876543;
    const original = structuredClone(old);
    const migrated = parseConfig(old);
    assert.ok(migrated.config, migrated.errors.join(" "));
    const config = migrated.config;
    assert.equal(config.catalogUpdateVersion, 2);
    assert.equal(config.catalogVersion, "customer-prices-17");
    assert.equal(config.assumptions.defaultHoursMonth, 720);
    assert.equal(config.assumptions.electricityRubKwh, 18);
    assert.deepEqual(config.scenarioPresets[0].input, {
      ...active.input,
      hoursMonth: 720,
      rentalMode: "dedicated-node",
      reserveRentalMode: "always-on",
    });
    assert.deepEqual(config.gpus.slice(0, -1), old.gpus);
    assert.equal(config.gpus.at(-1)?.id, "h20");
    assert.deepEqual(old, original, "migration must not mutate input");
    assert.deepEqual(parseConfig(config).config, config);
    assert.deepEqual(
      parseConfig(config).warnings,
      [],
      "policy migration must run only once",
    );
    config.scenarioPresets[0].input.hoursMonth = 240;
    config.scenarioPresets[0].input.rentalMode = "gpu-hour";
    assert.equal(
      parseConfig(config).config?.scenarioPresets[0].input.hoursMonth,
      240,
      "future explicit edits remain editable",
    );
  }
});

test("H20 addition is factual about memory, explicit about prices and never creates launch profiles", () => {
  const config = cloneDefaultConfig();
  const h20 = config.gpus.find((gpu) => gpu.id === "h20")!;
  assert.ok(h20);
  assert.equal(h20.memoryGb, 96);
  assert.equal(h20.vendor, "NVIDIA");
  assert.match(h20.sourceUrl, /^https:\/\/docs\.nvidia\.com\//);
  assert.equal(h20.purchaseQuote.kind, "Инженерная оценка");
  assert.equal(h20.rentalQuote.kind, "Инженерная оценка");
  assert.equal(h20.purchaseQuote.sourceUrl, "");
  assert.equal(h20.rentalQuote.sourceUrl, "");
  assert.ok(h20.nodePriceRub > 0 && h20.rentPerGpuHourRub > 0);
  assert.ok(
    !config.deploymentProfiles.some((profile) => profile.gpuId === "h20"),
  );
  assert.ok(!config.models.some((model) => model.recommendedGpuId === "h20"));
  for (const id of ["h20", "custom-nvidia-h20"]) {
    const old = cloneDefaultConfig();
    delete old.catalogUpdateVersion;
    const existing = old.gpus.find((gpu) => gpu.id === "h20")!;
    existing.id = id;
    existing.enabled = false;
    existing.nodePriceRub = 7777777;
    existing.rentPerGpuHourRub = 219;
    existing.sourceUrl = "https://example.com/customer-h20";
    const before = structuredClone(existing);
    const migrated = parseConfig(old);
    assert.ok(migrated.config);
    assert.equal(migrated.config.gpus.length, old.gpus.length);
    assert.deepEqual(
      migrated.config.gpus.find((gpu) => gpu.id === id),
      before,
    );
  }
});

test("immutable catalog snapshots bypass new always-on defaults and additive GPU updates", () => {
  const old = cloneDefaultConfig();
  delete old.catalogUpdateVersion;
  old.gpus = old.gpus.filter((gpu) => gpu.id !== "h20");
  old.assumptions.defaultHoursMonth = 730;
  old.scenarioPresets[0].input.hoursMonth = 160;
  old.scenarioPresets[0].input.rentalMode = "gpu-hour";
  old.scenarioPresets[0].input.reserveRentalMode = "active-hours";
  const parsed = parseConfig(old, { preserveCalculationDefaults: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.config, old);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.config?.catalogUpdateVersion, undefined);
  const marked = cloneDefaultConfig();
  marked.scenarioPresets[0].input.hoursMonth = 730;
  assert.equal(
    parseConfig(marked).config,
    null,
    "future live defaults cannot exceed the current monthly hours",
  );
  assert.ok(
    parseConfig(marked, { preserveCalculationDefaults: true }).config,
    "historical snapshots keep their earlier monthly norm",
  );
});

test("monthly horizon update changes existing annual defaults once and keeps other user policies", () => {
  for (const existingMonths of [undefined, 12]) {
    const old = cloneDefaultConfig();
    old.catalogUpdateVersion = 1;
    old.tasks = old.tasks.slice(0, 12);
    old.scenarioPresets[0].input.years = 1;
    old.scenarioPresets[0].input.months = existingMonths;
    if (existingMonths === undefined)
      delete old.scenarioPresets[0].input.months;
    old.scenarioPresets[0].input.hoursMonth = 240;
    old.scenarioPresets[0].input.rentalMode = "gpu-hour";
    old.scenarioPresets[0].input.concurrency = 19;
    old.gpus[0].nodePriceRub = 8765432;
    const before = structuredClone(old);
    const migrated = parseConfig(old);
    assert.ok(migrated.config, migrated.errors.join(" "));
    assert.equal(migrated.config.catalogUpdateVersion, 2);
    assert.equal(migrated.config.scenarioPresets[0].input.months, 36);
    assert.equal(
      migrated.config.scenarioPresets[0].input.years,
      1,
      "legacy data is preserved while explicit months controls calculation",
    );
    assert.equal(migrated.config.scenarioPresets[0].input.hoursMonth, 240);
    assert.equal(
      migrated.config.scenarioPresets[0].input.rentalMode,
      "gpu-hour",
    );
    assert.equal(migrated.config.scenarioPresets[0].input.concurrency, 19);
    assert.deepEqual(migrated.config.gpus, old.gpus);
    assert.deepEqual(old, before);
    assert.deepEqual(parseConfig(migrated.config).config, migrated.config);
    assert.deepEqual(parseConfig(migrated.config).warnings, []);
    migrated.config.scenarioPresets[0].input.months = 18;
    assert.equal(
      parseConfig(migrated.config).config?.scenarioPresets[0].input.months,
      18,
    );
  }
});

test("six additive task rules keep all original and customer scenarios, including disabled overrides", () => {
  const old = cloneDefaultConfig();
  old.catalogUpdateVersion = 1;
  old.tasks = old.tasks.slice(0, 12);
  const originals = structuredClone(old.tasks);
  const custom = {
    ...createAdditionalBusinessTasks()[0],
    enabled: false,
    minQualityTier: 4 as const,
    description: "Наше правило поддержки",
  };
  old.tasks.push(custom, {
    ...custom,
    id: "customer-special",
    title: "Особый процесс",
  });
  const migrated = parseConfig(old).config!;
  assert.equal(migrated.tasks.length, 19);
  assert.deepEqual(migrated.tasks.slice(0, 12), originals);
  assert.deepEqual(
    migrated.tasks.find((task) => task.id === custom.id),
    custom,
  );
  assert.ok(migrated.tasks.some((task) => task.id === "customer-special"));
  assert.equal(
    new Set(migrated.tasks.map((task) => task.id)).size,
    migrated.tasks.length,
  );
  assert.deepEqual(migrated.scenarioPresets[0].input.taskIds, [
    "contracts",
    "estimates",
    "incidents",
    "agents",
  ]);
  assert.deepEqual(parseConfig(migrated).config?.tasks, migrated.tasks);
});

test("old immutable snapshots retain twelve tasks and their annual period, while live months are bounded", () => {
  const old = cloneDefaultConfig();
  old.catalogUpdateVersion = 1;
  old.tasks = old.tasks.slice(0, 12);
  old.scenarioPresets[0].input.years = 1;
  delete old.scenarioPresets[0].input.months;
  const parsed = parseConfig(old, { preserveCalculationDefaults: true });
  assert.deepEqual(parsed.config, old);
  assert.deepEqual(parsed.warnings, []);
  const current = cloneDefaultConfig();
  for (const months of [0, 121, 1.5, "36"]) {
    const invalid: Record<string, any> = structuredClone(current);
    invalid.scenarioPresets[0].input.months = months;
    assert.equal(parseConfig(invalid).config, null);
  }
  current.scenarioPresets[0].input.months = 120;
  assert.ok(parseConfig(current).config);
});
