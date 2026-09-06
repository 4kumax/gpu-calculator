import assert from "node:assert/strict";
import test from "node:test";
import {
  calculate,
  calculateSensitivity,
  cumulativeCashflow,
  CalculationInput,
  evaluateModels,
  planModelDeployment,
  HOURS_PER_MONTH,
} from "./calculator";
import { cloneDefaultConfig, DEFAULT_CONFIG, validateConfig } from "./config";

const baseInput: CalculationInput = {
  taskIds: [],
  modelId: "auto",
  gpuId: "auto",
  hoursMonth: 360,
  years: 3,
  concurrency: 8,
  reserveMode: "none",
  largeModelSharePct: 100,
  priority: "balance",
};

const withInput = (patch: Partial<CalculationInput>): CalculationInput => ({
  ...baseInput,
  ...patch,
});

test("исходный каталог проходит строгую валидацию", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

test("MiniMax M3 и Kimi K3 находятся в разных классах качества", () => {
  const miniMax = DEFAULT_CONFIG.models.find(
    (model) => model.id === "minimax-m3",
  );
  const kimi = DEFAULT_CONFIG.models.find((model) => model.id === "kimi-k3");
  const deepSeek = DEFAULT_CONFIG.models.find(
    (model) => model.id === "deepseek-v4-pro",
  );
  assert.equal(miniMax?.qualityTier, 4);
  assert.equal(kimi?.qualityTier, 5);
  assert.equal(deepSeek?.qualityTier, 5);
});

test("параметры не используются как суррогат качества внутри одного класса", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({ taskIds: ["search"], priority: "quality" }),
  );
  assert.equal(result.requiredQualityTier, 1);
  assert.equal(result.model.id, "deepseek-v4-pro");
  assert.ok(result.model.totalParamsB < 2800);
});

test("непрофилированная ёмкость реплики не создаёт преимущества отдельной модели", () => {
  assert.deepEqual(
    [
      ...new Set(
        DEFAULT_CONFIG.models.map((model) => model.sessionsPerReplica),
      ),
    ],
    [8],
  );
});

test("предельная мультимодальная задача допускает Kimi K3, но не MiniMax M3", () => {
  const evaluation = evaluateModels(DEFAULT_CONFIG, ["frontier"]);
  assert.deepEqual(
    evaluation.eligible.map((model) => model.id),
    ["kimi-k3"],
  );
  assert.match(
    evaluation.rejectedReasons["minimax-m3"].join(" "),
    /класс качества 4 ниже требуемого 5/,
  );
});

test("при выборе всех задач Kimi K3 рекомендуется при любом приоритете", () => {
  const taskIds = DEFAULT_CONFIG.tasks
    .filter((task) => task.enabled)
    .map((task) => task.id);
  for (const priority of ["cost", "balance", "quality"] as const) {
    const result = calculate(DEFAULT_CONFIG, withInput({ taskIds, priority }));
    assert.equal(result.model.id, "kimi-k3", priority);
    assert.equal(result.selectionValid, true, priority);
    assert.equal(result.alternatives[0]?.model.id, "kimi-k3", priority);
  }
});

test("сверхдлинный контекст не требует верхнего класса качества", () => {
  const evaluation = evaluateModels(DEFAULT_CONFIG, ["long"]);
  assert.equal(evaluation.req.qualityTier, 3);
  assert.ok(evaluation.eligible.some((model) => model.id === "qwen38-27b"));
  assert.ok(evaluation.eligible.some((model) => model.id === "minimax-m3"));
});

test("альтернативы показывают фактическое количество GPU для заданной нагрузки", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({ taskIds: ["frontier"] }),
  );
  assert.equal(result.alternatives[0]?.gpuCount, result.gpuCount);
  assert.equal(result.alternatives[0]?.model.id, result.model.id);
});

test("ручной выбор MiniMax для задачи класса 5 явно не является рекомендацией", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({ taskIds: ["frontier"], modelId: "minimax-m3" }),
  );
  assert.equal(result.model.id, "minimax-m3");
  assert.equal(result.selectionValid, false);
  assert.match(
    result.selectionReasons.join(" "),
    /класс качества 4 ниже требуемого 5/,
  );
});

test("при отсутствии подходящей модели fallback помечается как сценарий", () => {
  const config = cloneDefaultConfig();
  const kimi = config.models.find((model) => model.id === "kimi-k3");
  assert.ok(kimi);
  kimi.enabled = false;
  const result = calculate(config, withInput({ taskIds: ["frontier"] }));
  assert.equal(result.eligibleModels.length, 0);
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.selectionValid, false);
});

