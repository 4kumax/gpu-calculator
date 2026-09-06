"use client";

import { calculationMonths } from "@/lib/horizon";
import { useMemo } from "react";
import {
  calculateSensitivity,
  compactRub,
  formatRub,
  type CalculationInput,
  type CalculationResult,
} from "@/lib/calculator";
import { type AppConfig } from "@/lib/config";

const buyLabels: Record<string, string> = {
  equipment: "Оборудование",
  fitout: "Ввод в эксплуатацию",
  contingency: "Резерв бюджета",
  support: "Поддержка",
  electricity: "Электроэнергия",
  placement: "Размещение",
  networkStorage: "Сеть и хранилище",
  operations: "Эксплуатация",
  residual: "Остаточная стоимость",
};
const rentLabels: Record<string, string> = {
  compute: "Рабочие GPU / узлы",
  reserve: "Резервный узел",
  service: "Сервисная надбавка",
  networkStorage: "Сеть и хранилище",
  operations: "Эксплуатация",
};

export function CostAnalysis({
  config,
  input,
  result,
}: {
  config: AppConfig;
  input: CalculationInput;
  result: CalculationResult;
}) {
  const analysis = useMemo(
    () => calculateSensitivity(config, input, result),
    [config, input, result],
  );
  const points = analysis.cashflow;
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.buyCumulative, point.rentCumulative]),
  );
  const months = calculationMonths(input);
  const x = (month: number) => 55 + (month / months) * 510;
  const y = (value: number) => 218 - (value / max) * 190;
  const selectedPoints = points.filter(
    (point) =>
      point.month === 0 || point.month % 12 === 0 || point.month === months,
  );
  const axis = [0, max / 2, max];
  return (
    <div className="stack">
      <div className="panel panel-body">
        <h3>Чувствительность к ценам и загрузке</h3>
        <p className="help-text">
          Сравнивается текущая конфигурация. Условия каждого сценария указаны в
          таблице; автоматический подбор здесь не меняет оборудование.
        </p>
        <div className="table-scroll">
          <table className="comparison-table">
            <caption className="sr-only">
              Изменение TCO при других ценах и загрузке
            </caption>
            <thead>
              <tr>
                <th>Сценарий</th>
                <th>Условия</th>
                <th>Покупка</th>
                <th>Аренда</th>
                <th>Дешевле</th>
              </tr>
            </thead>
            <tbody>
              {analysis.scenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <th scope="row">{scenario.label}</th>
                  <td>
                    {scenario.hoursMonth} ч/мес.
                    <br />
                    Цена покупки ×{scenario.purchaseMultiplier.toFixed(2)}
                    <br />
                    Аренда ×{scenario.rentalMultiplier.toFixed(2)}
                  </td>
                  <td>{compactRub(scenario.buyTco)}</td>
                  <td>{compactRub(scenario.rentTco)}</td>
                  <td>
                    {Math.abs(scenario.buyTco - scenario.rentTco) < 1
                      ? "Равны"
                      : scenario.decision === "buy"
                        ? "Покупка"
                        : "Аренда"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel panel-body">
        <h3>Накопленные затраты</h3>
        <div className="chart-legend">
          <span>
            <i className="buy-dot" />
            Покупка и владение
          </span>
          <span>
            <i className="rent-dot" />
            Аренда
          </span>
        </div>
        <svg
          className="cashflow-chart"
          viewBox="0 0 600 260"
          role="img"
          aria-labelledby="cashflow-title cashflow-desc"
        >
          <title id="cashflow-title">
            Накопленные затраты на {months} месяцев
          </title>
          <desc id="cashflow-desc">
            Покупка {formatRub(result.buyTco)}, аренда{" "}
            {formatRub(result.rentTco)}. Численные значения доступны в таблице
            под графиком.
          </desc>
          {axis.map((value) => (
            <g key={value}>
              <line
                x1="55"
                y1={y(value)}
                x2="565"
                y2={y(value)}
                stroke="#dce5e9"
              />
              <text
                x="48"
                y={y(value) + 4}
                textAnchor="end"
                fill="#657783"
                fontSize="10"
              >
                {(value / 1e6).toFixed(1)}
              </text>
            </g>
          ))}
          <text x="55" y="14" fill="#657783" fontSize="10">
            млн ₽
          </text>
          <polyline
            points={points
              .map((point) => `${x(point.month)},${y(point.buyCumulative)}`)
              .join(" ")}
            fill="none"
            stroke="#648f2c"
            strokeWidth="3"
          />
          <polyline
            points={points
              .map((point) => `${x(point.month)},${y(point.rentCumulative)}`)
              .join(" ")}
            fill="none"
            stroke="#0d6f9c"
            strokeWidth="3"
            strokeDasharray="7 4"
          />
          {selectedPoints.map((point) => (
            <text
              key={point.month}
              x={x(point.month)}
              y="241"
              textAnchor="middle"
              fill="#657783"
              fontSize="11"
            >
              {point.month} мес.
            </text>
          ))}
        </svg>
        <p className="help-text">
          Покупка включает начальные вложения в момент 0. Остаточная стоимость
          вычитается в конце выбранного горизонта. Дисконтирование не
          применяется.
        </p>
        <details>
          <summary>Значения по годам</summary>
          <div className="table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th>Покупка</th>
                  <th>Аренда</th>
                </tr>
              </thead>
              <tbody>
                {selectedPoints.map((point) => (
                  <tr key={point.month}>
                    <th scope="row">{point.month}</th>
                    <td>{formatRub(point.buyCumulative)}</td>
                    <td>{formatRub(point.rentCumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <div className="panel panel-body">
        <h3>Состав TCO за {months} месяцев</h3>
        <div className="cost-breakdowns">
          <div>
            <h4>Покупка</h4>
            <dl className="breakdown-list">
              {Object.entries(result.buy)
                .filter(([key]) => key !== "total")
                .map(([key, value]) => (
                  <div className="breakdown-row" key={key}>
                    <dt>{buyLabels[key] ?? key}</dt>
                    <dd>
                      {key === "residual" && value > 0 ? "− " : ""}
                      {formatRub(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
          <div>
            <h4>Аренда</h4>
            <dl className="breakdown-list">
              {Object.entries(result.rent)
                .filter(([key]) => key !== "total")
                .map(([key, value]) => (
                  <div className="breakdown-row" key={key}>
                    <dt>{rentLabels[key] ?? key}</dt>
                    <dd>{formatRub(value)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
