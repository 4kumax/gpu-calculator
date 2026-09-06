import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement, useState } from "react";
import { JSDOM } from "jsdom";
import { calculate, type CalculationInput } from "./calculator";
import { cloneDefaultConfig } from "./config";
import {
  defaultInput,
  parseScenario,
  readScenarios,
  SCENARIO_STORAGE_KEY,
  type Scenario,
} from "./scenarios";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let NumberField: typeof import("../components/number-field").NumberField;
let CalculatorControls: typeof import("../components/calculator-controls").CalculatorControls;
let CalculatorResults: typeof import("../components/calculator-results").CalculatorResults;
let ScenarioManager: typeof import("../components/scenario-manager").ScenarioManager;

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://gpu.example.test",
    pretendToBeVisual: true,
  });
  const globals: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    StorageEvent: dom.window.StorageEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  // React DOM detects input event support during module evaluation.
  // Import the renderer only after a document is available.
  ui = await import("@testing-library/react");
  ({ NumberField } = await import("../components/number-field"));
  ({ CalculatorControls } = await import("../components/calculator-controls"));
  ({ CalculatorResults } = await import("../components/calculator-results"));
  ({ ScenarioManager } = await import("../components/scenario-manager"));
});

afterEach(() => {
  ui.cleanup();
  dom.window.localStorage.clear();
});

after(() => {
  dom.window.close();
});

const scenarioInput = (): CalculationInput => ({
  ...defaultInput(cloneDefaultConfig()),
  taskIds: [],
  concurrency: 1,
});

test("NumberField preserves the last valid value during empty or invalid edits and restores it on blur", () => {
  const changed: number[] = [];
  function Field() {
    const [value, setValue] = useState(8);
    return createElement(NumberField, {
      label: "Одновременные запросы",
      value,
      min: 1,
      max: 100,
      onChange: (next: number) => {
        changed.push(next);
        setValue(next);
      },
    });
  }
  ui.render(createElement(Field));
  const input = ui.screen.getByRole("spinbutton", {
    name: "Одновременные запросы",
  }) as HTMLInputElement;
  for (const invalid of ["", "-2", "101", "1.5"]) {
    ui.fireEvent.change(input, { target: { value: invalid } });
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.deepEqual(
      changed,
      [],
      "invalid text must not reach the calculation",
    );
    ui.fireEvent.blur(input);
    assert.equal(input.value, "8");
    assert.equal(input.getAttribute("aria-invalid"), "false");
  }
  ui.fireEvent.change(input, { target: { value: "12" } });
  assert.deepEqual(changed, [12]);
  ui.fireEvent.change(input, { target: { value: "" } });
  ui.fireEvent.blur(input);
  assert.equal(input.value, "12");
});

test("NumberField accepts a small fractional workload and follows an externally restored value", () => {
  const changed: number[] = [];
  const props = {
    label: "Доля нагрузки",
    value: 100,
    min: 0.001,
    max: 100,
    step: 0.1,
    onChange: (value: number) => changed.push(value),
  };
  const rendered = ui.render(createElement(NumberField, props));
  const input = ui.screen.getByRole("spinbutton", {
    name: props.label,
  }) as HTMLInputElement;
  ui.fireEvent.change(input, { target: { value: "0.1" } });
  assert.deepEqual(changed, [0.1]);
  assert.equal(input.getAttribute("aria-invalid"), "false");
  rendered.rerender(createElement(NumberField, { ...props, value: 25 }));
  assert.equal(input.value, "25");
});

test("calculator controls toggle accessible task selection and apply the chosen GPU and reserve mode", () => {
  const config = cloneDefaultConfig();
  const updates: Partial<CalculationInput>[] = [];
  function Controls() {
    const [input, setInput] = useState(scenarioInput);
    return createElement(CalculatorControls, {
      config,
      input,
      onChange: (patch) => {
        updates.push(patch);
        setInput((current) => ({ ...current, ...patch }));
      },
    });
  }
  ui.render(createElement(Controls));
  const task = config.tasks.find((item) => item.enabled)!;
  const button = ui.screen.getByRole("button", {
    name: new RegExp(task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  ui.fireEvent.click(button);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.deepEqual(updates.at(-1), { taskIds: [task.id] });
  ui.fireEvent.click(button);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.deepEqual(updates.at(-1), { taskIds: [] });
  const gpu = config.gpus.find((item) => item.enabled && item.id === "h200")!;
  const select = ui.screen.getByRole("combobox", {
    name: /Ускоритель/,
  }) as HTMLSelectElement;
  ui.fireEvent.change(select, { target: { value: gpu.id } });
  assert.equal(select.value, gpu.id);
  assert.deepEqual(updates.at(-1), { gpuId: gpu.id });
  assert.equal(
    ui.screen.queryByRole("combobox", {
      name: "Оплата резервного узла в аренде",
    }),
    null,
  );
  ui.fireEvent.change(
    ui.screen.getByRole("combobox", { name: "Резервирование" }),
    { target: { value: "nplus1" } },
  );
  assert.ok(
    ui.screen.getByRole("combobox", {
      name: "Оплата резервного узла в аренде",
    }),
  );
});

test("scenario save and load keep the captured catalogue, workload and calculation date", async () => {
  const config = cloneDefaultConfig();
  const input = scenarioInput();
  const loaded: Scenario[] = [];
  ui.render(
    createElement(ScenarioManager, {
      config,
      input,
      onLoad: (scenario) => loaded.push(scenario),
    }),
  );
  ui.fireEvent.change(
    ui.screen.getByRole("textbox", { name: "Название нового сценария" }),
    { target: { value: "Пилот" } },
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить сценарий" }),
  );
  await ui.waitFor(() =>
    assert.match(ui.screen.getByRole("status").textContent!, /Пилот.*сохранён/),
  );
  const saved = readScenarios(
    localStorage.getItem(SCENARIO_STORAGE_KEY),
  ).value!;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "Пилот");
  assert.ok(saved[0].input.asOf);
  const originalPrice = saved[0].config.gpus[0].nodePriceRub;
  config.gpus[0].nodePriceRub *= 2;
  input.concurrency = 100;
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Открыть" }));
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].config.gpus[0].nodePriceRub, originalPrice);
  assert.equal(loaded[0].input.concurrency, 1);
  assert.deepEqual(loaded[0], saved[0]);
  const compare = ui.screen.getByRole("checkbox", {
    name: "Сравнить Пилот",
  }) as HTMLInputElement;
  assert.equal(compare.checked, true);
  ui.fireEvent.click(compare);
  assert.equal(compare.checked, false);
});

