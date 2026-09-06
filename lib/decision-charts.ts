import {
  cumulativeCashflow,
  type CalculationInput,
  type CalculationResult,
  type CashflowPoint,
} from "./calculator";
import type { AppConfig } from "./config";
import { calculationMonths } from "./horizon";

export type CashflowCrossing = {
  month: number;
  direction: "purchase" | "rent";
  residualOnly: boolean;
};
export type Payback =
  | { kind: "crossing"; month: number }
  | { kind: "residual-only"; month: number }
  | { kind: "rent-overtakes"; month: number }
  | { kind: "already-cheaper" }
  | { kind: "equal" }
  | { kind: "not-reached" };

/** Remove the terminal asset value before finding operating cashflow crossings. */
export function cashflowPayback(
  points: CashflowPoint[],
  residual: number,
): Payback {
  if (!points.length) return { kind: "not-reached" };
  const last = points.at(-1)!;
  const tolerance =
    Math.max(
      1,
      ...points.flatMap((point) => [
        Math.abs(point.buyCumulative),
        Math.abs(point.rentCumulative),
      ]),
      Math.abs(residual),
    ) * 1e-10;
  const difference = (point: CashflowPoint, index: number) =>
    point.buyCumulative +
    (index === points.length - 1 ? residual : 0) -
    point.rentCumulative;
  const beforeResidual = points.map(difference);
  const crossings: CashflowCrossing[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = beforeResidual[index - 1];
    const current = beforeResidual[index];
    if (
      (previous > tolerance && current <= tolerance) ||
      (previous < -tolerance && current >= -tolerance)
    ) {
      const previousMonth = points[index - 1].month;
      const fraction = Math.max(
        0,
        Math.min(1, previous / (previous - current)),
      );
      crossings.push({
        month: previousMonth + (points[index].month - previousMonth) * fraction,
        direction: previous > 0 ? "purchase" : "rent",
        residualOnly: false,
      });
    }
  }
  const terminalDifference = last.buyCumulative - last.rentCumulative;
  if (
    residual > tolerance &&
    beforeResidual.at(-1)! > tolerance &&
    terminalDifference <= tolerance
  ) {
    crossings.push({
      month: last.month,
      direction: "purchase",
      residualOnly: true,
    });
  }
  const purchase = crossings.find(
    (crossing) => crossing.direction === "purchase",
  );
  if (purchase)
    return {
      kind: purchase.residualOnly ? "residual-only" : "crossing",
      month: purchase.month,
    };
  const rent = crossings.find((crossing) => crossing.direction === "rent");
  if (rent) return { kind: "rent-overtakes", month: rent.month };
  if (
    beforeResidual.every((value) => Math.abs(value) <= tolerance) &&
    Math.abs(terminalDifference) <= tolerance
  )
    return { kind: "equal" };
  if (
    beforeResidual.every((value) => value <= tolerance) &&
    terminalDifference <= tolerance
  )
    return { kind: "already-cheaper" };
  return { kind: "not-reached" };
}

export type CostSegment = {
  id: string;
  label: string;
  buy: number;
  rent: number;
  buyColor: string;
  rentColor: string;
};

export function costComposition(result: CalculationResult) {
  const { buy, rent } = result;
  const segments: CostSegment[] = [
    {
      id: "equipment",
      label: "Оборудование",
      buy: buy.equipment,
      rent: 0,
      buyColor: "#3466db",
      rentColor: "#11998e",
    },
    {
      id: "setup",
      label: "Ввод и резерв бюджета",
      buy: buy.fitout + buy.contingency,
      rent: 0,
      buyColor: "#668ce7",
      rentColor: "#39aaa0",
    },
    {
      id: "support",
      label: "Поддержка",
      buy: buy.support,
      rent: 0,
      buyColor: "#8da9ef",
      rentColor: "#59b9b0",
    },
    {
      id: "energy",
      label: "Электроэнергия",
      buy: buy.electricity,
      rent: 0,
      buyColor: "#abc0f3",
      rentColor: "#72c6be",
    },
    {
      id: "site",
      label: "Размещение",
      buy: buy.placement,
      rent: 0,
      buyColor: "#c3d0ee",
      rentColor: "#8fd3cd",
    },
    {
      id: "compute",
      label: "Рабочая аренда",
      buy: 0,
      rent: rent.compute,
      buyColor: "#3466db",
      rentColor: "#11998e",
    },
    {
      id: "reserve",
      label: "Резервная аренда",
      buy: 0,
      rent: rent.reserve,
      buyColor: "#668ce7",
      rentColor: "#50b6ad",
    },
    {
      id: "service",
      label: "Сервис аренды",
      buy: 0,
      rent: rent.service,
      buyColor: "#8da9ef",
      rentColor: "#8fd3cd",
    },
    {
      id: "common",
      label: "Сеть, хранение и эксплуатация",
      buy: buy.networkStorage + buy.operations,
      rent: rent.networkStorage + rent.operations,
      buyColor: "#a0afc9",
      rentColor: "#91bdb9",
    },
  ];
  return {
    segments,
    buyGross: segments.reduce((sum, segment) => sum + segment.buy, 0),
    rentGross: segments.reduce((sum, segment) => sum + segment.rent, 0),
    residual: buy.residual,
    buyNet: result.buyTco,
    rentNet: result.rentTco,
  };
}

export function decisionChartData(
  config: AppConfig,
  input: CalculationInput,
  result: CalculationResult,
) {
  const months = calculationMonths(input);
  const calculated = cumulativeCashflow(config, input, result);
  // Hero totals are authoritative at the endpoint; eliminate sub-kopeck floating-point drift.
  const points = calculated.map((point) =>
    point.month === months
      ? {
          ...point,
          buyCumulative: result.buyTco,
          rentCumulative: result.rentTco,
        }
      : point,
  );
  const composition = costComposition(result);
  const buyLine = points.map((point) => ({
    month: point.month,
    value: point.buyCumulative,
  }));
  if (composition.residual > 0 && buyLine.length)
    buyLine.splice(buyLine.length - 1, 0, {
      month: months,
      value: result.buyTco + composition.residual,
    });
  const rentLine = points.map((point) => ({
    month: point.month,
    value: point.rentCumulative,
  }));
  const allValues = [...buyLine, ...rentLine].map((point) => point.value);
  const minimum = Math.min(0, ...allValues);
  const maximum = Math.max(1, ...allValues);
  const rawStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10].find(
      (multiplier) => multiplier * magnitude >= rawStep,
    )! * magnitude;
  const yMin = Math.floor(minimum / step) * step;
  const yMax = Math.ceil(maximum / step) * step;
  const yTicks = Array.from(
    { length: Math.round((yMax - yMin) / step) + 1 },
    (_, index) => yMin + index * step,
  );
  const xTicks = [
    ...new Set([
      0,
      Math.round(months / 4),
      Math.round(months / 2),
      Math.round((months * 3) / 4),
      months,
    ]),
  ];
  return {
    months,
    points,
    buyLine,
    rentLine,
    composition,
    payback: cashflowPayback(points, composition.residual),
    yMin,
    yMax,
    yTicks,
    xTicks,
  };
}
