"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { CalculationInput, CalculationResult } from "@/lib/calculator";
import type { AppConfig } from "@/lib/config";
import { decisionChartData, type Payback } from "@/lib/decision-charts";

type Props = {
  config: AppConfig;
  input: CalculationInput;
  result: CalculationResult;
};
const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
const shortMoney = (value: number) => {
  const unit =
    Math.abs(value) >= 1e9
      ? 1e9
      : Math.abs(value) >= 1e6
        ? 1e6
        : Math.abs(value) >= 1000
          ? 1000
          : 1;
  return unit === 1
    ? money(value)
    : `${(value / unit).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${unit === 1e9 ? "млрд" : unit === 1e6 ? "млн" : "тыс."} ₽`;
};
const monthNumber = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const BLUE = "#3466db";
const TEAL = "#11998e";

function paybackCopy(payback: Payback, months: number) {
  switch (payback.kind) {
    case "crossing":
      return {
        label: "Точка равных затрат",
        value: `≈ ${monthNumber(payback.month)} мес.`,
        description:
          "Накопленные расходы покупки и аренды сравняются в пределах выбранного срока.",
      };
    case "residual-only":
      return {
        label: "С учётом стоимости оборудования",
        value: `На ${months}-м месяце`,
        description:
          "Покупка догоняет аренду только после вычета остаточной стоимости в конце срока. До этого вычета аренда дешевле.",
      };
    case "already-cheaper":
      return {
        label: "Накопленные расходы",
        value: "Покупка дешевле с начала",
        description:
          "Отдельного срока возврата первоначальной разницы нет: покупка уже не дороже аренды.",
      };
    case "equal":
      return {
        label: "Накопленные расходы",
        value: "Затраты равны",
        description:
          "Покупка и аренда имеют одинаковые накопленные расходы на выбранном сроке.",
      };
    case "rent-overtakes":
      return {
        label: "Аренда становится дешевле",
        value: `≈ ${monthNumber(payback.month)} мес.`,
        description:
          "В этой точке преимущество переходит к аренде. Это не срок окупаемости покупки.",
      };
    case "not-reached":
      return {
        label: "Точка равных затрат",
        value: `Нет за ${months} мес.`,
        description:
          "На выбранном сроке покупка не догоняет аренду по накопленным расходам.",
      };
  }
}