test("память результата учитывает все реплики", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({ taskIds: ["agents"], modelId: "minimax-m3", concurrency: 9 }),
  );
  const model = DEFAULT_CONFIG.models.find(
    (candidate) => candidate.id === "minimax-m3",
  );
  assert.ok(model);
  const plan = planModelDeployment(
    DEFAULT_CONFIG,
    model,
    withInput({ taskIds: ["agents"], modelId: "minimax-m3", concurrency: 9 }),
  );
  assert.ok(plan.replicas > 1);
  assert.equal(
    plan.replicas,
    Math.ceil(plan.effectiveConcurrency / plan.sessionsPerReplica),
  );
  assert.equal(
    result.requiredWeightMemoryGb,
    plan.requiredWeightMemoryPerReplicaGb * plan.replicas,
  );
  assert.equal(result.requiredWeightMemoryGb, plan.requiredWeightMemoryGb);
});

test("нерекомендованный ручной GPU помечается как неподтверждённый", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({ taskIds: ["agents"], modelId: "minimax-m3", gpuId: "rtx4090" }),
  );
  assert.equal(result.selectionValid, false);
  assert.match(
    result.selectionReasons.join(" "),
    /не подтверждены производительность, межсоединение и формат весов/,
  );
});

test("нижняя граница по памяти не подменяет поддержанную топологию профиля", () => {
  const config = cloneDefaultConfig();
  const model = config.models.find((candidate) => candidate.id === "kimi-k25");
  assert.ok(model);
  model.bitsPerWeight = 8;
  model.minGpuCount = 8;
  const plan = planModelDeployment(
    config,
    model,
    withInput({ concurrency: 8 }),
  );
  assert.equal(plan.singleRequestMinGpuCount, 9);
  assert.equal(plan.baseGpuCount, 8);
  assert.equal(
    plan.replicas,
    1,
    "duplicating an impossible instance cannot serve the request",
  );
  assert.equal(plan.gpuCount, 8);
  assert.match(plan.reasons.join(" "), /не вмещает.*9 GPU.*профиле 8/);
});

test("в точке окупаемости TCO покупки и аренды совпадает", () => {
  const input = withInput({ taskIds: ["agents"], modelId: "minimax-m3" });
  const initial = calculate(DEFAULT_CONFIG, input);
  assert.ok(initial.breakEvenHoursMonth !== null);
  const atBreakEven = calculate(DEFAULT_CONFIG, {
    ...input,
    hoursMonth: initial.breakEvenHoursMonth,
  });
  assert.ok(Math.abs(atBreakEven.buyTco - atBreakEven.rentTco) < 1);
});

test("недостижимый порог окупаемости не выходит за пределы 720 ч/мес.", () => {
  const config = cloneDefaultConfig();
  config.gpus.forEach((gpu) => {
    gpu.rentPerGpuHourRub = 0;
  });
  const result = calculate(
    config,
    withInput({ taskIds: ["search"], modelId: "gpt-oss-20b" }),
  );
  assert.equal(result.breakEvenHoursMonth, null);
  assert.equal(result.breakEvenDirection, "never");
});

test("резервный N+1 узел потребляет только idle-мощность", () => {
  const withoutReserve = calculate(
    DEFAULT_CONFIG,
    withInput({
      taskIds: ["agents"],
      modelId: "minimax-m3",
      reserveMode: "none",
    }),
  );
  const withReserve = calculate(
    DEFAULT_CONFIG,
    withInput({
      taskIds: ["agents"],
      modelId: "minimax-m3",
      reserveMode: "nplus1",
    }),
  );
  const a = DEFAULT_CONFIG.assumptions;
  const expectedStandbyPowerRub =
    withReserve.gpu.nodePowerKw *
    720 *
    (a.idlePowerPct / 100) *
    a.pue *
    a.electricityRubKwh;
  assert.ok(
    Math.abs(
      withReserve.monthlyPowerRub -
        withoutReserve.monthlyPowerRub -
        expectedStandbyPowerRub,
    ) < 1,
  );
});

