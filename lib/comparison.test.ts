import assert from "node:assert/strict";
import test from "node:test";
import { calculate, CalculationInput, evaluateModels } from "./calculator";
import { compareDeployments } from "./comparison";
import { cloneDefaultConfig } from "./config";
import { calculationDefaults } from "./scenarios";

const input: CalculationInput = {
  taskIds: ["search"],
  modelId: "auto",
  gpuId: "auto",
  hoursMonth: 360,
  years: 3,
  concurrency: 8,
  reserveMode: "none",
  largeModelSharePct: 100,
  priority: "cost",
  inputTokens: 8192,
  outputTokens: 1024,
};

test("comparison includes every enabled pair, separates node and GPU-equivalent price, and reconciles cost", () => {
  const config = cloneDefaultConfig();
  config.models = config.models.filter((model) =>
    ["qwen38-27b", "kimi-k3"].includes(model.id),
  );
  config.gpus[0].enabled = false;
  const comparison = compareDeployments(config, input);
  assert.equal(
    comparison.rows.length,
    2 * config.gpus.filter((gpu) => gpu.enabled).length,
  );
  assert.equal(
    new Set(comparison.rows.map((row) => row.id)).size,
    comparison.rows.length,
  );
  for (const row of comparison.rows) {
    assert.equal(
      row.purchasePerGpuEquivalentRub * row.gpu.nodeGpuCount,
      row.purchaseNodeRub,
    );
    assert.equal(row.rentPerGpuHourRub, row.gpu.rentPerGpuHourRub);
    const expected = calculate(config, {
      ...input,
      modelId: row.model.id,
      gpuId: row.gpu.id,
    });
    assert.equal(row.result?.buyTco, expected.buyTco);
    assert.equal(row.result?.rentTco, expected.rentTco);
  }
  assert.equal(comparison.modelRows.length, 2);
});

test("a cheap unprofiled pair keeps its conditional cost and reason but cannot be recommended", () => {
  const config = cloneDefaultConfig();
  config.models = config.models.filter((model) => model.id === "kimi-k3");
  const gpu = config.gpus.find((item) => item.id === "h200")!;
  gpu.nodePriceRub = 1;
  gpu.rentPerGpuHourRub = 0;
  const comparison = compareDeployments(config, input);
  const unprofiled = comparison.rows.find((row) => row.gpu.id === "h200")!;
  assert.ok(unprofiled.result);
  assert.equal(unprofiled.status, "unsupported");
  assert.equal(unprofiled.eligible, false);
  assert.match(unprofiled.reasons.join(" "), /отсутствует профиль/);
  assert.equal(comparison.recommended?.gpu.id, "gb300");
  assert.equal(comparison.recommended?.status, "estimated");
  assert.ok(unprofiled.bestTcoRub! < comparison.recommended!.bestTcoRub!);
});

test("quality-rejected models remain visible with reasons and no acceptable result gives no recommendation", () => {
  const config = cloneDefaultConfig();
  config.models = config.models.filter((model) => model.id === "qwen38-27b");
  const comparison = compareDeployments(config, {
    ...input,
    taskIds: ["frontier"],
  });
  assert.equal(comparison.modelRows.length, 1);
  assert.equal(comparison.recommended, null);
  assert.ok(comparison.rows.every((row) => !row.eligible));
  assert.ok(
    comparison.rows.every((row) =>
      row.reasons.some((reason) => /класс качества/.test(reason)),
    ),
  );
});

test("uncalculable GPU rows stay visible and do not crash usable alternatives", () => {
  const config = cloneDefaultConfig();
  config.models = config.models.filter((model) => model.id === "kimi-k3");
  config.gpus[0].memoryGb = 0.5;
  const comparison = compareDeployments(config, input);
  const broken = comparison.rows.find(
    (row) => row.gpu.id === config.gpus[0].id,
  )!;
  assert.equal(broken.result, null);
  assert.equal(broken.status, "unsupported");
  assert.match(broken.reasons.join(" "), /Workspace/);
  assert.ok(comparison.recommended?.result);
});

test("empty tasks preserve inspectable costs without inventing an automatic recommendation", () => {
  const config = cloneDefaultConfig();
  const comparison = compareDeployments(config, { ...input, taskIds: [] });
  assert.equal(comparison.recommended, null);
  assert.ok(comparison.rows.some((row) => row.result));
  assert.equal(
    comparison.rows.length,
    config.models.filter((model) => model.enabled).length *
      config.gpus.filter((gpu) => gpu.enabled).length,
  );
  assert.doesNotThrow(
    () => calculate(config, { ...input, taskIds: [] }),
    "the lower-level numerical calculator still accepts an empty technical requirement",
  );
});

test("the original four business tasks determine eligibility and keep class-four agent requirements", () => {
  const config = cloneDefaultConfig();
  const originalTasks = ["contracts", "estimates", "incidents", "agents"];
  const defaults = calculationDefaults(config);
  assert.deepEqual(defaults.taskIds, originalTasks);
  assert.equal(defaults.inputTokens, 8192);
  const evaluation = evaluateModels(config, originalTasks);
  const comparison = compareDeployments(config, defaults);
  assert.equal(evaluation.req.qualityTier, 4);
  assert.ok(evaluation.req.capabilities.includes("агенты"));
  assert.ok(comparison.recommended);
  assert.ok(comparison.recommended.model.qualityTier >= 4);
  assert.ok(comparison.recommended.result?.selectionValid);
  assert.ok(
    evaluation.eligible.some(
      (model) => model.id === comparison.recommended?.model.id,
    ),
  );
  assert.ok(
    comparison.rows
      .filter((row) => row.model.name.startsWith("Llama"))
      .every((row) => !row.eligible),
  );
});

test("adding the actual frontier task recommends Kimi instead of retaining a cheaper prior model", () => {
  const config = cloneDefaultConfig();
  const originalTasks = ["contracts", "estimates", "incidents", "agents"];
  const initial = compareDeployments(config, {
    ...input,
    taskIds: originalTasks,
    priority: "balance",
  });
  assert.notEqual(initial.recommended?.model.id, "kimi-k3");
  for (const priority of ["cost", "balance", "quality"] as const) {
    const comparison = compareDeployments(config, {
      ...input,
      taskIds: [...originalTasks, "frontier"],
      // Matrix recommendations use the current task set even if the caller still
      // carries a former manual model while resetting the visible selection.
      modelId: initial.recommended!.model.id,
      priority,
    });
    assert.equal(comparison.recommended?.model.id, "kimi-k3", priority);
    assert.equal(comparison.recommended?.gpu.id, "gb300", priority);
    assert.equal(comparison.recommended?.result?.gpuCount, 8);
    assert.ok(
      comparison.rows
        .filter((row) => row.model.name.startsWith("Llama"))
        .every((row) => !row.eligible),
    );
    assert.ok(
      comparison.modelRows.find(
        (row) => row.model.id === initial.recommended?.model.id,
      )?.reasons.length,
    );
  }
});
