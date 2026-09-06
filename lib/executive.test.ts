import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement, useState, type MouseEvent } from "react";
import { JSDOM } from "jsdom";
import { calculate, compactRub, formatRub } from "./calculator";
import { compareDeployments, type ComparisonRow } from "./comparison";
import { cloneDefaultConfig, STORAGE_KEY, type AppConfig } from "./config";
import { calculationMonths } from "./horizon";
import { HORIZON_STORAGE_KEY } from "./calculation-horizon";
import { TASK_SELECTION_KEY } from "./task-selection";
import {
  createScenario,
  scenarioInput,
  SCENARIO_STORAGE_KEY,
} from "./scenarios";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let CalculatorPage: typeof import("../app/page").default;
let SettingsPage: typeof import("../app/settings/page").default;
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
  ({ default: SettingsPage } = await import("../app/settings/page"));
});
afterEach(() => {
  ui.cleanup();
  dom.window.localStorage.clear();
  dom.window.sessionStorage.clear();
  dom.window.history.replaceState(null, "", "/");
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
function taskCheckbox(title: string): HTMLInputElement {
  return ui.screen.getByRole("checkbox", { name: title }) as HTMLInputElement;
}
function selectedTasks(config: AppConfig): string[] {
  return config.tasks
    .filter((task) => taskCheckbox(task.title).checked)
    .map((task) => task.id);
}
// jsdom cannot load Next routes. Follow the actual page link and mount its real destination.
function RoutedPages() {
  const [path, setPath] = useState("/");
  const navigate = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!link || !["/", "/settings"].includes(link.pathname)) return;
    event.preventDefault();
    dom.window.history.pushState(null, "", link.pathname);
    setPath(link.pathname);
  };
  return createElement(
    "div",
    { onClick: navigate },
    path === "/"
      ? createElement(CalculatorPage)
      : createElement(
          "div",
          null,
          createElement("a", { href: "/" }, "Вернуться к сравнению"),
          createElement(SettingsPage),
        ),
  );
}

test("главная показывает 18 задач, включая все исходные, с множественным выбором без технического ввода", async () => {
  const config = cloneDefaultConfig();
  await renderPage(config);
  const region = ui.screen.getByRole("region", {
    name: "Сценарии использования",
  });
  const choices = ui.within(region).getAllByRole("checkbox");
  assert.equal(choices.length, 18);
  for (const title of [
    "Корпоративный поиск и ответы",
    "Извлечение и классификация",
    "Пересказы и отчёты",
    "Договоры и закупки",
    "Сметы, КС-2 и комплекты документов",
    "Управленческая аналитика",
    "Технические инциденты",
    "Разработка программных систем",
    "Документы с изображениями и схемами",
    "Исследовательские и инженерные агенты",
    "Сверхдлинный контекст",
    "Предельные мультимодальные задачи",
    "Поддержка клиентов",
    "Продажи и CRM",
    "HR и адаптация сотрудников",
    "Финансовый контроль",
    "Комплаенс и внутренний аудит",
    "Перевод и локализация",
  ])
    assert.ok(ui.within(region).getByRole("checkbox", { name: title }));
  assert.deepEqual(
    selectedTasks(config),
    scenarioInput(config, config.defaultScenarioId).taskIds,
  );
  assert.equal(ui.screen.queryByText("Пилот ИИ-ассистента"), null);
  assert.equal(ui.screen.queryByText("Корпоративный масштаб"), null);
  assert.equal(
    (
      ui.screen.getByRole("spinbutton", {
        name: "Срок расчёта, месяцев",
      }) as HTMLInputElement
    ).value,
    "36",
  );
  assert.equal(ui.screen.getAllByRole("spinbutton").length, 1);
  assert.ok(ui.screen.getByRole("link", { name: "Параметры" }));
  const card = decisionCard();
  assert.ok(ui.within(card).getByText("Покупка и владение"));
  assert.ok(ui.within(card).getByText("Аренда и обслуживание"));
  assert.match(card.textContent!, /₽/);
});

