import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaultConfig } from "./config";
import {
  createScenario,
  defaultInput,
  migrateScenario,
  scenarioInput,
  parseInput,
  parseScenario,
  readScenarios,
  scenarioReport,
  CALCULATOR_VERSION,
  RECALCULABLE_VERSIONS,
} from "./scenarios";

test("scenario freezes input, catalogue, source date and reproduces totals", () => {
  const config = cloneDefaultConfig();
  const input = defaultInput(config);
  const scenario = createScenario(
    "Бюджет 2027",
    config,
    input,
    new Date("2026-09-06T12:00:00Z"),
  );
  const before = scenarioReport(scenario);
  config.gpus[0].nodePriceRub *= 5;
  input.taskIds.length = 0;
  assert.notDeepEqual(input.taskIds, scenario.input.taskIds);
  assert.notEqual(
    config.gpus[0].nodePriceRub,
    scenario.config.gpus[0].nodePriceRub,
  );
  const restored = parseScenario(JSON.parse(JSON.stringify(before)));
  assert.deepEqual(restored.errors, []);
  assert.ok(restored.value);
  assert.equal(
    scenarioReport(restored.value).result.buyTco,
    before.result.buyTco,
  );
  assert.equal(restored.value.input.asOf, "2026-09-06T12:00:00.000Z");
});

test("scenario imports reject malformed config and input without trusting exported results", () => {
  const config = cloneDefaultConfig();
  const scenario = createScenario("Тест", config, defaultInput(config));
  assert.equal(
    parseScenario({
      ...scenario,
      config: { ...config, models: [{ ...config.models[0], name: 123 }] },
    }).value,
    null,
  );
  assert.equal(
    parseScenario({
      ...scenario,
      input: { ...scenario.input, concurrency: -1 },
    }).value,
    null,
  );
  assert.equal(
    parseScenario({ ...scenario, calculatorVersion: "future" }).value,
    null,
  );
  const report = { ...scenarioReport(scenario), result: { buyTco: 0 } };
  const restored = parseScenario(report);
  assert.ok(restored.value);
  assert.ok(scenarioReport(restored.value).result.buyTco > 0);
});

test("malformed scenario storage and duplicate ids do not silently discard data", () => {
  const config = cloneDefaultConfig();
  const scenario = createScenario("Тест", config, defaultInput(config));
  assert.deepEqual(readScenarios(null), { value: [], errors: [] });
  assert.equal(readScenarios("broken").value, null);
  assert.equal(readScenarios(JSON.stringify([scenario, scenario])).value, null);
});

test("input parser rejects untyped payloads and retains small valid workload shares", () => {
  const input = defaultInput(cloneDefaultConfig());
  assert.equal(parseInput({ ...input, years: "3" }).value, null);
  assert.equal(parseInput({ ...input, taskIds: ["a", "a"] }).value, null);
  assert.equal(parseInput({ ...input, rentalMode: "free" }).value, null);
  assert.equal(
    parseInput({ ...input, hoursMonth: 720 }).value?.hoursMonth,
    720,
  );
  assert.equal(parseInput({ ...input, hoursMonth: 730 }).value, null);
  assert.equal(parseInput({ ...input, asOf: "2026-02-30" }).value, null);
  assert.equal(
    parseInput({ ...input, asOf: "2026-02-28T25:00:00Z" }).value,
    null,
  );
  assert.equal(
    parseInput({ ...input, largeModelSharePct: 0.1 }).value?.largeModelSharePct,
    0.1,
  );
});

test("default input follows published calculation defaults and returns an independent full workload", () => {
  const config = cloneDefaultConfig();
  const id = config.defaultScenarioId;
  config.scenarioPresets.find((preset) => preset.id === id)!.input.concurrency =
    13;
  config.scenarioPresets.find((preset) => preset.id === id)!.input.inputTokens =
    16384;
  const input = defaultInput(config);
  assert.equal(input.concurrency, 13);
  assert.equal(input.inputTokens, 16384);
  assert.equal(input.hoursMonth, 720);
  assert.equal(input.rentalMode, "dedicated-node");
  input.taskIds.length = 0;
  assert.ok(scenarioInput(config, id).taskIds.length > 0);
  assert.throws(() => scenarioInput(config, "missing"), /Сценарий недоступен/);
  config.scenarioPresets[0].enabled = false;
  assert.throws(() => scenarioInput(config, id), /Сценарий недоступен/);
});

test("old algorithm snapshots require an explicit recalculation into a new immutable scenario", () => {
  const config = cloneDefaultConfig();
  const old = {
    ...createScenario("Согласованный бюджет", config, defaultInput(config)),
    calculatorVersion: "3.0.0",
  };
  const original = structuredClone(old);
  assert.equal(parseScenario(old).value, null);
  const migrated = migrateScenario(old, new Date("2026-09-07T00:00:00Z"));
  assert.ok(migrated.value, migrated.errors.join(" "));
  assert.notEqual(migrated.value.id, old.id);
  assert.equal(migrated.value.calculatorVersion, CALCULATOR_VERSION);
  assert.equal(migrated.value.input.asOf, "2026-09-07T00:00:00.000Z");
  assert.deepEqual(old, original);
  assert.equal(
    migrateScenario({ ...old, calculatorVersion: "future" }).value,
    null,
  );
  assert.equal(
    migrateScenario({ ...old, input: { ...old.input, concurrency: -1 } }).value,
    null,
  );
});

