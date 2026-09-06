import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaultConfig } from "./config";
import {
  HORIZON_STORAGE_KEY,
  readCalculationHorizon,
} from "./calculation-horizon";
import { readTaskSelection, TASK_SELECTION_KEY } from "./task-selection";
import { applyScenarioSelection } from "./scenario-selection";

class MemoryStorage {
  values = new Map<string, string>();
  writes: string[] = [];
  failWrite?: (key: string, value: string) => void;
  failRemove?: (key: string) => void;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes.push(key);
    this.failWrite?.(key, value);
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.writes.push(key);
    this.failRemove?.(key);
    this.values.delete(key);
  }
}

const oldHorizon = ' { "version": 1, "months": 36 } ';
const oldTasks = ' { "version": 1, "taskIds": ["contracts"] } ';
function populatedStorage() {
  const storage = new MemoryStorage();
  storage.values.set(HORIZON_STORAGE_KEY, oldHorizon);
  storage.values.set(TASK_SELECTION_KEY, oldTasks);
  return storage;
}

test("snapshot choices are saved together, including historical tasks absent from the live catalog", () => {
  const storage = populatedStorage(),
    config = cloneDefaultConfig();
  const selection = { months: 18, taskIds: ["historical-task", "agents"] };
  assert.deepEqual(applyScenarioSelection(storage, config, selection), {
    ok: true,
    error: null,
  });
  assert.equal(readCalculationHorizon(storage, config).months, 18);
  assert.deepEqual(
    readTaskSelection(storage, config).taskIds,
    selection.taskIds,
  );
  assert.deepEqual(storage.writes, [HORIZON_STORAGE_KEY, TASK_SELECTION_KEY]);
});

test("invalid new choices never mutate either saved choice", () => {
  for (const selection of [
    { months: 0, taskIds: ["agents"] },
    { months: 121, taskIds: ["agents"] },
    { months: 18.5, taskIds: ["agents"] },
    { months: "18", taskIds: ["agents"] },
    { months: 18, taskIds: ["agents", "agents"] },
    { months: 18, taskIds: [42] },
  ]) {
    const storage = populatedStorage();
    const before = [...storage.values];
    assert.equal(
      applyScenarioSelection(storage, cloneDefaultConfig(), selection).ok,
      false,
    );
    assert.deepEqual([...storage.values], before);
    assert.deepEqual(storage.writes, []);
  }
});

test("both saved choices must pass recovery checks before the first write", () => {
  for (const brokenKey of [HORIZON_STORAGE_KEY, TASK_SELECTION_KEY]) {
    const storage = populatedStorage();
    storage.values.set(brokenKey, "broken-json");
    const before = [...storage.values];
    const result = applyScenarioSelection(storage, cloneDefaultConfig(), {
      months: 18,
      taskIds: ["agents"],
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /повреждён/);
    assert.deepEqual([...storage.values], before);
    assert.deepEqual(storage.writes, []);
  }
});

test("unreadable previous values and failure of the first write leave both choices intact", () => {
  const storage = populatedStorage();
  const before = [...storage.values];
  const blocked = {
    ...storage,
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      assert.fail("write before validation");
    },
    removeItem() {
      assert.fail("remove before validation");
    },
  };
  assert.equal(
    applyScenarioSelection(blocked, cloneDefaultConfig(), {
      months: 18,
      taskIds: ["agents"],
    }).ok,
    false,
  );
  storage.failWrite = () => {
    throw new Error("quota");
  };
  const failed = applyScenarioSelection(storage, cloneDefaultConfig(), {
    months: 18,
    taskIds: ["agents"],
  });
  assert.equal(failed.ok, false);
  assert.deepEqual([...storage.values], before);
  assert.deepEqual(storage.writes, [HORIZON_STORAGE_KEY]);
});

test("failure of the second write restores exact existing raw data", () => {
  const storage = populatedStorage();
  const before = [...storage.values];
  storage.failWrite = (key) => {
    if (key === TASK_SELECTION_KEY) throw new Error("quota");
  };
  const result = applyScenarioSelection(storage, cloneDefaultConfig(), {
    months: 18,
    taskIds: ["agents"],
  });
  assert.equal(result.ok, false);
  assert.match(result.error!, /Прежний срок и выбор задач сохранены/);
  assert.deepEqual([...storage.values], before);
});

test("rollback removes newly created keys and preserves unmigrated legacy data", () => {
  const storage = new MemoryStorage();
  storage.values.set("gpu-calculator:input:v1", '{"taskIds":["search"]}');
  const before = [...storage.values];
  storage.failWrite = (key) => {
    if (key === TASK_SELECTION_KEY) throw new Error("quota");
  };
  assert.equal(
    applyScenarioSelection(storage, cloneDefaultConfig(), {
      months: 30,
      taskIds: ["agents"],
    }).ok,
    false,
  );
  assert.deepEqual([...storage.values], before);
  assert.equal(storage.getItem(HORIZON_STORAGE_KEY), null);
  assert.equal(storage.getItem(TASK_SELECTION_KEY), null);
});

test("a storage adapter that writes before throwing still rolls both keys back", () => {
  const storage = populatedStorage();
  const before = [...storage.values];
  storage.failWrite = (key, raw) => {
    if (key === TASK_SELECTION_KEY && raw !== oldTasks) {
      storage.values.set(key, raw);
      throw new Error("failed after write");
    }
  };
  assert.equal(
    applyScenarioSelection(storage, cloneDefaultConfig(), {
      months: 30,
      taskIds: ["agents"],
    }).ok,
    false,
  );
  assert.deepEqual([...storage.values], before);
});

test("a failed rollback reports the remaining partial change instead of claiming restoration", () => {
  for (const existingHorizon of [false, true]) {
    const storage = existingHorizon ? populatedStorage() : new MemoryStorage();
    storage.failWrite = (key, raw) => {
      if (key === TASK_SELECTION_KEY || raw === oldHorizon)
        throw new Error("denied");
    };
    storage.failRemove = () => {
      throw new Error("denied");
    };
    const result = applyScenarioSelection(storage, cloneDefaultConfig(), {
      months: 30,
      taskIds: ["agents"],
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /не удалось полностью восстановить/);
    assert.match(result.error!, /измениться частично/);
    assert.equal(
      readCalculationHorizon(storage, cloneDefaultConfig()).months,
      30,
    );
  }
});
