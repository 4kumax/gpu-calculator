import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneDefaultConfig,
  createBusinessScenarioPresets,
  parseConfig,
} from "./config";
import {
  configuredTaskIds,
  loadTaskSelection,
  parseTaskIds,
  readTaskSelection,
  recoverTaskSelection,
  TASK_SELECTION_KEY,
  writeTaskSelection,
} from "./task-selection";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("fresh task selection uses the original four tasks and persists a combined or empty selection", () => {
  const config = cloneDefaultConfig(),
    storage = new MemoryStorage();
  assert.deepEqual(configuredTaskIds(config), [
    "contracts",
    "estimates",
    "incidents",
    "agents",
  ]);
  assert.deepEqual(
    readTaskSelection(storage, config).taskIds,
    configuredTaskIds(config),
  );
  assert.equal(
    storage.getItem(TASK_SELECTION_KEY),
    null,
    "read does not publish or overwrite data",
  );
  assert.equal(
    writeTaskSelection(storage, config, ["search", "frontier"]).ok,
    true,
  );
  assert.deepEqual(readTaskSelection(storage, config).taskIds, [
    "search",
    "frontier",
  ]);
  assert.equal(writeTaskSelection(storage, config, []).ok, true);
  assert.deepEqual(readTaskSelection(storage, config).taskIds, []);
});

test("legacy input and explicitly chosen prior presets retain the user's selection", () => {
  const old = cloneDefaultConfig(),
    storage = new MemoryStorage();
  old.scenarioPresets = createBusinessScenarioPresets(old.tasks);
  old.defaultScenarioId = "pilot";
  const config = parseConfig(old).config!;
  storage.setItem(
    "gpu-calculator:input:v1",
    JSON.stringify({ input: { taskIds: ["contracts", "frontier"] } }),
  );
  assert.deepEqual(readTaskSelection(storage, config).taskIds, [
    "contracts",
    "frontier",
  ]);
  storage.setItem(
    "gpu-calculator:executive-view:v4",
    JSON.stringify({ presetId: "analytics" }),
  );
  assert.deepEqual(readTaskSelection(storage, config).taskIds, [
    "management",
    "agents",
  ]);
  storage.setItem(
    "gpu-calculator:executive-view:v4",
    JSON.stringify({ presetId: "" }),
  );
  assert.deepEqual(
    readTaskSelection(storage, config).taskIds,
    ["contracts", "frontier"],
    "an implicit abandoned default does not erase an older explicit choice",
  );
  assert.equal(writeTaskSelection(storage, config, ["search"]).ok, true);
  assert.deepEqual(
    readTaskSelection(storage, config).taskIds,
    ["search"],
    "current selection wins over legacy storage",
  );
});

test("unknown selected task IDs stay visible to validation rather than silently lowering requirements", () => {
  const config = cloneDefaultConfig(),
    storage = new MemoryStorage();
  storage.setItem(
    TASK_SELECTION_KEY,
    JSON.stringify({ version: 1, taskIds: ["removed-task", "frontier"] }),
  );
  assert.deepEqual(readTaskSelection(storage, config).taskIds, [
    "removed-task",
    "frontier",
  ]);
  assert.equal(parseTaskIds(["search", "search"]), null);
  assert.equal(parseTaskIds([123]), null);
});

test("corrupt selection, denied reads and full storage never report a successful update", () => {
  const config = cloneDefaultConfig(),
    storage = new MemoryStorage();
  storage.setItem(TASK_SELECTION_KEY, "broken");
  const damaged = readTaskSelection(storage, config);
  assert.equal(damaged.recoveryRaw, "broken");
  assert.ok(damaged.error);
  assert.equal(writeTaskSelection(storage, config, ["search"]).ok, false);
  assert.equal(storage.getItem(TASK_SELECTION_KEY), "broken");
  const unavailable = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("must not write");
    },
  };
  assert.equal(writeTaskSelection(unavailable, config, ["search"]).ok, false);
  const full = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(writeTaskSelection(full, config, ["search"]).ok, false);
});

test("explicit recovery creates a backup and refuses to replace a newer choice", () => {
  const config = cloneDefaultConfig(),
    storage = new MemoryStorage();
  storage.setItem(TASK_SELECTION_KEY, "broken");
  assert.equal(
    recoverTaskSelection(storage, ["contracts"], "different").ok,
    false,
  );
  assert.equal(storage.getItem(TASK_SELECTION_KEY), "broken");
  assert.equal(recoverTaskSelection(storage, ["contracts"], "broken").ok, true);
  assert.deepEqual(readTaskSelection(storage, config).taskIds, ["contracts"]);
  assert.ok(
    [...storage.values.entries()].some(
      ([key, value]) =>
        key.startsWith(`${TASK_SELECTION_KEY}:recovery:`) && value === "broken",
    ),
  );
  assert.equal(recoverTaskSelection(storage, ["frontier"], "broken").ok, false);
});

test("legacy selection is migrated once before the executive view is rewritten and survives remount", () => {
  const old = cloneDefaultConfig(),
    storage = new MemoryStorage();
  old.scenarioPresets = createBusinessScenarioPresets(old.tasks);
  old.defaultScenarioId = "pilot";
  const config = parseConfig(old).config!;
  storage.setItem(
    "gpu-calculator:executive-view:v4",
    JSON.stringify({ presetId: "analytics" }),
  );
  const migrated = loadTaskSelection(storage, config);
  assert.equal(migrated.error, null);
  assert.deepEqual(migrated.taskIds, ["management", "agents"]);
  const canonical = storage.getItem(TASK_SELECTION_KEY);
  assert.ok(canonical);
  storage.setItem(
    "gpu-calculator:executive-view:v4",
    JSON.stringify({ selectedId: null, snapshot: null }),
  );
  assert.deepEqual(loadTaskSelection(storage, config).taskIds, [
    "management",
    "agents",
  ]);
  assert.equal(
    storage.getItem(TASK_SELECTION_KEY),
    canonical,
    "subsequent loads do not rewrite a canonical selection",
  );
  assert.equal(writeTaskSelection(storage, config, ["frontier"]).ok, true);
  storage.setItem(
    "gpu-calculator:executive-view:v4",
    JSON.stringify({ presetId: "documents" }),
  );
  assert.deepEqual(
    loadTaskSelection(storage, config).taskIds,
    ["frontier"],
    "a user's newer canonical selection wins",
  );
});

test("legacy migration preserves an empty selection, reports write failure and leaves the source intact", () => {
  const config = cloneDefaultConfig(),
    storage = new MemoryStorage();
  const raw = JSON.stringify({ input: { taskIds: [] } });
  storage.setItem("gpu-calculator:input:v1", raw);
  const full = {
    getItem: storage.getItem.bind(storage),
    setItem() {
      throw new Error("quota");
    },
  };
  const failed = loadTaskSelection(full, config);
  assert.ok(failed.error);
  assert.deepEqual(failed.taskIds, []);
  assert.equal(storage.getItem(TASK_SELECTION_KEY), null);
  assert.equal(storage.getItem("gpu-calculator:input:v1"), raw);
  const migrated = loadTaskSelection(storage, config);
  assert.equal(migrated.error, null);
  assert.deepEqual(migrated.taskIds, []);
  assert.deepEqual(JSON.parse(storage.getItem(TASK_SELECTION_KEY)!), {
    version: 1,
    taskIds: [],
  });
  assert.equal(storage.getItem("gpu-calculator:input:v1"), raw);
});