test("срок на главной пересчитывает карточку и график, сохраняется и совпадает с Параметрами", async () => {
  const config = cloneDefaultConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  globalThis.fetch = async () =>
    Response.json({ configured: false, authenticated: false, role: null });
  ui.render(createElement(RoutedPages));
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  const field = ui.screen.getByRole("spinbutton", {
    name: "Срок расчёта, месяцев",
  }) as HTMLInputElement;
  ui.fireEvent.change(field, { target: { value: "18" } });
  const expected = compareDeployments(config, {
    ...scenarioInput(config, config.defaultScenarioId),
    months: 18,
  }).recommended!;
  assert.ok(decisionCard().textContent?.includes("Горизонт · 18 мес."));
  assert.ok(
    decisionCard().textContent?.includes(money(expected.result!.rentTco)),
  );
  const slider = ui.screen.getByRole("slider", {
    name: "Месяц на графике накопленных затрат",
  }) as HTMLInputElement;
  assert.equal(slider.max, "18");
  assert.equal(slider.value, "18");
  assert.equal(
    JSON.parse(localStorage.getItem(HORIZON_STORAGE_KEY)!).months,
    18,
  );
  ui.fireEvent.change(field, { target: { value: "0" } });
  assert.equal(field.getAttribute("aria-invalid"), "true");
  assert.ok(decisionCard().textContent?.includes("Горизонт · 18 мес."));
  ui.fireEvent.blur(field);
  assert.equal(field.value, "18");
  ui.fireEvent.click(ui.screen.getByRole("link", { name: "Параметры" }));
  const settingsField = await ui.screen.findByRole("spinbutton", {
    name: "Срок расчёта, месяцев",
  });
  assert.equal((settingsField as HTMLInputElement).value, "18");
  ui.fireEvent.click(
    ui.screen.getByRole("link", { name: "Вернуться к сравнению" }),
  );
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  assert.ok(decisionCard().textContent?.includes("Горизонт · 18 мес."));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "60 мес." }));
  assert.ok(decisionCard().textContent?.includes("Горизонт · 60 мес."));
  assert.equal((ui.screen.getByRole("slider") as HTMLInputElement).max, "60");
});

test("прежний срок 12 месяцев и автоматически открытый снимок уступают новому сроку 36 без потери архива", async () => {
  const config = cloneDefaultConfig();
  config.catalogUpdateVersion = 1;
  for (const preset of config.scenarioPresets) {
    preset.input.years = 1;
    delete preset.input.months;
  }
  const saved = createScenario(
    "Прежний расчёт",
    config,
    scenarioInput(config, config.defaultScenarioId),
  );
  const library = JSON.stringify([saved]);
  const viewKey = "gpu-calculator:executive-view:v4";
  const previousView = JSON.stringify({ snapshot: saved, selectedId: null });
  localStorage.setItem(SCENARIO_STORAGE_KEY, library);
  localStorage.setItem(viewKey, previousView);
  await renderPage(config);
  assert.ok(decisionCard().textContent?.includes("Горизонт · 36 мес."));
  assert.equal(
    (ui.screen.getByRole("spinbutton") as HTMLInputElement).value,
    "36",
  );
  assert.equal(
    localStorage.getItem(`${viewKey}:before-dashboard`),
    previousView,
  );
  assert.equal(localStorage.getItem(SCENARIO_STORAGE_KEY), library);
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить вариант" }),
  );
  ui.fireEvent.click(await ui.screen.findByRole("button", { name: "Открыть" }));
  assert.ok(decisionCard().textContent?.includes("Горизонт · 12 мес."));
  assert.equal(localStorage.getItem(SCENARIO_STORAGE_KEY), library);
});

test("добавление предельной задачи требует Kimi и её снятие восстанавливает прежний подходящий вариант", async () => {
  const config = cloneDefaultConfig();
  await renderPage(config);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Снять выбор" }));
  ui.fireEvent.click(taskCheckbox("Корпоративный поиск и ответы"));
  ui.fireEvent.click(taskCheckbox("Договоры и закупки"));
  const previous = decisionCard().textContent;
  const input = {
    ...scenarioInput(config, config.defaultScenarioId),
    taskIds: ["search", "contracts", "frontier"],
  };
  const expected = compareDeployments(config, input).recommended;
  assert.ok(expected?.result);
  assert.equal(expected.model.id, "kimi-k3");
  ui.fireEvent.click(taskCheckbox("Предельные мультимодальные задачи"));
  assert.deepEqual(selectedTasks(config), ["search", "contracts", "frontier"]);
  const card = decisionCard();
  assert.notEqual(card.textContent, previous);
  assert.ok(
    ui.within(card).getByRole("heading", { name: expected.model.name }),
  );
  assert.ok(card.textContent?.includes(money(expected.result.buyTco)));
  assert.ok(card.textContent?.includes(money(expected.result.rentTco)));
  assert.equal(ui.within(card).queryByRole("heading", { name: /Llama/ }), null);
  assert.ok(
    card.textContent?.includes(`Горизонт · ${calculationMonths(input)} мес.`),
  );
  const details = document.querySelector<HTMLDetailsElement>(
    "#calculation-details",
  )!;
  assert.equal(
    details.open,
    true,
    "all calculation parameters are visible by default",
  );
  const values = new Map(
    Array.from(details.querySelectorAll("dl > div")).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ]),
  );
  assert.equal(
    values.get("Одновременные запросы в пике"),
    String(input.concurrency),
  );
  assert.equal(
    values.get("Использование оборудования"),
    `${input.hoursMonth} ч/мес.`,
  );
  assert.equal(
    values.get("Учтённый вход запроса"),
    `${input.inputTokens!.toLocaleString("ru-RU")} токенов`,
  );
  assert.equal(
    ui.within(details).queryByRole("spinbutton"),
    null,
    "expanded explanation remains read-only",
  );
  ui.fireEvent.click(taskCheckbox("Предельные мультимодальные задачи"));
  assert.deepEqual(selectedTasks(config), ["search", "contracts"]);
  assert.equal(decisionCard().textContent, previous);
});