test("валидатор отвергает пустые ID, дробные количества и неизвестные значения", () => {
  const config = cloneDefaultConfig();
  config.models[0].id = "";
  config.models[1].minGpuCount = 1.5;
  config.tasks[0].requiredCapabilities = ["неизвестно" as never];
  config.assumptions.idlePowerPct = 101;
  const errors = validateConfig(config).join("\n");
  assert.match(errors, /models\[0\]\.id/);
  assert.match(errors, /models\[1\]\.minGpuCount/);
  assert.match(errors, /tasks\[0\]\.requiredCapabilities/);
  assert.match(errors, /assumptions\.idlePowerPct/);
});

test("автовыбор остаётся допустимым для всех 4096 комбинаций задач", () => {
  const taskIds = DEFAULT_CONFIG.tasks
    .filter((task) => task.enabled)
    .map((task) => task.id);
  for (let mask = 0; mask < 2 ** taskIds.length; mask += 1) {
    const selected = taskIds.filter((_, index) => mask & (1 << index));
    for (const priority of ["cost", "balance", "quality"] as const) {
      const result = calculate(
        DEFAULT_CONFIG,
        withInput({ taskIds: selected, priority }),
      );
      assert.equal(
        result.selectionValid,
        true,
        `mask=${mask}, priority=${priority}`,
      );
      assert.ok(
        result.eligibleModels.some((model) => model.id === result.model.id),
        `mask=${mask}, priority=${priority}`,
      );
      assert.equal(
        result.alternatives[0]?.model.id,
        result.model.id,
        `mask=${mask}, priority=${priority}`,
      );
    }
  }
});

test("long input and longer output increase KV memory and change GPU provisioning", () => {
  const short = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      taskIds: ["search"],
      inputTokens: 32000,
    }),
  );
  const long = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      taskIds: ["long"],
      inputTokens: 512000,
    }),
  );
  assert.ok(long.requiredKvMemoryGb > short.requiredKvMemoryGb);
  assert.ok(long.gpuCount > short.gpuCount);
  assert.ok(long.rentTco > short.rentTco);
  const longerAnswer = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      inputTokens: 32000,
      outputTokens: 20000,
    }),
  );
  assert.ok(longerAnswer.requiredKvMemoryGb > short.requiredKvMemoryGb);
  assert.equal(
    long.requiredTotalMemoryGb,
    long.requiredWeightMemoryGb +
      long.requiredKvMemoryGb +
      long.requiredWorkspaceMemoryGb,
  );
  assert.ok(long.requiredTotalMemoryGb <= long.availableMemoryGb);
  assert.equal(long.confidence, "estimated");
});

test("small workload shares are not silently clamped to one percent", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      concurrency: 10000,
      largeModelSharePct: 0.1,
    }),
  );
  assert.equal(result.effectiveConcurrency, 10);
  const tiny = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      concurrency: 10000,
      largeModelSharePct: 0.001,
    }),
  );
  assert.equal(tiny.effectiveConcurrency, 1);
});

test("unknown and disabled tasks and malformed workload enums cannot become empty task selections", () => {
  assert.throws(
    () => calculate(DEFAULT_CONFIG, withInput({ taskIds: ["missing"] })),
    /Неизвестные/,
  );
  assert.throws(
    () => evaluateModels(DEFAULT_CONFIG, ["missing"]),
    /Неизвестные/,
  );
  const config = cloneDefaultConfig();
  config.tasks[0].enabled = false;
  assert.throws(
    () => calculate(config, withInput({ taskIds: [config.tasks[0].id] })),
    /выключенные/,
  );
  for (const input of [
    withInput({ reserveMode: "bad" as never }),
    withInput({ priority: "bad" as never }),
    withInput({ rentalMode: "bad" as never }),
    withInput({ inputTokens: NaN }),
    withInput({ outputTokens: -1 }),
    withInput({ targetTtftMs: -1 }),
    withInput({ concurrency: 1.1 }),
    withInput({ years: 6 }),
    withInput({ outputTokens: 0 }),
    withInput({ inputTokens: 10_000_001 }),
    withInput({ minTokensPerSecond: 1_000_001 }),
  ])
    assert.throws(() => calculate(DEFAULT_CONFIG, input));
});

test("fixed GPU auto-selection ranks available model/GPU profiles together", () => {
  const config = cloneDefaultConfig();
  const profile = {
    ...config.deploymentProfiles.find((item) => item.modelId === "qwen38-27b")!,
    id: "qwen-l40",
    gpuId: "l40s",
  };
  config.deploymentProfiles = [profile];
  const result = calculate(
    config,
    withInput({ gpuId: "l40s", priority: "cost", taskIds: ["search"] }),
  );
  assert.equal(result.model.id, "qwen38-27b");
  assert.equal(result.gpu.id, "l40s");
  assert.equal(result.profile.id, profile.id);
  assert.equal(result.selectionValid, true);
  assert.ok(
    result.alternatives.every((candidate) => candidate.gpu.id === "l40s"),
  );
});

