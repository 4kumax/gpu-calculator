import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import {
  calculate,
  type CalculationInput,
  type CashflowPoint,
} from "./calculator";
import { cloneDefaultConfig } from "./config";
import { defaultInput } from "./scenarios";
import {
  cashflowPayback,
  costComposition,
  decisionChartData,
} from "./decision-charts";

let dom: JSDOM;
let ui: typeof import("@testing-library/react");
let DecisionCharts: typeof import("../components/decision-charts").DecisionCharts;
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
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  ui = await import("@testing-library/react");
  ({ DecisionCharts } = await import("../components/decision-charts"));
});
afterEach(() => ui.cleanup());
after(() => dom.window.close());

function fixture(months = 36) {
  const config = cloneDefaultConfig();
  const input: CalculationInput = {
    ...defaultInput(config),
    taskIds: ["frontier"],
    modelId: "kimi-k3",
    gpuId: "gb300",
    years: 1,
    months,
    asOf: "2026-09-07",
  };
  return { config, input, result: calculate(config, input) };
}
const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
const points = (
  months: number,
  buy: (month: number) => number,
  rent: (month: number) => number,
): CashflowPoint[] =>
  Array.from({ length: months + 1 }, (_, month) => ({
    month,
    buyCumulative: buy(month),
    rentCumulative: rent(month),
  }));

test("chart periods use authoritative months and end at the exact hero totals", () => {
  for (const months of [1, 18, 30, 36, 120]) {
    const { config, input, result } = fixture(months);
    const data = decisionChartData(config, input, result);
    assert.equal(data.months, months);
    assert.equal(data.points.length, months + 1);
    assert.deepEqual(data.points.at(-1), {
      month: months,
      buyCumulative: result.buyTco,
      rentCumulative: result.rentTco,
    });
    assert.equal(
      data.points[0].buyCumulative,
      result.buy.equipment + result.buy.fitout + result.buy.contingency,
    );
    assert.equal(data.points[0].rentCumulative, 0);
    assert.equal(data.xTicks[0], 0);
    assert.equal(data.xTicks.at(-1), months);
    assert.ok(
      data.yMin <= Math.min(...data.buyLine.map((point) => point.value)),
    );
    assert.ok(
      data.yMax >=
        Math.max(
          ...data.buyLine.map((point) => point.value),
          ...data.rentLine.map((point) => point.value),
        ),
    );
  }
});

test("an all-zero budget has a finite scale and equal cashflows without a false payback month", () => {
  const { config, input } = fixture(18);
  config.gpus.forEach((gpu) => {
    gpu.nodePriceRub = 0;
    gpu.rentPerGpuHourRub = 0;
  });
  config.assumptions.electricityRubKwh = 0;
  config.assumptions.rackMonthPerNodeRub = 0;
  config.assumptions.networkStorageMonthRub = 0;
  config.assumptions.operationsMonthRub = 0;
  const result = calculate(config, input);
  result.breakEvenHoursMonth = 123;
  const data = decisionChartData(config, input, result);
  assert.equal(result.buyTco, 0);
  assert.equal(result.rentTco, 0);
  assert.deepEqual(data.payback, { kind: "equal" });
  assert.ok(
    Number.isFinite(data.yMin) &&
      Number.isFinite(data.yMax) &&
      data.yMax > data.yMin,
  );
  assert.ok(data.yTicks.every(Number.isFinite));
  assert.equal(data.composition.buyGross, 0);
  assert.equal(data.composition.rentGross, 0);
});

test("payback comes from cashflow intersection, including no-crossing and opposite direction", () => {
  const crossing = cashflowPayback(
    points(
      18,
      (month) => 125 + 20 * month,
      (month) => 50 * month,
    ),
    0,
  );
  assert.equal(crossing.kind, "crossing");
  assert.ok("month" in crossing && Math.abs(crossing.month - 125 / 30) < 1e-10);
  assert.deepEqual(
    cashflowPayback(
      points(
        3,
        (month) => 125 + 20 * month,
        (month) => 50 * month,
      ),
      0,
    ),
    { kind: "not-reached" },
  );
  assert.deepEqual(
    cashflowPayback(
      points(
        6,
        (month) => 100 * month,
        (month) => 100 + 50 * month,
      ),
      0,
    ),
    { kind: "rent-overtakes", month: 2 },
  );
  assert.deepEqual(
    cashflowPayback(
      points(
        6,
        (month) => 10 * month,
        (month) => 20 * month,
      ),
      0,
    ),
    { kind: "already-cheaper" },
  );
  assert.deepEqual(
    cashflowPayback(
      points(
        6,
        (month) => 10 * month,
        (month) => 10 * month,
      ),
      0,
    ),
    { kind: "equal" },
  );
});

