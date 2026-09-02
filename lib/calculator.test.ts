import assert from "node:assert/strict";
import test from "node:test";
import { calculate, CalculationInput, evaluateModels, planModelDeployment } from "./calculator";
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
  priority: "balance"
};

const withInput = (patch: Partial<CalculationInput>): CalculationInput => ({...baseInput, ...patch});

test("исходный каталог проходит строгую валидацию", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

test("MiniMax M3 и Kimi K3 находятся в разных классах качества", () => {
  const miniMax = DEFAULT_CONFIG.models.find(model => model.id === "minimax-m3");
  const kimi = DEFAULT_CONFIG.models.find(model => model.id === "kimi-k3");
  const deepSeek = DEFAULT_CONFIG.models.find(model => model.id === "deepseek-v4-pro");
  assert.equal(miniMax?.qualityTier, 4);
  assert.equal(kimi?.qualityTier, 5);
  assert.equal(deepSeek?.qualityTier, 5);
});

test("параметры не используются как суррогат качества внутри одного класса", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["search"], priority:"quality"}));
  assert.equal(result.requiredQualityTier, 1);
  assert.equal(result.model.id, "deepseek-v4-pro");
  assert.ok(result.model.totalParamsB < 2800);
});

test("непрофилированная ёмкость реплики не создаёт преимущества отдельной модели", () => {
  assert.deepEqual([...new Set(DEFAULT_CONFIG.models.map(model => model.sessionsPerReplica))], [8]);
});

test("предельная мультимодальная задача допускает Kimi K3, но не MiniMax M3", () => {
  const evaluation = evaluateModels(DEFAULT_CONFIG, ["frontier"]);
  assert.deepEqual(evaluation.eligible.map(model => model.id), ["kimi-k3"]);
  assert.match(evaluation.rejectedReasons["minimax-m3"].join(" "), /класс качества 4 ниже требуемого 5/);
});

test("при выборе всех задач Kimi K3 рекомендуется при любом приоритете", () => {
  const taskIds = DEFAULT_CONFIG.tasks.filter(task => task.enabled).map(task => task.id);
  for (const priority of ["cost", "balance", "quality"] as const) {
    const result = calculate(DEFAULT_CONFIG, withInput({taskIds, priority}));
    assert.equal(result.model.id, "kimi-k3", priority);
    assert.equal(result.selectionValid, true, priority);
    assert.equal(result.alternatives[0]?.model.id, "kimi-k3", priority);
  }
});

test("сверхдлинный контекст не требует верхнего класса качества", () => {
  const evaluation = evaluateModels(DEFAULT_CONFIG, ["long"]);
  assert.equal(evaluation.req.qualityTier, 3);
  assert.ok(evaluation.eligible.some(model => model.id === "qwen38-27b"));
  assert.ok(evaluation.eligible.some(model => model.id === "minimax-m3"));
});

test("альтернативы показывают фактическое количество GPU для заданной нагрузки", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["frontier"]}));
  assert.equal(result.alternatives[0]?.gpuCount, result.gpuCount);
  assert.equal(result.alternatives[0]?.model.id, result.model.id);
});

test("ручной выбор MiniMax для задачи класса 5 явно не является рекомендацией", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["frontier"], modelId:"minimax-m3"}));
  assert.equal(result.model.id, "minimax-m3");
  assert.equal(result.selectionValid, false);
  assert.match(result.selectionReasons.join(" "), /класс качества 4 ниже требуемого 5/);
});

test("при отсутствии подходящей модели fallback помечается как сценарий", () => {
  const config = cloneDefaultConfig();
  const kimi = config.models.find(model => model.id === "kimi-k3");
  assert.ok(kimi);
  kimi.enabled = false;
  const result = calculate(config, withInput({taskIds:["frontier"]}));
  assert.equal(result.eligibleModels.length, 0);
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.selectionValid, false);
});

