import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { calculate, compactRub, formatRub } from "./calculator";
import { compareDeployments, type ComparisonRow } from "./comparison";
import { cloneDefaultConfig, STORAGE_KEY, type AppConfig } from "./config";
import {
  createScenario,
  scenarioInput,
  SCENARIO_STORAGE_KEY,
} from "./scenarios";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let CalculatorPage: typeof import("../app/page").default;
const originalFetch = globalThis.fetch;
const money = (value: number) => compactRub(value).replace(/\.([0-9])/g, ",$1");

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://gpu.example.test",
    pretendToBeVisual: true,
  });
  for (const [key, value] of Object.entries({
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
    BroadcastChannel: undefined,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  ui = await import("@testing-library/react");
  ({ default: CalculatorPage } = await import("../app/page"));
});
afterEach(() => {
  ui.cleanup();
  dom.window.localStorage.clear();
  globalThis.fetch = originalFetch;
});
after(() => {
  dom.window.close();
});

async function renderPage(config?: AppConfig) {
  if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  globalThis.fetch = async () =>
    Response.json({ configured: false, authenticated: false, role: null });
  const view = ui.render(createElement(CalculatorPage));
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  return view;
}
function decisionCard(): HTMLElement {
  const heading = document.querySelector("#decision-title");
  assert.ok(
    heading,
    "a calculated decision is shown without entering technical parameters",
  );
  return heading.closest("section")!;
}
function chooseButton(row: ComparisonRow, chosen = false): HTMLButtonElement {
  return ui.screen.getByRole("button", {
    name: `${chosen ? "Выбран" : "Выбрать"} ${row.model.name}, ${row.gpu.name}`,
  }) as HTMLButtonElement;
}

test("главная сразу показывает четыре бизнес-сценария и стоимость без технического ввода", async () => {
  await renderPage();
  const region = ui.screen.getByRole("region", { name: "Ваш сценарий" });
  const presets = ui.within(region).getAllByRole("button");
  assert.equal(presets.length, 4);
  for (const title of [
    "Пилот ИИ-ассистента",
    "Работа с документами",
    "Аналитика и агенты",
    "Корпоративный масштаб",
  ])
    assert.ok(
      ui.within(region).getByRole("button", { name: new RegExp(title) }),
    );
  assert.equal(
    presets.filter((button) => button.getAttribute("aria-pressed") === "true")
      .length,
    1,
  );
  assert.equal(ui.screen.queryByRole("spinbutton"), null);
  assert.ok(ui.screen.getByRole("link", { name: "Параметры" }));
  const card = decisionCard();
  assert.ok(ui.within(card).getByText("Покупка и владение"));
  assert.ok(ui.within(card).getByText("Аренда и обслуживание"));
  assert.match(card.textContent!, /₽/);
});

test("выбор сценария меняет горизонт, нагрузку и показанные TCO", async () => {
  const config = cloneDefaultConfig();
  await renderPage(config);
  const previous = decisionCard().textContent;
  const target = config.scenarioPresets.find(
    (preset) => preset.id === "enterprise",
  )!;
  const input = scenarioInput(config, target.id);
  const expected = compareDeployments(config, input).recommended;
  assert.ok(expected?.result);
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: /Корпоративный масштаб/ }),
  );
  const card = decisionCard();
  assert.notEqual(card.textContent, previous);
  assert.ok(
    ui.within(card).getByRole("heading", { name: expected.model.name }),
  );
  assert.ok(card.textContent?.includes(money(expected.result.buyTco)));
  assert.ok(card.textContent?.includes(money(expected.result.rentTco)));
  assert.ok(card.textContent?.includes(`Горизонт · ${input.years * 12} мес.`));
  const details = document.querySelector<HTMLDetailsElement>(
    "#calculation-details",
  )!;
  ui.fireEvent.click(details.querySelector("summary")!);
  assert.equal(details.open, true);
  const values = new Map(
    Array.from(details.querySelectorAll("dl > div")).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ]),
  );
  assert.equal(values.get("Одновременные запросы"), String(input.concurrency));
  assert.equal(values.get("Работа в месяц"), `${input.hoursMonth} ч`);
  assert.equal(
    values.get("Вход / ответ, токенов"),
    `${input.inputTokens!.toLocaleString("ru-RU")} / ${input.outputTokens!.toLocaleString("ru-RU")}`,
  );
  assert.equal(
    ui.screen.queryByRole("spinbutton"),
    null,
    "expanded explanation remains read-only",
  );
});