test("terminal residual is a separate deduction and cannot create a fictional earlier payback", () => {
  assert.deepEqual(
    cashflowPayback(
      points(
        2,
        (month) => 100 + 10 * month - (month === 2 ? 50 : 0),
        (month) => 40 * month,
      ),
      50,
    ),
    { kind: "residual-only", month: 2 },
  );
  const { config, input } = fixture(18);
  config.assumptions.residualValuePct = 35;
  const result = calculate(config, input);
  const composition = costComposition(result);
  assert.ok(
    Math.abs(composition.buyGross - composition.residual - result.buyTco) <
      0.01,
  );
  assert.ok(Math.abs(composition.rentGross - result.rentTco) < 0.01);
  assert.equal(
    composition.segments.find((segment) => segment.id === "common")!.buy,
    result.buy.networkStorage + result.buy.operations,
  );
  assert.equal(
    composition.segments.find((segment) => segment.id === "common")!.rent,
    result.rent.networkStorage + result.rent.operations,
  );
  assert.equal(
    composition.segments.reduce((sum, segment) => sum + segment.buy, 0),
    composition.buyGross,
  );
  const data = decisionChartData(config, input, result);
  assert.deepEqual(data.buyLine.slice(-2), [
    { month: 18, value: result.buyTco + result.buy.residual },
    { month: 18, value: result.buyTco },
  ]);
  assert.equal(data.buyLine.length, data.points.length + 1);
  assert.equal(data.rentLine.length, data.points.length);
});

test("the month slider, keyboard and plot hover expose exact cashflows and reset for a new period", () => {
  const props = fixture(36);
  const data = decisionChartData(props.config, props.input, props.result);
  const rendered = ui.render(createElement(DecisionCharts, props));
  const slider = ui.screen.getByRole("slider", {
    name: "Месяц на графике накопленных затрат",
  }) as HTMLInputElement;
  const readout = () =>
    Array.from(document.querySelectorAll(".decision-charts__readout dd")).map(
      (item) => item.textContent,
    );
  assert.equal(slider.value, "36");
  assert.deepEqual(readout(), [
    money(props.result.buyTco),
    money(props.result.rentTco),
  ]);
  ui.fireEvent.keyDown(slider, { key: "Home" });
  assert.equal(slider.value, "0");
  assert.deepEqual(readout(), [money(data.points[0].buyCumulative), money(0)]);
  ui.fireEvent.keyDown(slider, { key: "ArrowRight" });
  assert.equal(slider.value, "1");
  ui.fireEvent.change(slider, { target: { value: "18" } });
  assert.deepEqual(readout(), [
    money(data.points[18].buyCumulative),
    money(data.points[18].rentCumulative),
  ]);
  const svg = ui.screen.getByRole("img", { name: /Стоимость во времени/ });
  svg.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 620,
    bottom: 236,
    width: 620,
    height: 236,
    toJSON: () => ({}),
  });
  ui.fireEvent.mouseMove(svg, { clientX: 56 + ((620 - 56 - 18) * 9) / 36 });
  assert.equal(slider.value, "9");
  assert.deepEqual(readout(), [
    money(data.points[9].buyCumulative),
    money(data.points[9].rentCumulative),
  ]);
  ui.fireEvent.click(svg, { clientX: 620 });
  assert.equal(slider.value, "36");
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Поддержка" }));
  assert.equal(
    document.querySelector(".decision-charts__segment-detail dd")?.textContent,
    money(props.result.buy.support),
  );
  rendered.rerender(createElement(DecisionCharts, fixture(18)));
  assert.equal(slider.max, "18");
  assert.equal(slider.value, "18");
});
