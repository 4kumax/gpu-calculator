"use client";

import { useState } from "react";
import { Server } from "lucide-react";
import {
  compactRub,
  formatRub,
  type CalculationInput,
  type CalculationResult,
} from "@/lib/calculator";
import { QUALITY_TIER_LABELS, type AppConfig } from "@/lib/config";
import { calculationMonths } from "@/lib/horizon";
import { CostAnalysis } from "./cost-analysis";

function SourceLink({ url, label }: { url: string; label: string }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {label || "Открыть источник"} ↗
    </a>
  ) : (
    <span>{label || "Источник не указан"}</span>
  );
}

export function CalculatorResults({
  config,
  input,
  result,
}: {
  config: AppConfig;
  input: CalculationInput;
  result: CalculationResult;
}) {
  const [tab, setTab] = useState<
    "alternatives" | "costs" | "evidence" | "rejected"
  >("alternatives");
  const maxCost = Math.max(result.buyTco, result.rentTco, 1);
  const equal = Math.abs(result.buyTco - result.rentTco) < 1;
  const breakEven =
    result.breakEvenDirection === "equal"
      ? "затраты равны"
      : result.breakEvenDirection === "always"
        ? "при любой загрузке"
        : result.breakEvenHoursMonth === null
          ? "не достигается"
          : `${result.breakEvenDirection === "below" ? "до" : "от"} ${result.breakEvenHoursMonth.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч/мес.`;
  const assessments = config.qualityAssessments.filter(
    (item) =>
      item.modelId === result.model.id && input.taskIds.includes(item.taskId),
  );
  const title = !result.selectionValid
    ? "Сценарий вне требований"
    : result.confidence === "measured"
      ? "Конфигурация с измерениями"
      : "Предварительная конфигурация";
  return (
    <aside className="stack" aria-label="Результаты расчёта">
      <div className="result-hero">
        <div className="result-kicker">{title}</div>
        <h2>{result.model.name}</h2>
        <p className="result-note">{result.model.note}</p>
        <div className="spec-grid">
          <div>
            <span>ПАРАМЕТРЫ</span>
            <b>{result.model.totalParamsB.toLocaleString("ru-RU")} млрд</b>
          </div>
          <div>
            <span>КЛАСС КАТАЛОГА</span>
            <b>
              {result.model.qualityTier} ·{" "}
              {QUALITY_TIER_LABELS[result.model.qualityTier]}
            </b>
          </div>
          <div>
            <span>КОНТЕКСТ</span>
            <b>
              {result.model.nativeContextK} → {result.model.maxContextK} тыс.
            </b>
          </div>
          <div>
            <span>ФОРМАТ</span>
            <b>{result.profile.precision}</b>
          </div>
        </div>
        <div className="hardware">
          <div className="hardware-icon">
            <Server size={22} />
          </div>
          <div className="hardware-copy">
            <small>РАБОЧАЯ КОНФИГУРАЦИЯ</small>
            <strong>
              {result.gpuCount} × {result.gpu.name}
            </strong>
            <span>
              {result.replicas} экземпляров · {result.nodes} узлов с резервом ·
              покупка {result.purchasedGpuCount} GPU
            </span>
          </div>
        </div>
        <span className="evidence">
          {result.profile.engine} {result.profile.engineVersion} ·{" "}
          {result.confidence === "measured"
            ? "Профиль подтверждён измерениями"
            : "Профиль требует нагрузочного испытания"}
        </span>
      </div>
      {!result.selectionValid && (
        <div className="error-box" role="status">
          <b>Требования не выполнены</b>
          <ul>
            {result.selectionReasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {!!result.warnings.length && (
        <div className="notice-box">
          <b>Допущения и ограничения</b>
          <ul>
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="panel cost-card">
        <div className="card-title-row">
          <h3>Сравнение на {calculationMonths(input)} месяцев</h3>
          <span className={`decision ${result.decision}`}>
            {equal
              ? "Затраты равны"
              : result.decision === "buy"
                ? "Покупка дешевле"
                : "Аренда дешевле"}
          </span>
        </div>
        <div className="cost-comparison">
          <div className="cost-line">
            <div className="cost-line-top">
              <span>Покупка и владение</span>
              <b>{compactRub(result.buyTco)}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${(result.buyTco / maxCost) * 100}%` }} />
            </div>
            <small>
              {compactRub(result.buyMonthlyAverage)} в среднем за месяц
            </small>
          </div>
          <div className="cost-line rent">
            <div className="cost-line-top">
              <span>Аренда</span>
              <b>{compactRub(result.rentTco)}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${(result.rentTco / maxCost) * 100}%` }} />
            </div>
            <small>{compactRub(result.rentMonthly)} в месяц</small>
          </div>
        </div>
        <div className="break-even">
          <span>Покупка дешевле аренды</span>
          <strong>{breakEven}</strong>
          <small>
            Для этой конфигурации, срока и условий оплаты. Равенство на границе
            учитывается отдельно.
          </small>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>Требуемая память всего</span>
          <b>
            {result.requiredTotalMemoryGb.toLocaleString("ru-RU", {
              maximumFractionDigits: 1,
            })}{" "}
            ГБ
          </b>
          <small>Для всех рабочих экземпляров</small>
        </div>
        <div className="metric">
          <span>Память KV-кэша</span>
          <b>
            {result.requiredKvMemoryGb.toLocaleString("ru-RU", {
              maximumFractionDigits: 1,
            })}{" "}
            ГБ
          </b>
          <small>
            {result.effectiveInputTokens.toLocaleString("ru-RU")} токенов входа
            + {result.outputTokens.toLocaleString("ru-RU")} ответа
          </small>
        </div>
        <div className="metric">
          <span>Веса / рабочая память</span>
          <b>
            {Math.round(result.requiredWeightMemoryGb)} /{" "}
            {Math.round(result.requiredWorkspaceMemoryGb)} ГБ
          </b>
          <small>KV-кэш показан отдельно</small>
        </div>
        <div className="metric">
          <span>Ёмкость экземпляра</span>
          <b>{result.sessionsPerReplica} запросов</b>
          <small>Пик этого маршрута: {result.effectiveConcurrency}</small>
        </div>
        <div className="metric">
          <span>Требования задач</span>
          <b>
            Класс {result.requiredQualityTier} · {result.requiredContextK} тыс.
          </b>
          <small>
            {result.requiredCapabilities.join(", ") ||
              "Возможности не ограничены"}
          </small>
        </div>
        <div className="metric">
          <span>Электроэнергия / месяц</span>
          <b>{compactRub(result.monthlyPowerRub)}</b>
          <small>Рабочие узлы и резерв</small>
        </div>
      </div>
      <div className="panel detail-card">
        <div className="detail-tabs" aria-label="Детали расчёта">
          {(
            [
              ["alternatives", "Варианты"],
              ["costs", "Экономика"],
              ["evidence", "Источники"],
              ["rejected", "Исключённые"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="detail-content">
          {tab === "costs" && (
            <CostAnalysis config={config} input={input} result={result} />
          )}
          {tab === "alternatives" && (
            <div className="alternative-list">
              {result.alternatives.length ? (
                result.alternatives.map((item, index) => (
                  <div
                    className="alternative"
                    key={`${item.model.id}-${item.gpu.id}-${index}`}
                  >
                    <b>{item.model.name}</b>
                    <span>
                      {item.gpu.name} · {item.gpuCount} GPU ·{" "}
                      {formatRub(item.hourlyInfrastructureRub)}/ч
                    </span>
                    <strong>{compactRub(item.bestTcoRub)}</strong>
                  </div>
                ))
              ) : (
                <p className="help-text">
                  Подходящих профилей нет. Измените требования или добавьте
                  профиль запуска в настройках.
                </p>
              )}
              <p className="help-text">
                Показана минимальная из стоимости покупки и аренды каждого
                варианта на выбранном горизонте.
              </p>
            </div>
          )}
          {tab === "rejected" && (
            <div className="alternative-list">
              {Object.entries(result.rejectedReasons).map(([id, reasons]) => (
                <div className="alternative" key={id}>
                  <b>
                    {config.models.find((model) => model.id === id)?.name ?? id}
                  </b>
                  <span>{reasons.join("; ")}</span>
                </div>
              ))}
              {!Object.keys(result.rejectedReasons).length && (
                <p>Все активные модели прошли требования по задачам.</p>
              )}
            </div>
          )}
          {tab === "evidence" && (
            <div className="stack source-details">
              <section>
                <h3>Характеристики модели</h3>
                <SourceLink
                  url={result.model.sourceUrl}
                  label={result.model.name}
                />
                <p>
                  {result.model.evidence} · {result.model.sourceDate}
                </p>
                <p>Лицензия: {result.model.license}</p>
              </section>
              <section>
                <h3>Профиль запуска</h3>
                <p>
                  {result.profile.engine} {result.profile.engineVersion} · TP{" "}
                  {result.profile.tensorParallel} / PP{" "}
                  {result.profile.pipelineParallel} · {result.profile.gpuCount}{" "}
                  GPU в базовом профиле
                </p>
                <SourceLink
                  url={result.profile.sourceUrl}
                  label="Источник профиля"
                />
                <p>
                  Дата: {result.profile.sourceDate}. {result.profile.notes}
                </p>
                <p>
                  KV-кэш: {result.profile.kvCacheGbPer1kTokens} ГБ на 1 000
                  токенов одного запроса. Рабочая память:{" "}
                  {result.profile.workspaceGbPerGpu} ГБ на GPU.
                </p>
                {result.profile.benchmark && (
                  <p>
                    Измерение: {result.profile.benchmark.inputTokens} /{" "}
                    {result.profile.benchmark.outputTokens} токенов,{" "}
                    {result.profile.benchmark.concurrency} запросов, первый
                    токен {result.profile.benchmark.ttftMs} мс,{" "}
                    {result.profile.benchmark.tokensPerSecond} токенов/с.
                  </p>
                )}
              </section>
              {(
                [
                  [
                    "Покупка узла",
                    result.gpu.purchaseQuote,
                    formatRub(result.gpu.nodePriceRub),
                  ],
                  [
                    "Аренда GPU-часа",
                    result.gpu.rentalQuote,
                    formatRub(result.gpu.rentPerGpuHourRub),
                  ],
                ] as const
              ).map(([label, quote, amount]) => (
                <section key={label}>
                  <h3>
                    {label}: {amount}
                  </h3>
                  <SourceLink url={quote.sourceUrl} label={quote.sourceLabel} />
                  <p>
                    {quote.kind} · {quote.sourceDate}
                  </p>
                  <p>{quote.terms}</p>
                </section>
              ))}
              <section>
                <h3>Проверки качества на выбранных задачах</h3>
                {assessments.length ? (
                  assessments.map((item) => (
                    <div className="assessment" key={item.id}>
                      <b>
                        {config.tasks.find((task) => task.id === item.taskId)
                          ?.title ?? item.taskId}
                      </b>
                      <p>
                        {item.status === "measured"
                          ? "Измерено"
                          : "Запланировано"}{" "}
                        · класс {item.qualityTier} · {item.sampleSize} примеров
                        · {item.dataset}
                      </p>
                      <p>
                        {item.correctAnswerPct !== undefined &&
                          `Верных ответов: ${item.correctAnswerPct}%. `}
                        {item.extractionErrorPct !== undefined &&
                          `Ошибок извлечения: ${item.extractionErrorPct}%. `}
                        {item.toolSuccessPct !== undefined &&
                          `Успешных вызовов инструментов: ${item.toolSuccessPct}%.`}
                      </p>
                      <SourceLink
                        url={item.sourceUrl}
                        label="Протокол проверки"
                      />
                      <p>
                        {item.sourceDate} · {item.notes}
                      </p>
                    </div>
                  ))
                ) : (
                  <p>
                    Измерения для этих задач не добавлены. Используется
                    экспертный класс из каталога; подтвердите его на целевом
                    наборе примеров в разделе «Проверки качества».
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
