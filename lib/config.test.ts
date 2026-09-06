import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaultConfig, parseConfig, validateConfig } from "./config";

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
  assert.equal(result.config.assumptions.defaultHoursMonth, 217);
  assert.deepEqual(result.config.models, legacy.models);
  assert.deepEqual(result.config.deploymentProfiles, legacy.deploymentProfiles);
  assert.equal(result.config.scenarioPresets.length, 4);
  assert.equal(result.config.defaultScenarioId, "pilot");
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
        config.scenarioPresets[1].id = config.scenarioPresets[0].id;
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