test("both former calculator versions require explicit migration and cannot export current-code results as old snapshots", () => {
  const config = cloneDefaultConfig();
  const scenario = createScenario(
    "Постоянная работа",
    config,
    defaultInput(config),
  );
  for (const calculatorVersion of RECALCULABLE_VERSIONS) {
    const old = {
      ...scenario,
      calculatorVersion,
      input: {
        ...scenario.input,
        hoursMonth: 730,
        rentalMode: "dedicated-node" as const,
      },
    };
    const original = JSON.stringify(old);
    assert.equal(parseScenario(old).value, null);
    assert.throws(() => scenarioReport(old), /требует явного пересчёта/);
    const migrated = migrateScenario(old, new Date("2026-09-07T00:00:00Z"));
    assert.ok(migrated.value, migrated.errors.join(" "));
    assert.equal(migrated.value.calculatorVersion, CALCULATOR_VERSION);
    assert.equal(migrated.value.input.hoursMonth, 720);
    assert.notEqual(migrated.value.id, old.id);
    assert.equal(JSON.stringify(old), original);
    assert.ok(scenarioReport(migrated.value).result.rentTco > 0);
  }
  assert.equal(
    migrateScenario({
      ...scenario,
      calculatorVersion: "4.0.0",
      input: { ...scenario.input, hoursMonth: 731 },
    }).value,
    null,
  );
});

test("explicit historical recalculation preserves shorter recorded workload, while fresh defaults remain 720 hours", () => {
  const config = cloneDefaultConfig();
  const old = {
    ...createScenario("Исторический пилот", config, {
      ...defaultInput(config),
      hoursMonth: 160,
      rentalMode: "gpu-hour",
    }),
    calculatorVersion: "4.0.0",
  };
  const migrated = migrateScenario(old);
  assert.equal(migrated.value?.input.hoursMonth, 160);
  assert.equal(migrated.value?.input.rentalMode, "gpu-hour");
  assert.equal(defaultInput(config).hoursMonth, 720);
  assert.equal(defaultInput(config).rentalMode, "dedicated-node");
});

test("monthly horizons survive snapshot capture, report export and strict import", () => {
  const config = cloneDefaultConfig();
  for (const months of [18, 30, 36]) {
    const scenario = createScenario(`${months} месяцев`, config, {
      ...defaultInput(config),
      years: 3,
      months,
    });
    assert.equal(scenario.calculatorVersion, "5.1.0");
    assert.equal(scenario.input.months, months);
    const report = scenarioReport(scenario);
    const restored = parseScenario(JSON.parse(JSON.stringify(report)));
    assert.ok(restored.value, restored.errors.join(" "));
    assert.equal(restored.value.input.months, months);
    assert.equal(
      scenarioReport(restored.value).result.buyTco,
      report.result.buyTco,
    );
    assert.equal(
      scenarioReport(restored.value).result.rentTco,
      report.result.rentTco,
    );
  }
  for (const months of [0, 18.5, 121, "18", null])
    assert.equal(parseInput({ ...defaultInput(config), months }).value, null);
});

test("version 5.0 snapshots with legacy years reproduce unchanged without a migration or version relabel", () => {
  const config = cloneDefaultConfig();
  const { months, ...legacyInput } = defaultInput(config);
  const current = createScenario("Ранее согласовано", config, {
    ...legacyInput,
    years: 2,
  });
  const { months: capturedMonths, ...frozenLegacyInput } = current.input;
  const old = {
    ...current,
    calculatorVersion: "5.0.0",
    input: frozenLegacyInput,
  };
  const raw = JSON.stringify(old);
  const originalCosts = scenarioReport(current).result;
  const restored = parseScenario(old);
  assert.ok(restored.value, restored.errors.join(" "));
  assert.equal(restored.value.calculatorVersion, "5.0.0");
  assert.equal(restored.value.input.months, undefined);
  assert.equal(restored.value.input.years, 2);
  assert.equal(
    scenarioReport(restored.value).result.buyTco,
    originalCosts.buyTco,
  );
  assert.equal(
    scenarioReport(restored.value).result.rentTco,
    originalCosts.rentTco,
  );
  assert.ok(readScenarios(JSON.stringify([old])).value);
  assert.equal(JSON.stringify(old), raw);
  const ambiguous = { ...old, input: { ...old.input, months: 18 } };
  assert.equal(parseScenario(ambiguous).value, null);
  assert.throws(() => scenarioReport(ambiguous), /требует явного пересчёта/);
});