test("пустой выбор не выдаёт рекомендацию, выбор всех отмечает все 18 задач", async () => {
  const config = cloneDefaultConfig();
  await renderPage(config);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Снять выбор" }));
  assert.deepEqual(selectedTasks(config), []);
  assert.ok(
    ui.screen.getByRole("heading", { name: "Выберите задачи для сравнения" }),
  );
  assert.equal(document.querySelector("#decision-title"), null);
  assert.equal(ui.screen.queryByText("Рекомендация для выбранных задач"), null);
  assert.equal(
    (
      ui.screen.getByRole("button", {
        name: "Сохранить вариант",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(
    (ui.screen.getByRole("button", { name: "Экспорт" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Выбрать все" }));
  assert.deepEqual(
    selectedTasks(config),
    config.tasks.filter((task) => task.enabled).map((task) => task.id),
  );
  assert.ok(
    ui
      .within(decisionCard())
      .getByRole("heading", { name: "Kimi K3 2.8T-A104B" }),
  );
});

test("переход в Параметры сохраняет выбранные задачи, а явное сохранение меняет расчёт на главной", async () => {
  const config = cloneDefaultConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  globalThis.fetch = async () =>
    Response.json({ configured: false, authenticated: false, role: null });
  ui.render(createElement(RoutedPages));
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Снять выбор" }));
  ui.fireEvent.click(taskCheckbox("Корпоративный поиск и ответы"));
  ui.fireEvent.click(taskCheckbox("Договоры и закупки"));
  const before = decisionCard().textContent;
  const parameters = ui.screen.getByRole("link", { name: "Параметры" });
  assert.equal(parameters.getAttribute("href"), "/settings");
  ui.fireEvent.click(parameters);
  await ui.screen.findByRole("heading", { name: "Параметры" });
  assert.equal(dom.window.location.pathname, "/settings");
  await ui.screen.findByRole("checkbox", { name: "Договоры и закупки" });
  assert.deepEqual(selectedTasks(config), ["search", "contracts"]);
  assert.ok(ui.screen.getByRole("region", { name: "Сценарии использования" }));
  assert.equal(
    config.tasks.filter((task) =>
      ui.screen.queryByRole("checkbox", { name: task.title }),
    ).length,
    18,
  );
  ui.fireEvent.click(taskCheckbox("Предельные мультимодальные задачи"));
  ui.fireEvent.change(
    ui.screen.getByRole("spinbutton", {
      name: "Работа под нагрузкой, ч/мес. (720 — круглосуточно)",
    }),
    { target: { value: "320" } },
  );
  ui.fireEvent.change(
    ui.screen.getByRole("spinbutton", { name: "Срок расчёта, месяцев" }),
    { target: { value: "30" } },
  );
  assert.deepEqual(
    JSON.parse(localStorage.getItem(TASK_SELECTION_KEY)!).taskIds,
    ["search", "contracts"],
    "draft task edits are published only on Save",
  );
  assert.equal(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).revision,
    config.revision,
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  await ui.screen.findByText(/Ревизия \d+ сохранена в этом браузере/);
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppConfig;
  const input = scenarioInput(saved, saved.defaultScenarioId);
  assert.deepEqual(input.taskIds, ["search", "contracts", "frontier"]);
  assert.equal(input.hoursMonth, 320);
  assert.equal(input.months, 30);
  const expected = compareDeployments(saved, input).recommended;
  assert.ok(expected?.result);
  ui.fireEvent.click(
    ui.screen.getByRole("link", { name: "Вернуться к сравнению" }),
  );
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  assert.equal(dom.window.location.pathname, "/");
  assert.deepEqual(selectedTasks(config), ["search", "contracts", "frontier"]);
  const card = decisionCard();
  assert.notEqual(card.textContent, before);
  assert.ok(
    ui.within(card).getByRole("heading", { name: expected.model.name }),
  );
  assert.ok(card.textContent?.includes(money(expected.result.buyTco)));
  assert.ok(card.textContent?.includes(money(expected.result.rentTco)));
  assert.ok(card.textContent?.includes("Горизонт · 30 мес."));
});

test("изменение задач в Параметрах закрывает снимок на главной и сохраняет исходный сценарий неизменным", async () => {
  const captured = cloneDefaultConfig();
  const saved = createScenario(
    "Архивный расчёт двух задач",
    captured,
    {
      ...scenarioInput(captured, captured.defaultScenarioId),
      taskIds: ["search", "summary"],
      hoursMonth: 40,
      years: 1,
      months: 12,
    },
    new Date("2026-09-01T10:00:00Z"),
  );
  const original = JSON.stringify([saved]);
  localStorage.setItem(SCENARIO_STORAGE_KEY, original);
  const current = cloneDefaultConfig();
  const defaults = current.scenarioPresets.find(
    (preset) => preset.id === current.defaultScenarioId,
  )!;
  defaults.input.hoursMonth = 320;
  defaults.input.years = 2;
  defaults.input.months = 24;
  current.gpus.forEach((gpu) => {
    gpu.nodePriceRub *= 2;
    gpu.rentPerGpuHourRub *= 2;
  });
  current.revision += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  globalThis.fetch = async () =>
    Response.json({ configured: false, authenticated: false, role: null });
  ui.render(createElement(RoutedPages));
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить вариант" }),
  );
  ui.fireEvent.click(await ui.screen.findByRole("button", { name: "Открыть" }));
  assert.ok(ui.screen.getByText("Сохранённые параметры и цены"));
  assert.deepEqual(selectedTasks(captured), ["search", "summary"]);
  assert.ok(decisionCard().textContent?.includes("Горизонт · 12 мес."));

  ui.fireEvent.click(ui.screen.getByRole("link", { name: "Параметры" }));
  await ui.screen.findByRole("checkbox", { name: "Пересказы и отчёты" });
  assert.deepEqual(selectedTasks(current), ["search", "summary"]);
  ui.fireEvent.click(taskCheckbox("Пересказы и отчёты"));
  ui.fireEvent.click(taskCheckbox("Договоры и закупки"));
  ui.fireEvent.change(
    ui.screen.getByRole("spinbutton", { name: "Срок расчёта, месяцев" }),
    { target: { value: "24" } },
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "Сохранить изменения" }),
  );
  await ui.screen.findByText(/Ревизия \d+ сохранена в этом браузере/);
  ui.fireEvent.click(
    ui.screen.getByRole("link", { name: "Вернуться к сравнению" }),
  );
  await ui.screen.findByRole("heading", { name: "ИИ для вашего бизнеса" });
  await ui.waitFor(() =>
    assert.deepEqual(selectedTasks(current), ["search", "contracts"]),
  );
  assert.equal(
    Boolean(ui.screen.queryByText("Сохранённые параметры и цены")),
    false,
  );
  assert.equal(
    Boolean(ui.screen.queryByRole("heading", { name: saved.name })),
    false,
  );
  const published = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppConfig;
  const expected = compareDeployments(
    published,
    scenarioInput(published, published.defaultScenarioId),
  ).recommended;
  assert.ok(expected?.result);
  const card = decisionCard();
  assert.ok(card.textContent?.includes("Горизонт · 24 мес."));
  assert.ok(card.textContent?.includes(money(expected.result.buyTco)));
  assert.ok(card.textContent?.includes(money(expected.result.rentTco)));
  assert.equal(
    localStorage.getItem(SCENARIO_STORAGE_KEY),
    original,
    "leaving snapshot mode must not rewrite the saved scenario or its captured prices",
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
  assert.deepEqual(selectedTasks(captured), saved.input.taskIds);
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
  assert.equal(ui.within(row).queryByText("Рекомендация"), null);
  ui.fireEvent.click(chooseButton(unsupported));
  const card = decisionCard();
  assert.ok(ui.within(card).getByText("Вариант требует проверки"));
  assert.equal(
    ui.within(card).queryByText("Рекомендация для выбранных задач"),
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