function measuredFixture() {
  const config = cloneDefaultConfig();
  const profile = config.deploymentProfiles.find(
    (item) => item.modelId === "qwen38-27b",
  )!;
  profile.status = "measured";
  profile.engine = "test-engine";
  profile.engineVersion = "test-fixture";
  profile.sourceUrl = "https://example.com/test-benchmark";
  profile.sourceDate = "2026-09-02";
  profile.benchmark = {
    inputTokens: 2000,
    outputTokens: 1000,
    concurrency: 8,
    ttftMs: 100,
    tokensPerSecond: 60,
  };
  const input = withInput({
    modelId: "qwen38-27b",
    inputTokens: 2000,
    outputTokens: 1000,
    asOf: "2026-09-06",
    targetTtftMs: 100,
    minTokensPerSecond: 60,
  });
  return { config, profile, input };
}

test("measured SLO acceptance is bounded by workload, topology and source date", () => {
  const { config, profile, input } = measuredFixture();
  const valid = calculate(config, input);
  assert.equal(valid.confidence, "measured");
  assert.equal(valid.selectionValid, true);
  const latency = calculate(config, { ...input, targetTtftMs: 99 });
  assert.equal(latency.selectionValid, false);
  assert.match(latency.selectionReasons.join(" "), /TTFT.*превышает/);
  const throughput = calculate(config, { ...input, minTokensPerSecond: 61 });
  assert.equal(throughput.selectionValid, false);
  assert.match(throughput.selectionReasons.join(" "), /скорость.*ниже/);
  for (const patch of [
    { inputTokens: 2001 },
    { outputTokens: 1001 },
    { concurrency: 9 },
    { asOf: "2026-09-01" },
    { asOf: "2027-09-06" },
  ]) {
    const result = calculate(config, { ...input, ...patch });
    assert.equal(result.confidence, "estimated", JSON.stringify(patch));
    assert.equal(result.selectionValid, false, JSON.stringify(patch));
  }
  profile.benchmark!.inputTokens = 999000;
  profile.benchmark!.outputTokens = 1000;
  const tooLarge = calculate(config, {
    ...input,
    inputTokens: 999000,
    concurrency: 1,
  });
  assert.equal(
    tooLarge.plan.baseGpuCount,
    profile.gpuCount,
    "measured topology must not be silently expanded",
  );
  assert.equal(tooLarge.selectionValid, false);
  assert.match(tooLarge.selectionReasons.join(" "), /не вмещает/);
});

test("SLO without measurements stays explicitly unconfirmed", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({
      modelId: "qwen38-27b",
      targetTtftMs: 1000,
      minTokensPerSecond: 10,
    }),
  );
  assert.equal(result.selectionValid, false);
  assert.equal(result.confidence, "estimated");
  assert.match(result.selectionReasons.join(" "), /не подтверждён измерением/);
});

test("target-task quality evidence overrides heuristic tier, and old or future evidence is not confirmed", () => {
  const config = cloneDefaultConfig();
  config.qualityAssessments = [
    {
      id: "qa-qwen",
      modelId: "qwen38-27b",
      taskId: "contracts",
      status: "measured",
      qualityTier: 1,
      sampleSize: 25,
      dataset: "test-fixture",
      sourceUrl: "https://example.com/qa",
      sourceDate: "2026-09-02",
      notes: "",
      correctAnswerPct: 70,
    },
  ];
  const input = withInput({
    taskIds: ["contracts"],
    modelId: "qwen38-27b",
    asOf: "2026-09-06",
  });
  const result = calculate(config, input);
  assert.equal(result.selectionValid, false);
  assert.match(
    result.selectionReasons.join(" "),
    /по оценке на целевой выборке/,
  );
  assert.match(result.warnings.join(" "), /выборка 25/);
  for (const date of ["2025-01-01", "2027-01-01"]) {
    config.qualityAssessments[0].sourceDate = date;
    const expired = calculate(config, input);
    assert.equal(expired.selectionValid, true);
    assert.match(expired.warnings.join(" "), /без целевых измерений/);
  }
});