test("память результата учитывает все реплики", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["agents"], modelId:"minimax-m3", concurrency:9}));
  const model = DEFAULT_CONFIG.models.find(candidate => candidate.id === "minimax-m3");
  assert.ok(model);
  const plan = planModelDeployment(DEFAULT_CONFIG, model, withInput({taskIds:["agents"], modelId:"minimax-m3", concurrency:9}));
  assert.equal(plan.replicas, 2);
  assert.equal(result.requiredWeightMemoryGb, plan.requiredWeightMemoryPerReplicaGb * plan.replicas);
  assert.equal(result.requiredWeightMemoryGb, plan.requiredWeightMemoryGb);
});

test("нерекомендованный ручной GPU помечается как неподтверждённый", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["agents"], modelId:"minimax-m3", gpuId:"rtx4090"}));
  assert.equal(result.selectionValid, false);
  assert.match(result.selectionReasons.join(" "), /не подтверждены производительность, межсоединение и формат весов/);
});

test("минимум GPU никогда не обходит нижнюю границу по памяти", () => {
  const config = cloneDefaultConfig();
  const model = config.models.find(candidate => candidate.id === "kimi-k25");
  assert.ok(model);
  model.bitsPerWeight = 8;
  model.minGpuCount = 8;
  const plan = planModelDeployment(config, model, withInput({concurrency:1}));
  assert.equal(plan.baseGpuCount, 9);
});

test("в точке окупаемости TCO покупки и аренды совпадает", () => {
  const input = withInput({taskIds:["agents"], modelId:"minimax-m3"});
  const initial = calculate(DEFAULT_CONFIG, input);
  assert.ok(initial.breakEvenHoursMonth !== null);
  const atBreakEven = calculate(DEFAULT_CONFIG, {...input, hoursMonth:initial.breakEvenHoursMonth});
  assert.ok(Math.abs(atBreakEven.buyTco - atBreakEven.rentTco) < 1);
});

test("недостижимый порог окупаемости не выходит за пределы 730 ч/мес.", () => {
  const result = calculate(DEFAULT_CONFIG, withInput({taskIds:["search"], modelId:"gpt-oss-20b"}));
  assert.equal(result.breakEvenHoursMonth, null);
});

test("резервный N+1 узел потребляет только idle-мощность", () => {
  const withoutReserve = calculate(DEFAULT_CONFIG, withInput({taskIds:["agents"], modelId:"minimax-m3", reserveMode:"none"}));
  const withReserve = calculate(DEFAULT_CONFIG, withInput({taskIds:["agents"], modelId:"minimax-m3", reserveMode:"nplus1"}));
  const a = DEFAULT_CONFIG.assumptions;
  const expectedStandbyPowerRub = withReserve.gpu.nodePowerKw * 730 * (a.idlePowerPct / 100) * a.pue * a.electricityRubKwh;
  assert.ok(Math.abs(withReserve.monthlyPowerRub - withoutReserve.monthlyPowerRub - expectedStandbyPowerRub) < 1);
});

test("валидатор отвергает пустые ID, дробные количества и неизвестные значения", () => {
  const config = cloneDefaultConfig();
  config.models[0].id = "";
  config.models[1].minGpuCount = 1.5;
  config.tasks[0].requiredCapabilities = ["неизвестно" as never];
  config.assumptions.idlePowerPct = 101;
  const errors = validateConfig(config).join("\n");
  assert.match(errors, /Идентификаторы моделей/);
  assert.match(errors, /положительными целыми числами/);
  assert.match(errors, /неизвестная возможность/);
  assert.match(errors, /Процентные допущения/);
});

test("автовыбор остаётся допустимым для всех 4096 комбинаций задач", () => {
  const taskIds = DEFAULT_CONFIG.tasks.filter(task => task.enabled).map(task => task.id);
  for (let mask = 0; mask < 2 ** taskIds.length; mask += 1) {
    const selected = taskIds.filter((_, index) => mask & (1 << index));
    for (const priority of ["cost", "balance", "quality"] as const) {
      const result = calculate(DEFAULT_CONFIG, withInput({taskIds:selected, priority}));
      assert.equal(result.selectionValid, true, `mask=${mask}, priority=${priority}`);
      assert.ok(result.eligibleModels.some(model => model.id === result.model.id), `mask=${mask}, priority=${priority}`);
      assert.equal(result.alternatives[0]?.model.id, result.model.id, `mask=${mask}, priority=${priority}`);
    }
  }
});