export function DecisionCharts({ config, input, result }: Props) {
  const data = useMemo(
    () => decisionChartData(config, input, result),
    [config, input, result],
  );
  const id = useId().replace(/:/g, "");
  const scope = `${result.model.id}/${result.gpu.id}/${data.months}/${result.buyTco}/${result.rentTco}/${data.composition.residual}`;
  const [selection, setSelection] = useState<{
    scope: string;
    month: number;
  } | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const month =
    selection?.scope === scope
      ? Math.min(data.months, Math.max(0, selection.month))
      : data.months;
  const current = data.points[month];
  const pickMonth = (value: number) =>
    setSelection({
      scope,
      month: Math.min(data.months, Math.max(0, Math.round(value))),
    });
  const width = 620,
    height = 236,
    left = 56,
    right = 18,
    top = 16,
    bottom = 34;
  const x = (value: number) =>
    left + (value / data.months) * (width - left - right);
  const y = (value: number) =>
    top +
    ((data.yMax - value) / (data.yMax - data.yMin)) * (height - top - bottom);
  const line = (points: Array<{ month: number; value: number }>) =>
    points
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(point.month).toFixed(2)},${y(point.value).toFixed(2)}`,
      )
      .join(" ");
  const hoverMonth = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(bounds.width / width, bounds.height / height);
    if (scale > 0) {
      const offset = (bounds.width - width * scale) / 2;
      pickMonth(
        (((event.clientX - bounds.left - offset) / scale - left) /
          (width - left - right)) *
          data.months,
      );
    }
  };
  const keyboardMonth = (event: KeyboardEvent<HTMLInputElement>) => {
    const positions: Record<string, number> = {
      ArrowLeft: month - 1,
      ArrowDown: month - 1,
      ArrowRight: month + 1,
      ArrowUp: month + 1,
      Home: 0,
      End: data.months,
      PageDown: month - 6,
      PageUp: month + 6,
    };
    const next = positions[event.key];
    if (next !== undefined) {
      event.preventDefault();
      pickMonth(next);
    }
  };
  const unit =
    data.yMax >= 1_000_000 ? 1_000_000 : data.yMax >= 1000 ? 1000 : 1;
  const unitLabel =
    unit === 1_000_000 ? "млн ₽" : unit === 1000 ? "тыс. ₽" : "₽";
  const payback = paybackCopy(data.payback, data.months);
  const composition = data.composition;
  const activeSegments = composition.segments.filter(
    (segment) => segment.buy || segment.rent,
  );
  const segment =
    activeSegments.find((item) => item.id === segmentId) ?? activeSegments[0];
  const barWidth = 520;
  const barMaximum = Math.max(1, composition.buyGross, composition.rentGross);
  const barSpan = barMaximum + composition.residual;
  const barX = (value: number) =>
    ((value + composition.residual) / barSpan) * barWidth;
  const zero = barX(0);
  const stacks = (side: "buy" | "rent", rowY: number) => {
    let accumulated = 0;
    return activeSegments.map((item) => {
      const value = item[side];
      const start = accumulated;
      accumulated += value;
      return value > 0 ? (
        <rect
          key={item.id}
          x={barX(start)}
          y={rowY}
          width={barX(accumulated) - barX(start)}
          height={17}
          fill={side === "buy" ? item.buyColor : item.rentColor}
          opacity={segmentId && item.id !== segmentId ? 0.58 : 1}
          onMouseEnter={() => setSegmentId(item.id)}
          onClick={() => setSegmentId(item.id)}
        >
          <title>{`${item.label}: ${money(value)}`}</title>
        </rect>
      ) : null;
    });
  };
  return (
    <section className="decision-charts" aria-label="Графики стоимости">
      <div className="decision-charts__grid">
        <section
          className="decision-charts__card"
          aria-labelledby={`${id}-cash-title`}
        >
          <div className="decision-charts__heading">
            <div>
              <span className="decision-charts__eyebrow">ДЕНЕЖНЫЕ ПОТОКИ</span>
              <h3 id={`${id}-cash-title`}>Стоимость во времени</h3>
            </div>
            <span className="decision-charts__period">
              {data.months} месяцев
            </span>
          </div>
          <div className="decision-charts__legend">
            <span>
              <i className="decision-charts__buy-line" />
              Покупка
            </span>
            <span>
              <i className="decision-charts__rent-line" />
              Аренда
            </span>
            <span className="decision-charts__unit">{unitLabel}</span>
          </div>
          <svg
            className="decision-charts__plot"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={`${id}-cash-title ${id}-cash-desc`}
            onMouseMove={hoverMonth}
            onClick={hoverMonth}
          >
            <desc id={`${id}-cash-desc`}>
              Накопленные расходы от нулевого до {data.months}-го месяца. Синяя
              сплошная линия — покупка, бирюзовая пунктирная — аренда. Точные
              суммы доступны под графиком и через ползунок месяца. Остаточная
              стоимость вычитается только в конце срока.
            </desc>
            {data.yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="#e9eef5"
                />
                <text
                  x={left - 10}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="decision-charts__axis"
                >
                  {(tick / unit).toLocaleString("ru-RU", {
                    maximumFractionDigits: 2,
                  })}
                </text>
              </g>
            ))}
            {data.xTicks.map((tick) => (
              <text
                key={tick}
                x={x(tick)}
                y={height - 10}
                textAnchor="middle"
                className="decision-charts__axis"
              >
                {tick}
              </text>
            ))}
            <text
              x={width - right}
              y={height - 10}
              dy="-14"
              textAnchor="end"
              className="decision-charts__axis"
            >
              месяц
            </text>
            <path
              d={line(data.buyLine)}
              fill="none"
              stroke={BLUE}
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
            <path
              d={line(data.rentLine)}
              fill="none"
              stroke={TEAL}
              strokeWidth="2.8"
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />
            <line
              x1={x(month)}
              x2={x(month)}
              y1={top}
              y2={height - bottom}
              stroke="#a8b5c8"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(month)}
              cy={y(current.buyCumulative)}
              r="4.5"
              fill={BLUE}
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx={x(month)}
              cy={y(current.rentCumulative)}
              r="4.5"
              fill={TEAL}
              stroke="white"
              strokeWidth="2"
            />
          </svg>
          <div className="decision-charts__month-control">
            <label htmlFor={`${id}-month`}>Месяц {month}</label>
            <input
              id={`${id}-month`}
              type="range"
              min={0}
              max={data.months}
              step={1}
              value={month}
              aria-label="Месяц на графике накопленных затрат"
              aria-valuetext={`${month}-й месяц; покупка ${money(current.buyCumulative)}; аренда ${money(current.rentCumulative)}`}
              onChange={(event) => pickMonth(Number(event.target.value))}
              onKeyDown={keyboardMonth}
            />
          </div>
          <dl
            className="decision-charts__readout"
            aria-label={`Расходы на ${month}-м месяце`}
          >
            <div>
              <dt>Покупка</dt>
              <dd className="decision-charts__buy-value">
                {money(current.buyCumulative)}
              </dd>
            </div>
            <div>
              <dt>Аренда</dt>
              <dd className="decision-charts__rent-value">
                {money(current.rentCumulative)}
              </dd>
            </div>
          </dl>
          <div className="decision-charts__payback">
            <div>
              <span>{payback.label}</span>
              <p>{payback.value}</p>
            </div>
            <p>{payback.description}</p>
          </div>
        </section>

        <section
          className="decision-charts__card"
          aria-labelledby={`${id}-cost-title`}
        >
          <div className="decision-charts__heading">
            <div>
              <span className="decision-charts__eyebrow">СОСТАВ РАСХОДОВ</span>
              <h3 id={`${id}-cost-title`}>За что платим</h3>
            </div>
            <span className="decision-charts__period">{data.months} мес.</span>
          </div>
          <svg
            className="decision-charts__composition"
            viewBox={`0 0 ${barWidth} 138`}
            role="img"
            aria-labelledby={`${id}-cost-title ${id}-cost-desc`}
          >
            <desc id={`${id}-cost-desc`}>
              Статьи покупки и аренды на единой шкале. Положительные расходы
              направлены вправо от нуля. Остаточная стоимость показана отдельно
              влево и вычитается из покупки только один раз.
            </desc>
            <defs>
              <pattern
                id={`${id}-residual`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="#ecf0f7" />
                <line
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="6"
                  stroke="#7f91b0"
                  strokeWidth="2"
                />
              </pattern>
            </defs>
            <text x="0" y="17" className="decision-charts__bar-label">
              Покупка до вычета остатка
            </text>
            <text
              x={barWidth}
              y="17"
              textAnchor="end"
              className="decision-charts__bar-total"
            >
              {shortMoney(composition.buyGross)}
            </text>
            <rect
              x={zero}
              y="27"
              width={barWidth - zero}
              height="17"
              rx="3"
              fill="#f1f4f9"
            />
            {stacks("buy", 27)}
            <text x="0" y="62" className="decision-charts__bar-label">
              Аренда
            </text>
            <text
              x={barWidth}
              y="62"
              textAnchor="end"
              className="decision-charts__bar-total"
            >
              {shortMoney(composition.rentGross)}
            </text>
            <rect
              x={zero}
              y="72"
              width={barWidth - zero}
              height="17"
              rx="3"
              fill="#f1f4f9"
            />
            {stacks("rent", 72)}
            <text x="0" y="107" className="decision-charts__bar-label">
              Остаточная стоимость
            </text>
            <text
              x={barWidth}
              y="107"
              textAnchor="end"
              className="decision-charts__bar-total"
            >
              {composition.residual ? "− " : ""}
              {shortMoney(composition.residual)}
            </text>
            {composition.residual > 0 && (
              <rect
                x={barX(-composition.residual)}
                y="117"
                width={zero - barX(-composition.residual)}
                height="12"
                fill={`url(#${id}-residual)`}
              />
            )}
            <line x1={zero} x2={zero} y1="23" y2="132" stroke="#c7d0de" />
          </svg>
          <div className="decision-charts__segments" aria-label="Статьи затрат">
            {activeSegments.map((item) => (
              <button
                key={item.id}
                type="button"
                className={segment?.id === item.id ? "is-active" : ""}
                aria-pressed={segment?.id === item.id}
                onMouseEnter={() => setSegmentId(item.id)}
                onFocus={() => setSegmentId(item.id)}
                onClick={() => setSegmentId(item.id)}
              >
                <i
                  style={{
                    background: item.buy ? item.buyColor : item.rentColor,
                  }}
                />
                {item.label}
              </button>
            ))}
          </div>
          {segment && (
            <div className="decision-charts__segment-detail" aria-live="polite">
              <span>{segment.label}</span>
              <dl>
                <div>
                  <dt>Покупка</dt>
                  <dd>{money(segment.buy)}</dd>
                </div>
                <div>
                  <dt>Аренда</dt>
                  <dd>{money(segment.rent)}</dd>
                </div>
              </dl>
            </div>
          )}
          <div className="decision-charts__net">
            <span>После вычета остаточной стоимости</span>
            <dl>
              <div>
                <dt>Покупка</dt>
                <dd>{money(composition.buyNet)}</dd>
              </div>
              <div>
                <dt>Аренда</dt>
                <dd>{money(composition.rentNet)}</dd>
              </div>
            </dl>
          </div>
          <p className="decision-charts__footnote">
            Остаточная стоимость: {money(composition.residual)} в конце{" "}
            {data.months}-го месяца. Сеть, хранение и эксплуатация включены по
            одному разу в каждый вариант.
          </p>
        </section>
      </div>
    </section>
  );
}