test("purchase and rental source warnings are independent and use the captured calculation date", () => {
  const config = cloneDefaultConfig();
  const gpu = config.gpus.find((item) => item.id === "h200")!;
  gpu.purchaseQuote.sourceDate = "2025-01-01";
  gpu.rentalQuote.sourceDate = "2027-01-01";
  const result = calculate(
    config,
    withInput({ modelId: "qwen38-27b", asOf: "2026-09-06T10:30:00.000Z" }),
  );
  assert.match(result.warnings.join(" "), /Покупка: цена устарела/);
  assert.match(
    result.warnings.join(" "),
    /Аренда: дата источника находится в будущем/,
  );
  assert.match(
    result.warnings.join(" "),
    /Аренда: отсутствует отдельный подтверждающий источник/,
  );
});

function financialFixture() {
  const config = cloneDefaultConfig();
  const model = config.models.find((item) => item.id === "qwen38-27b")!;
  const gpu = config.gpus.find((item) => item.id === "h200")!;
  const profile = config.deploymentProfiles.find(
    (item) => item.modelId === model.id,
  )!;
  config.models = [model];
  config.gpus = [gpu];
  config.deploymentProfiles = [profile];
  profile.kvCacheGbPer1kTokens = 0;
  profile.workspaceGbPerGpu = 0;
  gpu.nodeGpuCount = 1;
  gpu.nodePowerKw = 1;
  gpu.nodePriceRub = 120;
  gpu.rentPerGpuHourRub = 2;
  Object.assign(config.assumptions, {
    electricityRubKwh: 1,
    pue: 1,
    supportPctCapexYear: 0,
    fitoutPctCapex: 0,
    idlePowerPct: 0,
    memoryOverheadPct: 0,
    usableMemoryPct: 100,
    rackMonthPerNodeRub: 0,
    networkStorageMonthRub: 0,
    operationsMonthRub: 0,
    rentalServicePct: 0,
    contingencyPct: 0,
    residualValuePct: 0,
  });
  const input = withInput({
    modelId: model.id,
    hoursMonth: 10,
    years: 1,
    concurrency: 1,
    inputTokens: 1000,
    outputTokens: 1,
  });
  return { config, gpu, input };
}

test("break-even supports both crossing directions and never reports a false zero-hour benefit", () => {
  const { config, gpu, input } = financialFixture();
  const crossing = calculate(config, input);
  assert.equal(crossing.breakEvenDirection, "above");
  assert.ok(Math.abs(crossing.breakEvenHoursMonth! - 10) < 1e-9);
  assert.equal(crossing.buyTco, crossing.rentTco);
  assert.equal(calculate(config, { ...input, hoursMonth: 9 }).decision, "rent");
  assert.equal(calculate(config, { ...input, hoursMonth: 11 }).decision, "buy");
  gpu.nodePriceRub = 0;
  gpu.rentPerGpuHourRub = 0;
  const falseZero = calculate(config, input);
  assert.equal(falseZero.breakEvenDirection, "never");
  assert.equal(falseZero.breakEvenHoursMonth, null);
  assert.equal(falseZero.decision, "rent");
  gpu.rentPerGpuHourRub = 1;
  config.assumptions.electricityRubKwh = 2;
  const reverse = calculate(config, { ...input, rentalMode: "dedicated-node" });
  assert.equal(reverse.breakEvenDirection, "below");
  assert.ok(Math.abs(reverse.breakEvenHoursMonth! - 360) < 1e-9);
  const equal = calculate(config, {
    ...input,
    rentalMode: "dedicated-node",
    hoursMonth: reverse.breakEvenHoursMonth!,
  });
  assert.equal(equal.buyTco, equal.rentTco);
  gpu.rentPerGpuHourRub = 0;
  config.assumptions.electricityRubKwh = 0;
  const allEqual = calculate(config, input);
  assert.equal(allEqual.breakEvenDirection, "equal");
  assert.equal(allEqual.breakEvenHoursMonth, null);
});

