import assert from "node:assert/strict";
import test from "node:test";
import { cloneDefaultConfig, parseConfig } from "./config";
import {
  configuredMonths,
  HORIZON_STORAGE_KEY,
  readCalculationHorizon,
  recoverCalculationHorizon,
  writeCalculationHorizon,
} from "./calculation-horizon";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("new and previously annual catalogs default to 36 months without writing a local override", () => {
  const storage = new MemoryStorage(),
    current = cloneDefaultConfig();
  assert.equal(configuredMonths(current), 36);
  assert.equal(readCalculationHorizon(storage, current).months, 36);
  assert.equal(storage.getItem(HORIZON_STORAGE_KEY), null);
  current.catalogUpdateVersion = 1;
  current.scenarioPresets[0].input.years = 1;
  delete current.scenarioPresets[0].input.months;
  const upgraded = parseConfig(current).config!;
  assert.equal(readCalculationHorizon(storage, upgraded).months, 36);
});

test("a shared explicit monthly choice survives remount and default updates across routes", () => {
  const storage = new MemoryStorage(),
    config = cloneDefaultConfig();
  assert.equal(writeCalculationHorizon(storage, config, 18).ok, true);
  assert.equal(readCalculationHorizon(storage, config).months, 18);
  const newDefaults = cloneDefaultConfig();
  newDefaults.scenarioPresets[0].input.months = 60;
  assert.equal(
    readCalculationHorizon(storage, newDefaults).months,
    18,
    "an explicit local choice wins over default changes",
  );
  assert.equal(
    writeCalculationHorizon(storage, newDefaults, 48).ok,
    true,
    "Settings Save publishes its monthly selection",
  );
  assert.equal(readCalculationHorizon(storage, config).months, 48);
  assert.equal(
    readCalculationHorizon(new MemoryStorage(), newDefaults).months,
    60,
    "without an override, use current published defaults",
  );
});

test("invalid, corrupted and unwritable horizons remain intact until explicit recovery", () => {
  const storage = new MemoryStorage(),
    config = cloneDefaultConfig();
  assert.equal(writeCalculationHorizon(storage, config, 120).ok, true);
  for (const invalid of [0, 121, 1.5, "36"])
    assert.equal(writeCalculationHorizon(storage, config, invalid).ok, false);
  assert.equal(readCalculationHorizon(storage, config).months, 120);
  storage.setItem(HORIZON_STORAGE_KEY, "broken");
  assert.equal(readCalculationHorizon(storage, config).recoveryRaw, "broken");
  assert.equal(writeCalculationHorizon(storage, config, 36).ok, false);
  assert.equal(storage.getItem(HORIZON_STORAGE_KEY), "broken");
  assert.equal(recoverCalculationHorizon(storage, 36, "old").ok, false);
  assert.equal(recoverCalculationHorizon(storage, 36, "broken").ok, true);
  assert.ok(
    [...storage.values].some(
      ([key, raw]) =>
        key.startsWith(`${HORIZON_STORAGE_KEY}:recovery:`) && raw === "broken",
    ),
  );
  const full = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(writeCalculationHorizon(full, config, 60).ok, false);
  const denied = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("unexpected write");
    },
  };
  assert.equal(writeCalculationHorizon(denied, config, 60).ok, false);
});
