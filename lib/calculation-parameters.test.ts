import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CalculationParameters } from "../components/calculation-parameters";
import {
  calculate,
  HOURS_PER_MONTH,
  type CalculationInput,
  type CalculationResult,
} from "./calculator";
import { cloneDefaultConfig, type AppConfig } from "./config";
import { defaultInput } from "./scenarios";

const documents: JSDOM[] = [];
afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
});
function render(
  config: AppConfig,
  input: CalculationInput,
  result: CalculationResult,
) {
  const dom = new JSDOM(
    renderToStaticMarkup(
      createElement(CalculationParameters, { config, input, result }),
    ),
  );
  documents.push(dom);
  return dom.window.document;
}
function parameter(document: Document, label: string): string {
  const term = Array.from(document.querySelectorAll("dt")).find(
    (item) => item.textContent === label,
  );
  assert.ok(term, `The parameter '${label}' is visible by name`);
  return term.nextElementSibling!.textContent!;
}
function amount(text: string): number {
  return Number(text.replace(/[^\d,.-]/g, "").replace(",", "."));
}
const n = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 9 });

test("all visible parameters distinguish dedicated billing, active workload, total MoE weights and exact cost components", () => {
  const config = cloneDefaultConfig();
  const input: CalculationInput = {
    ...defaultInput(config),
    taskIds: ["frontier"],
    modelId: "kimi-k3",
    gpuId: "gb300",
    years: 1,
    months: 12,
    hoursMonth: 160,
    rentalMode: "dedicated-node",
    asOf: "2026-09-06",
  };
  const result = calculate(config, input);
  const document = render(config, input, result);
  assert.equal(
    document.querySelectorAll("details, [hidden], strong, b").length,
    0,
  );
  assert.equal(parameter(document, "Использование оборудования"), "160 ч/мес.");
  assert.equal(
    parameter(document, "База полного месяца"),
    `${HOURS_PER_MONTH} часов`,
  );
  assert.equal(
    parameter(document, "Оплачиваемое рабочее время аренды"),
    `${HOURS_PER_MONTH} ч/мес.`,
  );
  assert.equal(
    parameter(document, "Рабочая аренда за весь срок"),
    `${n(8 * HOURS_PER_MONTH * 12)} GPU-часов`,
  );
  assert.equal(parameter(document, "Все параметры модели"), "2 800 млрд");
  assert.equal(parameter(document, "Активные параметры на токен"), "104 млрд");
  assert.equal(
    parameter(document, "Размер чекпоинта на экземпляр"),
    `${n(1560.860324864)} ГБ`,
  );
  assert.equal(parameter(document, "Рабочие GPU"), "8");
  assert.equal(parameter(document, "GPU к покупке"), "8");
  assert.equal(parameter(document, "Серверов к покупке"), "2");
  assert.equal(parameter(document, "Цена целого сервера"), "45 000 000 ₽");
  assert.equal(parameter(document, "Тариф одного GPU-часа"), "1 350 ₽");
  assert.equal(
    parameter(document, "Требуемый максимальный контекст"),
    "1 000 000 токенов",
  );
  assert.match(
    parameter(document, "Требуемые возможности"),
    /изображения.*агенты.*длинный контекст/,
  );
  for (const title of ["Покупка и владение", "Аренда и обслуживание"]) {
    const table = Array.from(document.querySelectorAll("table")).find(
      (item) => item.caption?.textContent === title,
    )!;
    assert.ok(table);
    const sumCents = Array.from(table.querySelectorAll("tbody td")).reduce(
      (sum, cell) => sum + Math.round(amount(cell.textContent!) * 100),
      0,
    );
    const total = amount(table.querySelector("tfoot td")!.textContent!);
    assert.equal(
      sumCents,
      Math.round(total * 100),
      `${title}: every rendered component sums to the shown total`,
    );
    assert.equal(
      Math.round(total * 100),
      Math.round(
        (title === "Покупка и владение" ? result.buyTco : result.rentTco) * 100,
      ),
    );
  }
});