test("rent breakdown charges standby hours independently and dedicated nodes round to full nodes", () => {
  const { config, gpu, input } = financialFixture();
  gpu.nodeGpuCount = 4;
  config.assumptions.rentalServicePct = 5;
  const active = calculate(config, {
    ...input,
    reserveMode: "nplus1",
    reserveRentalMode: "active-hours",
  });
  const standby = calculate(config, {
    ...input,
    reserveMode: "nplus1",
    reserveRentalMode: "always-on",
  });
  assert.equal(active.rent.reserve, 4 * 2 * input.hoursMonth * 12);
  assert.equal(standby.rent.reserve, 4 * 2 * 720 * 12);
  assert.equal(
    standby.rent.service,
    (standby.rent.compute + standby.rent.reserve) * 0.05,
  );
  const dedicated = calculate(config, {
    ...input,
    rentalMode: "dedicated-node",
    reserveMode: "nplus1",
  });
  assert.equal(dedicated.rent.compute, 4 * 2 * 720 * 12);
  assert.equal(dedicated.rent.reserve, 4 * 2 * 720 * 12);
  assert.equal(
    dedicated.rent.total,
    dedicated.rent.compute +
      dedicated.rent.reserve +
      dedicated.rent.service +
      dedicated.rent.networkStorage +
      dedicated.rent.operations,
  );
  assert.equal(dedicated.rentTco, dedicated.rent.total);
  assert.equal(
    active.availableMemoryGb,
    active.gpuCount * gpu.memoryGb,
    "standby and unused purchased cards cannot inflate serving capacity",
  );
});

test("sensitivity freezes selected deployment and cumulative cashflow reconciles residual at the horizon", () => {
  const { config, input } = financialFixture();
  config.assumptions.residualValuePct = 20;
  const result = calculate(config, input);
  const snapshot = JSON.stringify(config);
  const sensitivity = calculateSensitivity(config, input, result);
  const base = sensitivity.scenarios.find((item) => item.id === "base")!;
  assert.equal(base.buyTco, result.buyTco);
  assert.equal(base.rentTco, result.rentTco);
  assert.ok(
    sensitivity.scenarios[0].rentTco - sensitivity.scenarios[0].buyTco >
      sensitivity.scenarios[2].rentTco - sensitivity.scenarios[2].buyTco,
  );
  const cashflow = cumulativeCashflow(config, input, result);
  assert.equal(cashflow.length, 13);
  assert.equal(
    cashflow[0].buyCumulative,
    result.buy.equipment + result.buy.fitout + result.buy.contingency,
  );
  assert.equal(cashflow[0].rentCumulative, 0);
  assert.ok(Math.abs(cashflow[12].buyCumulative - result.buyTco) < 1e-9);
  assert.ok(Math.abs(cashflow[12].rentCumulative - result.rentTco) < 1e-9);
  assert.equal(JSON.stringify(config), snapshot);
});

test("quality priority ranks measured task quality rather than the legacy model label", () => {
  const config = cloneDefaultConfig();
  config.models = config.models.filter((model) =>
    ["qwen38-27b", "gpt-oss-20b"].includes(model.id),
  );
  config.deploymentProfiles = config.deploymentProfiles.filter((profile) =>
    config.models.some((model) => model.id === profile.modelId),
  );
  config.qualityAssessments = [
    {
      id: "target-qa",
      modelId: "gpt-oss-20b",
      taskId: "search",
      status: "measured",
      qualityTier: 5,
      sampleSize: 100,
      dataset: "test-fixture",
      sourceUrl: "https://example.com/qa",
      sourceDate: "2026-09-02",
      notes: "",
      correctAnswerPct: 95,
    },
  ];
  const result = calculate(
    config,
    withInput({ taskIds: ["search"], priority: "quality", asOf: "2026-09-06" }),
  );
  assert.equal(result.model.id, "gpt-oss-20b");
  assert.equal(
    result.model.qualityTier,
    1,
    "legacy label remains an explicitly separate expert estimate",
  );
});

test("an uncalculable synthetic profile cannot crash a different selected model", () => {
  const config = cloneDefaultConfig();
  config.gpus.find((gpu) => gpu.id === "rtx4090")!.memoryGb = 0.5;
  config.deploymentProfiles = config.deploymentProfiles.filter(
    (profile) => profile.gpuId !== "rtx4090",
  );
  assert.deepEqual(validateConfig(config), []);
  const result = calculate(config, withInput({ modelId: "qwen38-27b" }));
  assert.equal(result.model.id, "qwen38-27b");
  assert.equal(result.selectionValid, true);
  assert.match(result.rejectedReasons["ministral3-8b"].join(" "), /Workspace/);
  assert.throws(
    () => calculate(config, withInput({ modelId: "ministral3-8b" })),
    /Выбранная модель не может быть рассчитана.*Workspace/,
  );
  config.models = config.models.filter(
    (model) => model.recommendedGpuId === "rtx4090",
  );
  config.deploymentProfiles = [];
  assert.throws(
    () => calculate(config, withInput({ modelId: "auto" })),
    /Не удалось рассчитать ни одного профиля/,
  );
});