test("переключение Модели/GPU показывает сопоставимые TCO и явные цены сервера и GPU-часа", async () => {
  const config = cloneDefaultConfig();
  const input = scenarioInput(config, config.defaultScenarioId);
  const comparison = compareDeployments(config, input);
  const selected = comparison.recommended;
  assert.ok(selected?.result);
  await renderPage(config);
  const modelRegion = ui.screen.getByRole("region", {
    name: "Сравнение моделей и стоимости",
  });
  assert.equal(
    modelRegion.querySelectorAll("tbody tr:not(.row-explanation)").length,
    5,
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", {
      name: `Все модели (${comparison.modelRows.length})`,
    }),
  );
  assert.equal(
    modelRegion.querySelectorAll("tbody tr:not(.row-explanation)").length,
    comparison.modelRows.length,
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Свернуть список" }),
  );
  assert.equal(
    modelRegion.querySelectorAll("tbody tr:not(.row-explanation)").length,
    5,
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "GPU" }));
  const gpuRegion = ui.screen.getByRole("region", {
    name: "Сравнение GPU и цен",
  });
  assert.ok(
    ui
      .within(gpuRegion)
      .getByRole("columnheader", { name: /Цена оборудования/ }),
  );
  assert.ok(
    ui.within(gpuRegion).getByRole("columnheader", { name: /Тариф GPU-час/ }),
  );
  assert.equal(
    (
      ui.screen.getByRole("combobox", {
        name: "Модель для сравнения GPU",
      }) as HTMLSelectElement
    ).value,
    selected.model.id,
  );
  assert.equal(
    gpuRegion.querySelectorAll("tbody tr:not(.row-explanation)").length,
    config.gpus.filter((gpu) => gpu.enabled).length,
  );
  const row = chooseButton(selected, true).closest("tr")!;
  assert.ok(
    row.textContent?.includes(money(selected.purchasePerGpuEquivalentRub)),
  );
  assert.ok(
    row.textContent?.includes(`${money(selected.purchaseNodeRub)} / сервер`),
  );
  assert.ok(
    row.textContent?.includes(
      `${formatRub(selected.rentPerGpuHourRub)} / GPU-час`,
    ),
  );
  assert.ok(row.textContent?.includes(money(selected.result.buyTco)));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Модели" }));
  assert.ok(
    ui.screen.getByRole("region", { name: "Сравнение моделей и стоимости" }),
  );
  assert.equal(
    ui.screen.queryByRole("combobox", { name: "Модель для сравнения GPU" }),
    null,
  );
});

test("выбранная альтернативная связка сохраняется после повторного открытия главной", async () => {
  const config = cloneDefaultConfig();
  const comparison = compareDeployments(
    config,
    scenarioInput(config, config.defaultScenarioId),
  );
  const alternative = comparison.modelRows.find(
    (row) =>
      row.eligible && row.result && row.id !== comparison.recommended?.id,
  );
  assert.ok(alternative);
  const first = await renderPage(config);
  ui.fireEvent.click(chooseButton(alternative));
  assert.equal(
    chooseButton(alternative, true).getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(
    ui
      .within(decisionCard())
      .getByRole("heading", { name: alternative.model.name }),
  );
  first.unmount();
  await renderPage();
  assert.equal(
    chooseButton(alternative, true).getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(
    ui
      .within(decisionCard())
      .getByRole("heading", { name: alternative.model.name }),
  );
});

test("открытие сохранённого варианта использует снимок цен и выбранную связку", async () => {
  const captured = cloneDefaultConfig();
  const input = scenarioInput(captured, captured.defaultScenarioId);
  const comparison = compareDeployments(captured, input);
  const alternative = comparison.modelRows.find(
    (row) =>
      row.eligible && row.result && row.id !== comparison.recommended?.id,
  );
  assert.ok(alternative);
  const saved = createScenario(
    "Согласованный вариант",
    captured,
    { ...input, modelId: alternative.model.id, gpuId: alternative.gpu.id },
    new Date("2026-09-06T10:00:00Z"),
  );
  const expected = calculate(saved.config, saved.input);
  localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify([saved]));
  const current = structuredClone(captured);
  current.gpus.forEach((gpu) => {
    gpu.nodePriceRub *= 10;
    gpu.rentPerGpuHourRub *= 10;
  });
  current.revision += 1;
  await renderPage(current);
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить вариант" }),
  );
  ui.fireEvent.click(await ui.screen.findByRole("button", { name: "Открыть" }));
  assert.ok(ui.screen.getByRole("heading", { name: "Согласованный вариант" }));
  assert.ok(ui.screen.getByText("Сохранённые параметры и цены"));
  const card = decisionCard();
  assert.ok(
    ui.within(card).getByRole("heading", { name: alternative.model.name }),
  );
  assert.ok(card.textContent?.includes(money(expected.buyTco)));
  assert.ok(card.textContent?.includes(money(expected.rentTco)));
  assert.equal(
    chooseButton(alternative, true).getAttribute("aria-pressed"),
    "true",
  );
  const liveResult = calculate(current, saved.input);
  assert.notEqual(money(expected.buyTco), money(liveResult.buyTco));
});

test("неподтверждённая связка помечена ограничениями и не становится рекомендацией при выборе", async () => {
  const config = cloneDefaultConfig();
  const comparison = compareDeployments(
    config,
    scenarioInput(config, config.defaultScenarioId),
  );
  assert.ok(comparison.recommended);
  const unsupported = comparison.rows.find(
    (row) =>
      row.model.id === comparison.recommended!.model.id &&
      !row.eligible &&
      row.result,
  );
  assert.ok(unsupported);
  await renderPage(config);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "GPU" }));
  const row = chooseButton(unsupported).closest("tr")!;
  assert.ok(ui.within(row).getByRole("button", { name: "Нужна проверка" }));
  assert.equal(ui.within(row).queryByText("Оптимальный"), null);
  ui.fireEvent.click(chooseButton(unsupported));
  const card = decisionCard();
  assert.ok(ui.within(card).getByText("Вариант требует проверки"));
  assert.equal(
    ui.within(card).queryByText("Оптимальный вариант по сценарию"),
    null,
  );
  assert.ok(
    ui
      .within(card)
      .getByText("Совместимость или требования сценария не подтверждены."),
  );
  ui.fireEvent.click(
    ui.within(row).getByRole("button", { name: "Нужна проверка" }),
  );
  assert.equal(
    ui
      .within(row)
      .getByRole("button", { name: "Нужна проверка" })
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.ok(
    document
      .querySelector(".row-explanation")
      ?.textContent?.includes(unsupported.reasons[0]),
  );
});