test("scenario export downloads a reproducible JSON blob and releases its object URL", async (context) => {
  const blobs: Blob[] = [];
  const links: { href: string; download: string }[] = [];
  const revoked: string[] = [];
  context.mock.method(URL, "createObjectURL", (blob: Blob) => {
    blobs.push(blob);
    return "blob:gpu-test-export";
  });
  context.mock.method(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  context.mock.method(
    dom.window.HTMLAnchorElement.prototype,
    "click",
    function (this: HTMLAnchorElement) {
      links.push({ href: this.href, download: this.download });
    },
  );
  const config = cloneDefaultConfig();
  ui.render(
    createElement(ScenarioManager, {
      config,
      input: scenarioInput(),
      onLoad: () => undefined,
    }),
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Экспорт расчёта" }),
  );
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].type, "application/json");
  assert.deepEqual(links, [
    { href: "blob:gpu-test-export", download: "gpu-calculation.json" },
  ]);
  assert.equal(
    document.querySelector("a[download]"),
    null,
    "temporary anchor is removed",
  );
  const report = JSON.parse(await blobs[0].text());
  assert.ok(parseScenario(report).value);
  assert.equal(
    report.result.buyTco,
    calculate(report.config, report.input).buyTco,
  );
  await ui.waitFor(() => assert.deepEqual(revoked, ["blob:gpu-test-export"]), {
    timeout: 2000,
  });
});

test("corrupt scenario storage remains intact and blocks a save until recovery", () => {
  const raw = '{"damaged":';
  localStorage.setItem(SCENARIO_STORAGE_KEY, raw);
  ui.render(
    createElement(ScenarioManager, {
      config: cloneDefaultConfig(),
      input: scenarioInput(),
      onLoad: () => undefined,
    }),
  );
  assert.match(
    ui.screen.getByRole("alert").textContent!,
    /Исходные данные не изменены/,
  );
  ui.fireEvent.change(
    ui.screen.getByRole("textbox", { name: "Название нового сценария" }),
    { target: { value: "Новый" } },
  );
  const save = ui.screen.getByRole("button", {
    name: "Сохранить сценарий",
  }) as HTMLButtonElement;
  assert.equal(save.disabled, true);
  ui.fireEvent.click(save);
  assert.equal(localStorage.getItem(SCENARIO_STORAGE_KEY), raw);
  assert.ok(
    ui.screen.getByRole("button", {
      name: "Скачать исходные данные для восстановления",
    }),
  );
});

test("calculator result distinguishes equal costs from a buy advantage at every workload", () => {
  const config = cloneDefaultConfig();
  const input = scenarioInput();
  const result = {
    ...calculate(config, input),
    buyTco: 100,
    rentTco: 100,
    breakEvenDirection: "equal" as const,
    breakEvenHoursMonth: null,
  };
  ui.render(createElement(CalculatorResults, { config, input, result }));
  assert.ok(ui.screen.getByText("Затраты равны", { exact: true }));
  assert.ok(ui.screen.getByText("затраты равны", { exact: true }));
  assert.equal(
    ui.screen.queryByText("при любой загрузке", { exact: true }),
    null,
  );
  assert.equal(ui.screen.queryByText("не достигается", { exact: true }), null);
});

test("calculator page restores edited inputs across route remounts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ configured: false, authenticated: false, role: null });
  try {
    const { default: CalculatorPage } = await import("../app/page");
    const first = ui.render(createElement(CalculatorPage));
    const hours = await ui.screen.findByRole("spinbutton", {
      name: "Работа под нагрузкой, ч/мес.",
    });
    ui.fireEvent.change(hours, { target: { value: "500" } });
    first.unmount();
    ui.render(createElement(CalculatorPage));
    const restored = (await ui.screen.findByRole("spinbutton", {
      name: "Работа под нагрузкой, ч/мес.",
    })) as HTMLInputElement;
    assert.equal(restored.value, "500");
    assert.ok(
      ui.screen.getByRole("heading", { name: "Сценарии и согласование" }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calculator page requires a shared session before exposing a calculation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ configured: true, authenticated: false, role: null });
  try {
    const { default: CalculatorPage } = await import("../app/page");
    ui.render(createElement(CalculatorPage));
    assert.ok(
      await ui.screen.findByRole("link", { name: "Войти в настройках" }),
    );
    assert.equal(ui.screen.queryByRole("spinbutton"), null);
    assert.equal(
      ui.screen.queryByRole("heading", { name: "Сценарии и согласование" }),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