test("a measured profile for a different weight format cannot confirm performance", () => {
  const { config, profile, input } = measuredFixture();
  profile.precision = "BF16";
  const result = calculate(config, input);
  assert.equal(result.confidence, "estimated");
  assert.equal(result.selectionValid, false);
  assert.match(result.selectionReasons.join(" "), /Формат весов/);
});

test("sensitivity chooses the favorable operating-hours direction for dedicated rental", () => {
  const { config, gpu, input } = financialFixture();
  gpu.nodePriceRub = 0;
  gpu.rentPerGpuHourRub = 1;
  config.assumptions.electricityRubKwh = 1000;
  const sensitivity = calculateSensitivity(config, {
    ...input,
    rentalMode: "dedicated-node",
    hoursMonth: 700,
  });
  const [optimistic, base, conservative] = sensitivity.scenarios;
  assert.ok(
    optimistic.buyTco - optimistic.rentTco < base.buyTco - base.rentTco,
  );
  assert.ok(
    conservative.buyTco - conservative.rentTco > base.buyTco - base.rentTco,
  );
  assert.equal(optimistic.hoursMonth, 525);
  assert.equal(conservative.hoursMonth, 720);
});

test("Kimi screenshot's 24 GPUs are reproduced only by the old million-token workload and weight estimate", () => {
  const legacy = cloneDefaultConfig();
  const model = legacy.models.find((item) => item.id === "kimi-k3")!;
  delete model.checkpointWeightGb;
  const result = calculate(
    legacy,
    withInput({
      taskIds: ["contracts", "estimates", "incidents", "agents", "frontier"],
      modelId: model.id,
      gpuId: "gb300",
      inputTokens: 1_000_000,
      outputTokens: 1024,
    }),
  );
  assert.ok(
    Math.abs(result.plan.requiredWeightMemoryPerReplicaGb - 1568) < 1e-9,
  );
  assert.equal(result.plan.kvMemoryPerRequestGb, 125.128);
  assert.equal(result.sessionsPerReplica, 3);
  assert.equal(result.replicas, 3);
  assert.equal(result.gpuCount, 24);
  assert.equal(result.plan.baseGpuCount, 8);
  assert.equal(result.confidence, "estimated");
});

test("task context capability does not expand the configured Kimi workload to one million tokens", () => {
  const result = calculate(
    DEFAULT_CONFIG,
    withInput({
      taskIds: ["frontier"],
      modelId: "kimi-k3",
      gpuId: "gb300",
      inputTokens: 0,
    }),
  );
  assert.equal(result.requiredContextK, 1000);
  assert.equal(
    result.effectiveInputTokens,
    DEFAULT_CONFIG.assumptions.defaultInputTokens,
  );
  assert.equal(
    result.outputTokens,
    DEFAULT_CONFIG.assumptions.defaultOutputTokens,
  );
  assert.equal(result.plan.checkpointWeightPerReplicaGb, 1560.860324864);
  assert.equal(result.plan.weightOnlyMinGpuCount, 6);
  assert.equal(result.plan.singleRequestMinGpuCount, 7);
  assert.equal(result.plan.baseGpuCount, 8);
  assert.equal(result.replicas, 1);
  assert.equal(result.gpuCount, 8);
  assert.equal(result.plan.workloadNodes, 2);
  assert.equal(result.purchasedGpuCount, 8);
  assert.equal(result.confidence, "estimated");
  const reserve = calculate(DEFAULT_CONFIG, {
    ...baseInput,
    modelId: "kimi-k3",
    reserveMode: "nplus1",
  });
  assert.equal(reserve.gpuCount, 8);
  assert.equal(reserve.purchasedGpuCount, 12);
});

test("changing selected tasks changes eligibility, not the explicit request length or KV memory", () => {
  const shortTask = calculate(
    DEFAULT_CONFIG,
    withInput({ modelId: "kimi-k3", taskIds: ["search"], inputTokens: 8192 }),
  );
  const frontierTask = calculate(
    DEFAULT_CONFIG,
    withInput({ modelId: "kimi-k3", taskIds: ["frontier"], inputTokens: 8192 }),
  );
  assert.equal(shortTask.requiredKvMemoryGb, frontierTask.requiredKvMemoryGb);
  assert.equal(shortTask.gpuCount, frontierTask.gpuCount);
});

