"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { compactRub, formatRub, type CalculationInput } from "@/lib/calculator";
import type { AppConfig } from "@/lib/config";
import type { ComparisonRow, DeploymentComparison } from "@/lib/comparison";
import { CostAnalysis } from "@/components/cost-analysis";

const money = (value: number) => compactRub(value).replace(/\.([0-9])/g, ",$1");

export function ExecutiveComparison({
  config,
  input,
  comparison,
  selected,
  onSelect,
}: {
  config: AppConfig;
  input: CalculationInput;
  comparison: DeploymentComparison;
  selected: ComparisonRow | null;
  onSelect: (row: ComparisonRow) => void;
}) {
  const [tab, setTab] = useState<"models" | "gpus">("models");
  const [modelId, setModelId] = useState("");
  const [sort, setSort] = useState<"buy" | "rent">("buy");
  const [showAll, setShowAll] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [rowDetail, setRowDetail] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const result = selected?.result;
  const months = input.years * 12;
  const activeModelId = config.models.some(
    (model) => model.id === modelId && model.enabled,
  )
    ? modelId
    : (selected?.model.id ??
      config.models.find((model) => model.enabled)?.id ??
      "");
  const candidates =
    tab === "models"
      ? comparison.modelRows
      : comparison.rows.filter((row) => row.model.id === activeModelId);
  const ordered = [...candidates].sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      (a.result
        ? sort === "buy"
          ? a.result.buyTco
          : a.result.rentTco
        : Infinity) -
        (b.result
          ? sort === "buy"
            ? b.result.buyTco
            : b.result.rentTco
          : Infinity),
  );
  const supported = ordered.filter((row) => row.eligible);
  const shortlist = (supported.length ? supported : ordered).slice(0, 5);
  for (const important of [comparison.recommended, selected]) {
    if (
      important &&
      candidates.some((row) => row.id === important.id) &&
      !shortlist.some((row) => row.id === important.id)
    ) {
      shortlist.pop();
      shortlist.unshift(important);
    }
  }
  const visible = showAll || tab === "gpus" ? ordered : shortlist;
  const recommended = selected?.id === comparison.recommended?.id;
  const difference = result ? Math.abs(result.buyTco - result.rentTco) : 0;

  return (
    <div className="executive-results">
      {result && selected ? (
        <section className="decision-card" aria-labelledby="decision-title">
          <div className="decision-heading">
            <div>
              <span
                className={`decision-label ${!selected.eligible ? "needs-review" : ""}`}
              >
                {recommended ? <Check size={14} /> : <ArrowUpRight size={14} />}
                {recommended
                  ? "Оптимальный вариант по сценарию"
                  : selected.eligible
                    ? "Выбранный вариант"
                    : "Вариант требует проверки"}
              </span>
              <h2 id="decision-title">{result.model.name}</h2>
              <p className="decision-hardware">
                {result.gpuCount} × {result.gpu.name}
                <span>
                  {" "}
                  · К покупке {result.purchasedGpuCount} GPU, {result.nodes}{" "}
                  {result.nodes === 1
                    ? "сервер"
                    : result.nodes < 5
                      ? "сервера"
                      : "серверов"}{" "}
                  {result.plan.reserveNodes ? ", включая резерв" : ""}
                </span>
              </p>
            </div>
            <span className="horizon-label">Горизонт · {months} мес.</span>
          </div>
          <div className="decision-metrics">
            <div className={result.decision === "buy" ? "preferred" : ""}>
              <span>Покупка и владение</span>
              <strong>{money(result.buyTco)}</strong>
              <small>Все расходы за {months} месяцев</small>
            </div>
            <div className={result.decision === "rent" ? "preferred" : ""}>
              <span>Аренда и обслуживание</span>
              <strong>{money(result.rentTco)}</strong>
              <small>{money(result.rentMonthly)} в месяц</small>
            </div>
            <div className="decision-saving">
              <span>
                {difference < 1
                  ? "Затраты равны"
                  : result.decision === "buy"
                    ? "Экономия при покупке"
                    : "Экономия при аренде"}
              </span>
              <strong>{difference < 1 ? "—" : money(difference)}</strong>
              <small>
                {difference < 1
                  ? "При заданных условиях"
                  : `${Math.round((difference / Math.max(result.buyTco, result.rentTco)) * 100)}% за весь срок`}
              </small>
            </div>
          </div>
          <div className="decision-footnote">
            <span className="evidence-dot" />
            <span>
              {!selected.eligible
                ? "Совместимость или требования сценария не подтверждены."
                : selected.status === "measured"
                  ? "Производительность подтверждена для указанной нагрузки."
                  : "Плановая оценка. Перед закупкой требуется проверка на вашей нагрузке."}
            </span>
            <a
              href="#calculation-details"
              onClick={() => {
                if (detailsRef.current) detailsRef.current.open = true;
              }}
            >
              Основания расчёта <ArrowUpRight size={12} />
            </a>
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <h2>Подходящий вариант пока не найден</h2>
          <p>Сравните ограничения ниже или измените сценарий в параметрах.</p>
        </div>
      )}

      <section className="options-card" aria-labelledby="options-title">
        <div className="options-heading">
          <div>
            <h2 id="options-title">Сравнение вариантов</h2>
            <p>Покупка и аренда на одном горизонте — {months} месяцев.</p>
          </div>
          <div
            className="segment-control"
            role="group"
            aria-label="Тип сравнения"
          >
            <button
              aria-pressed={tab === "models"}
              onClick={() => {
                setTab("models");
                setRowDetail(null);
              }}
            >
              Модели
            </button>
            <button
              aria-pressed={tab === "gpus"}
              onClick={() => {
                setTab("gpus");
                setModelId(selected?.model.id ?? "");
                setRowDetail(null);
              }}
            >
              GPU
            </button>
          </div>
        </div>
        <div className="comparison-toolbar">
          {tab === "gpus" ? (
            <label className="inline-select">
              <span>Модель</span>
              <select
                aria-label="Модель для сравнения GPU"
                value={activeModelId}
                onChange={(event) => {
                  setModelId(event.target.value);
                  setRowDetail(null);
                }}
              >
                {config.models
                  .filter((model) => model.enabled)
                  .map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <span>Для каждой модели — подходящая конфигурация GPU</span>
          )}
          <label className="inline-select sort-select">
            <ArrowDown size={13} />
            <select
              aria-label="Сортировка вариантов"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as "buy" | "rent")
              }
            >
              <option value="buy">Дешевле покупка</option>
              <option value="rent">Дешевле аренда</option>
            </select>
          </label>
        </div>
        <p className="table-mobile-hint">
          Листайте таблицу вправо, чтобы сравнить цены →
        </p>
        <div
          className="executive-table-scroll"
          role="region"
          aria-label={
            tab === "models"
              ? "Сравнение моделей и стоимости"
              : "Сравнение GPU и цен"
          }
          tabIndex={0}
        >
          <table className="executive-table">
            <thead>
              <tr>
                <th scope="col">
                  {tab === "models" ? "Модель и оборудование" : "GPU"}
                </th>
                <th scope="col">
                  Для работы<small>К покупке целыми серверами</small>
                </th>
                {tab === "gpus" && (
                  <th scope="col">
                    Цена оборудования<small>За GPU / за сервер</small>
                  </th>
                )}
                <th scope="col">
                  Покупка<small>Владение за {months} мес.</small>
                </th>
                <th scope="col">
                  Аренда
                  <small>
                    {tab === "gpus"
                      ? "Тариф GPU-час / всего"
                      : `Всего за ${months} мес.`}
                  </small>
                </th>
                <th scope="col">
                  <span className="sr-only">Выбор варианта</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ComparisonTableRow
                  key={row.id}
                  row={row}
                  gpuMode={tab === "gpus"}
                  months={months}
                  chosen={selected?.id === row.id}
                  recommended={comparison.recommended?.id === row.id}
                  expanded={rowDetail === row.id}
                  onExpand={() =>
                    setRowDetail(rowDetail === row.id ? null : row.id)
                  }
                  onSelect={() => onSelect(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="empty-state">
            В каталоге нет подтверждённых для этого сценария вариантов.
          </p>
        )}
        <div className="table-footer">
          <span>
            {tab === "gpus"
              ? "Цена GPU — доля стоимости сервера. Покупка округлена до целых серверов."
              : "Стоимость включает оборудование, размещение, поддержку и эксплуатацию."}
          </span>
          {tab === "models" && ordered.length > shortlist.length && (
            <button
              className="text-button"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Свернуть список" : `Все модели (${ordered.length})`}
              <ChevronDown size={13} />
            </button>
          )}
        </div>
      </section>

      {result && selected && (
        <details
          className="quiet-details"
          id="calculation-details"
          ref={detailsRef}
        >
          <summary>
            Почему столько GPU и что входит в оценку <ChevronDown size={16} />
          </summary>
          <div className="calculation-explainer">
            <div>
              <h3>Количество GPU</h3>
              <dl className="explanation-list">
                <div>
                  <dt>Только размещение весов</dt>
                  <dd>от {result.plan.weightOnlyMinGpuCount} GPU</dd>
                </div>
                <div>
                  <dt>Память для одного запроса</dt>
                  <dd>от {result.plan.singleRequestMinGpuCount} GPU</dd>
                </div>
                <div>
                  <dt>Один экземпляр модели</dt>
                  <dd>{result.plan.baseGpuCount} GPU</dd>
                </div>
                <div>
                  <dt>Экземпляров под нагрузку</dt>
                  <dd>{result.replicas}</dd>
                </div>
                <div className="explanation-total">
                  <dt>Рабочая конфигурация</dt>
                  <dd>{result.gpuCount} GPU</dd>
                </div>
                <div>
                  <dt>Покупка с округлением и резервом</dt>
                  <dd>{result.purchasedGpuCount} GPU</dd>
                </div>
              </dl>
              <p>
                Минимум по памяти не гарантирует поддержку связки оборудования и
                движка. Для MoE учитываются все веса модели, включая неактивных
                экспертов.
              </p>
            </div>
            <div>
              <h3>Нагрузка сценария</h3>
              <dl className="explanation-list">
                <div>
                  <dt>Одновременные запросы</dt>
                  <dd>{result.effectiveConcurrency}</dd>
                </div>
                <div>
                  <dt>Вход / ответ, токенов</dt>
                  <dd>
                    {result.effectiveInputTokens.toLocaleString("ru-RU")} /{" "}
                    {result.outputTokens.toLocaleString("ru-RU")}
                  </dd>
                </div>
                <div>
                  <dt>Работа в месяц</dt>
                  <dd>{input.hoursMonth} ч</dd>
                </div>
                <div>
                  <dt>Запросов на экземпляр</dt>
                  <dd>{result.sessionsPerReplica}</dd>
                </div>
                <div>
                  <dt>Веса / кэш запросов</dt>
                  <dd>
                    {Math.round(result.requiredWeightMemoryGb).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    /{" "}
                    {Math.round(result.requiredKvMemoryGb).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    ГБ
                  </dd>
                </div>
              </dl>
              <p>
                Технические значения заданы сценарием и редактируются на
                странице «Параметры».
              </p>
            </div>
          </div>
          <div className="evidence-details">
            <h3>Источники и ограничения</h3>
            <div className="evidence-links">
              {[
                {
                  label: "Модель",
                  url: result.model.sourceUrl,
                  date: result.model.sourceDate,
                },
                {
                  label: "Профиль запуска",
                  url: result.profile.sourceUrl,
                  date: result.profile.sourceDate,
                },
                {
                  label: "Покупка",
                  url: result.gpu.purchaseQuote.sourceUrl,
                  date: result.gpu.purchaseQuote.sourceDate,
                },
                {
                  label: "Аренда",
                  url: result.gpu.rentalQuote.sourceUrl,
                  date: result.gpu.rentalQuote.sourceDate,
                },
              ].map((source) => (
                <div key={source.label}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                      <ArrowUpRight size={12} />
                    </a>
                  ) : (
                    <span>{source.label}: оценка</span>
                  )}
                  <small>{source.date || "Дата не указана"}</small>
                </div>
              ))}
            </div>
            <ul>
              {Array.from(
                new Set([...selected.reasons, ...result.warnings]),
              ).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
          <button
            className="text-button economics-toggle"
            aria-expanded={costsOpen}
            onClick={() => setCostsOpen(!costsOpen)}
          >
            {costsOpen
              ? "Скрыть детализацию затрат"
              : "Расходы по статьям и изменение условий"}
            <ChevronDown size={14} />
          </button>
          {costsOpen && (
            <CostAnalysis
              config={config}
              input={{
                ...input,
                modelId: result.model.id,
                gpuId: result.gpu.id,
              }}
              result={result}
            />
          )}
        </details>
      )}
    </div>
  );
}