test("hourly billing and always-on reserve are explicit, defaults do not replace the entered workload", () => {
  const config = cloneDefaultConfig();
  config.assumptions.defaultInputTokens = 6144;
  config.assumptions.defaultOutputTokens = 1536;
  config.assumptions.residualValuePct = 20;
  const input: CalculationInput = {
    ...defaultInput(config),
    taskIds: ["frontier"],
    modelId: "kimi-k3",
    gpuId: "gb300",
    years: 2,
    months: 24,
    hoursMonth: 120,
    concurrency: 6,
    largeModelSharePct: 50,
    inputTokens: 0,
    outputTokens: undefined,
    reserveMode: "nplus1",
    rentalMode: "gpu-hour",
    reserveRentalMode: "always-on",
    targetTtftMs: 2500,
    minTokensPerSecond: 15,
    asOf: "2026-09-06",
  };
  const result = calculate(config, input);
  const document = render(config, input, result);
  assert.equal(
    parameter(document, "Оплачиваемое рабочее время аренды"),
    "120 ч/мес.",
  );
  assert.equal(
    parameter(document, "Оплачиваемое время резерва"),
    `${HOURS_PER_MONTH} ч/мес.`,
  );
  assert.equal(
    parameter(document, "Резервная аренда за весь срок"),
    `${n(4 * HOURS_PER_MONTH * 24)} GPU-часов`,
  );
  assert.equal(parameter(document, "Учтённые одновременные запросы"), "3");
  assert.equal(parameter(document, "Учтённый вход запроса"), "6 144 токенов");
  assert.equal(parameter(document, "Учтённый ответ"), "1 536 токенов");
  assert.equal(
    parameter(document, "Требование к первому токену (TTFT)"),
    "Не более 2 500 мс",
  );
  assert.equal(
    parameter(document, "Требование к скорости ответа"),
    "Не менее 15 токенов/с на запрос",
  );
  assert.equal(
    parameter(document, "Остаточная стоимость в конце срока"),
    "20% от оборудования",
  );
  const residual = Array.from(document.querySelectorAll("tbody tr")).find(
    (row) =>
      row.querySelector("th")?.textContent === "Вычет остаточной стоимости",
  )!;
  assert.equal(
    amount(residual.querySelector("td")!.textContent!),
    -result.buy.residual,
  );
  assert.equal(
    parameter(document, "Пригодность выбранной связки"),
    "Требования не подтверждены",
  );
  assert.match(document.body.textContent!, /Целевой TTFT не подтверждён/);
});

test("measurement envelopes and separate purchase/rental provenance retain their dates and commercial terms", () => {
  const config = cloneDefaultConfig();
  const gpu = config.gpus.find((item) => item.id === "gb300")!;
  gpu.purchaseQuote = {
    kind: "Коммерческая оценка",
    sourceLabel: "Предложение на сервер",
    sourceUrl: "https://supplier.example/buy",
    sourceDate: "2026-09-05",
    terms: "Цена с НДС; доставка отдельно.",
  };
  gpu.rentalQuote = {
    kind: "Публичная цена",
    sourceLabel: "Тариф связанной конфигурации",
    sourceUrl: "https://supplier.example/rent",
    sourceDate: "2026-09-04",
    terms: "Оплата полного узла; минимальный срок один месяц.",
  };
  const input: CalculationInput = {
    ...defaultInput(config),
    taskIds: ["frontier"],
    modelId: "kimi-k3",
    gpuId: "gb300",
    asOf: "2026-09-06",
  };
  const result = calculate(config, input);
  result.profile = {
    ...result.profile,
    status: "measured",
    benchmark: {
      inputTokens: 8192,
      outputTokens: 1024,
      concurrency: 8,
      ttftMs: 1200,
      tokensPerSecond: 42,
    },
  };
  const document = render(config, input, result);
  assert.equal(parameter(document, "Измерение: вход"), "8 192 токенов");
  assert.equal(parameter(document, "Измерение: одновременные запросы"), "8");
  assert.equal(parameter(document, "Измерение: первый токен"), "1 200 мс");
  assert.equal(
    parameter(document, "Измерение: скорость ответа на запрос"),
    "42 токенов/с",
  );
  assert.equal(parameter(document, "Дата расчёта (UTC)"), input.asOf);
  assert.equal(
    parameter(document, "Статус этого расчёта"),
    "Плановая оценка",
    "a benchmark alone must not upgrade the result confidence",
  );
  const purchase = document.querySelector(
    'section[aria-label="Источник цены покупки"]',
  )!;
  const rental = document.querySelector(
    'section[aria-label="Источник тарифа аренды"]',
  )!;
  assert.match(purchase.textContent!, /2026-09-05/);
  assert.match(purchase.textContent!, /Цена с НДС; доставка отдельно/);
  assert.equal(
    purchase.querySelector("a")!.getAttribute("href"),
    gpu.purchaseQuote.sourceUrl,
  );
  assert.match(rental.textContent!, /2026-09-04/);
  assert.match(rental.textContent!, /минимальный срок один месяц/);
  assert.equal(
    rental.querySelector("a")!.getAttribute("href"),
    gpu.rentalQuote.sourceUrl,
  );
});

test("unknown H20 memory bandwidth is displayed as missing evidence rather than zero throughput", () => {
  const config = cloneDefaultConfig();
  const input: CalculationInput = {
    ...defaultInput(config),
    taskIds: ["search"],
    gpuId: "h20",
  };
  const result = calculate(config, input);
  assert.equal(result.gpu.id, "h20");
  assert.equal(result.gpu.memoryBandwidthTb, 0);
  const document = render(config, input, result);
  assert.equal(
    parameter(document, "Пропускная способность памяти GPU"),
    "Нет подтверждённых данных",
  );
  assert.match(
    document.body.textContent!,
    /Пропускная способность памяти приведена справочно/,
  );
});