test("unprofiled memory estimates optimize batching before replicating weights and never become supported", () => {
  const config = cloneDefaultConfig();
  const model = config.models[0];
  model.checkpointWeightGb = 70;
  model.minGpuCount = 8;
  const gpu = config.gpus[0];
  gpu.memoryGb = 80;
  gpu.nodeGpuCount = 4;
  config.deploymentProfiles = [];
  config.assumptions.usableMemoryPct = 100;
  config.assumptions.memoryOverheadPct = 0;
  // Synthetic cache assumptions remain conditional; this long request is chosen to
  // make a three-GPU batch smaller than two copies of a two-GPU instance.
  const plan = planModelDeployment(
    config,
    model,
    withInput({ inputTokens: 159999, outputTokens: 1 }),
    gpu,
  );
  assert.equal(plan.weightOnlyMinGpuCount, 1);
  assert.equal(plan.singleRequestMinGpuCount, 2);
  assert.equal(plan.baseGpuCount, 3);
  assert.equal(plan.replicas, 1);
  assert.equal(plan.gpuCount, 3);
  assert.equal(plan.purchasedGpuCount, 4);
  assert.match(plan.reasons.join(" "), /отсутствует профиль/);
  assert.equal(plan.confidence, "estimated");
});

test("resident MoE memory uses all experts rather than activated parameters", () => {
  const config = cloneDefaultConfig();
  const model = config.models.find((item) => item.id === "kimi-k3")!;
  delete model.checkpointWeightGb;
  model.activeParamsB = 1;
  const plan = planModelDeployment(
    config,
    model,
    withInput({ concurrency: 1 }),
  );
  assert.equal(
    plan.checkpointWeightPerReplicaGb,
    (model.totalParamsB * model.bitsPerWeight) / 8,
  );
  assert.equal(plan.checkpointWeightPerReplicaGb, 1400);
});

test("the 30-day month consistently bills 720 hours of power, dedicated rental and standby", () => {
  const { config, gpu, input } = financialFixture();
  gpu.nodeGpuCount = 4;
  config.assumptions.idlePowerPct = 25;
  const full = calculate(config, {
    ...input,
    hoursMonth: HOURS_PER_MONTH,
    rentalMode: "dedicated-node",
    reserveMode: "nplus1",
    reserveRentalMode: "always-on",
  });
  assert.equal(HOURS_PER_MONTH, 720);
  assert.equal(full.monthlyPowerRub, 720 + 720 * 0.25);
  assert.equal(full.buy.electricity, (720 + 180) * 12);
  assert.equal(full.rent.compute, 4 * 2 * 720 * 12);
  assert.equal(full.rent.reserve, 4 * 2 * 720 * 12);
  const idle = calculate(config, {
    ...input,
    hoursMonth: 0,
    rentalMode: "dedicated-node",
    reserveMode: "nplus1",
    reserveRentalMode: "active-hours",
  });
  assert.equal(idle.monthlyPowerRub, 2 * 720 * 0.25);
  assert.equal(
    idle.rent.compute,
    full.rent.compute,
    "dedicated nodes are billed continuously even while idle",
  );
  assert.equal(idle.rent.reserve, full.rent.reserve);
  for (const hoursMonth of [720.01, 730])
    assert.throws(
      () => calculate(config, { ...input, hoursMonth }),
      /0 до 720/,
    );
});

test("Kimi eight-GPU annual budget uses continuous billing rather than the former 160-hour rental estimate", () => {
  const config = cloneDefaultConfig();
  const result = calculate(
    config,
    withInput({
      taskIds: ["frontier"],
      modelId: "kimi-k3",
      gpuId: "gb300",
      hoursMonth: 720,
      years: 1,
      concurrency: 8,
      inputTokens: 8192,
      outputTokens: 1024,
      rentalMode: "dedicated-node",
      reserveRentalMode: "always-on",
      reserveMode: "none",
    }),
  );
  assert.equal(result.gpuCount, 8);
  assert.equal(result.nodes, 2);
  assert.equal(result.buy.equipment, 90_000_000);
  assert.equal(result.buy.electricity, 1_953_504);
  assert.equal(result.buyTco, 126_153_504);
  assert.equal(result.rent.compute, 93_312_000);
  assert.equal(result.rentTco, 103_617_600);
});
