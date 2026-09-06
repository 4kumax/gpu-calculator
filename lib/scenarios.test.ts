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

test("default input follows published business presets and returns an independent full workload", () => {
  const config = cloneDefaultConfig();
  config.defaultScenarioId = "documents";
  config.scenarioPresets.find(
    (preset) => preset.id === "documents",
  )!.input.concurrency = 13;
  const input = defaultInput(config);
  assert.equal(input.concurrency, 13);
  assert.equal(input.inputTokens, 16384);
  assert.equal(input.rentalMode, "gpu-hour");
  input.taskIds.length = 0;
  assert.ok(scenarioInput(config, "documents").taskIds.length > 0);
  assert.throws(() => scenarioInput(config, "missing"), /Сценарий недоступен/);
  config.scenarioPresets[0].enabled = false;
  assert.throws(() => scenarioInput(config, "pilot"), /Сценарий недоступен/);
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
  assert.equal(migrated.value.calculatorVersion, "4.0.0");
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