function ComparisonTableRow({
  row,
  gpuMode,
  months,
  chosen,
  recommended,
  expanded,
  onExpand,
  onSelect,
}: {
  row: ComparisonRow;
  gpuMode: boolean;
  months: number;
  chosen: boolean;
  recommended: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSelect: () => void;
}) {
  const result = row.result;
  return (
    <>
      <tr
        className={`${chosen ? "selected-row" : ""} ${!row.eligible ? "limited-row" : ""}`}
      >
        <th scope="row">
          <span className="row-title">
            {gpuMode ? row.gpu.name : row.model.name}
          </span>
          {!gpuMode && <span className="row-subtitle">{row.gpu.name}</span>}
          {recommended && <span className="row-badge">Оптимальный</span>}
          {!row.eligible && (
            <button
              className="row-limitation"
              aria-expanded={expanded}
              onClick={onExpand}
            >
              Нужна проверка <ChevronDown size={11} />
            </button>
          )}
        </th>
        <td>
          {result ? (
            <>
              <strong>{result.gpuCount} GPU</strong>
              <small>
                {result.purchasedGpuCount} GPU · серверов: {result.nodes}
              </small>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        {gpuMode && (
          <td>
            <strong>{money(row.purchasePerGpuEquivalentRub)}</strong>
            <small>{money(row.purchaseNodeRub)} / сервер</small>
          </td>
        )}
        <td>
          {result ? (
            <>
              <strong>{money(result.buyTco)}</strong>
              <small>
                {row.eligible ? "Полная стоимость" : "Условная оценка"}
              </small>
            </>
          ) : (
            <span className="muted">Нет расчёта</span>
          )}
        </td>
        <td>
          {gpuMode && (
            <small className="tariff">
              {formatRub(row.rentPerGpuHourRub)} / GPU-час
            </small>
          )}
          {result ? (
            <>
              <strong>{money(result.rentTco)}</strong>
              <small>{money(result.rentMonthly)} / мес.</small>
            </>
          ) : (
            <span className="muted">Нет расчёта</span>
          )}
        </td>
        <td>
          <button
            className={`choose-button ${chosen ? "chosen" : ""}`}
            disabled={!result}
            aria-label={`${chosen ? "Выбран" : "Выбрать"} ${row.model.name}, ${row.gpu.name}`}
            aria-pressed={chosen}
            onClick={onSelect}
          >
            {chosen ? <Check size={16} /> : <ArrowUpRight size={16} />}
            <span>{chosen ? "Выбран" : "Выбрать"}</span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="row-explanation">
          <td colSpan={gpuMode ? 6 : 5}>
            {row.reasons.length
              ? row.reasons.join(". ")
              : "Нет подтверждения совместимости и производительности для этой связки."}{" "}
            {result && (
              <>
                Стоимость за {months} месяцев показана для предварительной
                оценки.
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
