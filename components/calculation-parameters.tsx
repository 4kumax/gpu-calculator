import type { ReactNode } from "react";
import {
  HOURS_PER_MONTH,
  type CalculationInput,
  type CalculationResult,
} from "@/lib/calculator";
import {
  QUALITY_TIER_LABELS,
  type AppConfig,
  type PriceQuote,
} from "@/lib/config";

type Entry = readonly [label: string, value: ReactNode];
type Props = {
  config: AppConfig;
  input: CalculationInput;
  result: CalculationResult;
};
const number = (value: number, digits = 3) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const rub = (value: number) => `${number(value, 2)} ₽`;
const gb = (value: number) => `${number(value, 9)} ГБ`;
const pct = (value: number) => `${number(value)}%`;
const date = (value: string) => value || "Дата не указана";

function ParameterList({ entries }: { entries: Entry[] }) {
  return (
    <dl className="parameter-list">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ParameterSection({
  title,
  entries = [],
  children,
}: {
  title: string;
  entries?: Entry[];
  children?: ReactNode;
}) {
  return (
    <section className="parameter-section" aria-label={title}>
      <h3>{title}</h3>
      {entries.length > 0 && <ParameterList entries={entries} />}
      {children}
    </section>
  );
}

function SourceLink({ url, label }: { url: string; label: string }) {
  return /^https?:\/\//i.test(url) ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  ) : (
    <span>Источник не указан</span>
  );
}

function QuoteParameters({
  title,
  quote,
}: {
  title: string;
  quote: PriceQuote;
}) {
  return (
    <ParameterSection
      title={title}
      entries={[
        ["Основание цены", quote.kind],
        ["Название источника", quote.sourceLabel || "Не указано"],
        ["Дата цены", date(quote.sourceDate)],
        [
          "Ссылка",
          <SourceLink
            key="source"
            url={quote.sourceUrl}
            label={quote.sourceLabel || title}
          />,
        ],
        ["Условия предложения", quote.terms || "Условия не указаны"],
      ]}
    />
  );
}

function CostTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<readonly [string, number]>;
  total: number;
}) {
  return (
    <table className="parameter-cost-table">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Статья</th>
          <th scope="col">За весь срок</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{rub(value)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Итого</th>
          <td>{rub(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The values used for this result remain visible, including defaults and quote limitations. */
export function CalculationParameters({ config, input, result }: Props) {
  const { model, gpu, profile, plan } = result;
  const a = config.assumptions;
  const months = input.years * 12;
  const dedicated = input.rentalMode === "dedicated-node";
  const workingRentalGpu = dedicated
    ? plan.workloadNodes * gpu.nodeGpuCount
    : plan.gpuCount;
  const workingRentalHours = dedicated ? HOURS_PER_MONTH : input.hoursMonth;
  const reserveRentalHours =
    dedicated || input.reserveRentalMode === "always-on"
      ? HOURS_PER_MONTH
      : input.hoursMonth;
  const reserveGpu = plan.reserveNodes * gpu.nodeGpuCount;
  const tasks = config.tasks.filter((task) => input.taskIds.includes(task.id));
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const priority = {
    cost: "Минимальная стоимость",
    balance: "Достаточное качество, затем стоимость",
    quality: "Максимальный класс качества",
  }[input.priority];
  const breakEven =
    result.breakEvenHoursMonth !== null
      ? `${number(result.breakEvenHoursMonth, 2)} ч/мес.; покупка дешевле ${result.breakEvenDirection === "below" ? "ниже" : "выше"} этой загрузки`
      : {
          always: `Покупка дешевле при любой загрузке от 0 до ${HOURS_PER_MONTH} ч/мес.`,
          never: `Покупка не дешевле в диапазоне 0–${HOURS_PER_MONTH} ч/мес.`,
          equal: "Затраты равны при любой загрузке",
          above: "Нет значения",
          below: "Нет значения",
        }[result.breakEvenDirection];
  return (
    <section
      className="calculation-parameters"
      aria-label="Учтённые параметры расчёта"
    >
      <header>
        <p>
          Значения для выбранной связки и текущего набора задач. Стоимость
          рассчитана за {number(months)} месяцев; все суммы в рублях.
        </p>
      </header>

      <ParameterSection
        title="Условия сравнения"
        entries={[
          [
            "Горизонт расчёта",
            `${number(input.years)} лет / ${number(months)} месяцев`,
          ],
          ["Использование оборудования", `${number(input.hoursMonth)} ч/мес.`],
          ["База полного месяца", `${HOURS_PER_MONTH} часов`],
          [
            "Режим аренды",
            dedicated
              ? "Выделенные узлы, круглосуточная оплата"
              : "GPU по часам использования",
          ],
          [
            "Оплачиваемое рабочее время аренды",
            `${number(workingRentalHours)} ч/мес.`,
          ],
          ["Рабочие GPU в аренде", number(workingRentalGpu)],
          [
            "Рабочая аренда за весь срок",
            `${number(workingRentalGpu * workingRentalHours * months)} GPU-часов`,
          ],
          [
            "Резерв оборудования",
            input.reserveMode === "nplus1"
              ? "Один резервный сервер (N+1)"
              : "Без резерва",
          ],
          [
            "Режим оплаты резерва",
            dedicated || input.reserveRentalMode === "always-on"
              ? "Круглосуточно"
              : "В часы использования",
          ],
          [
            "Оплачиваемое время резерва",
            plan.reserveNodes
              ? `${number(reserveRentalHours)} ч/мес.`
              : "0 ч/мес.; резерв не добавлен",
          ],
          [
            "Резервная аренда за весь срок",
            `${number(reserveGpu * reserveRentalHours * months)} GPU-часов`,
          ],
          ["Покупка и владение за весь срок", rub(result.buyTco)],
          ["Аренда и обслуживание за весь срок", rub(result.rentTco)],
          [
            "Разница затрат",
            `${rub(Math.abs(result.buyTco - result.rentTco))}${result.buyTco === result.rentTco ? "; затраты равны" : ` в пользу ${result.buyTco < result.rentTco ? "покупки" : "аренды"}`}`,
          ],
        ]}
      >
        <p>
          Почасовая аренда предполагает освобождение GPU в остальное время. Если
          оборудование должно быть постоянно выделено, нужна круглосуточная
          оплата. В покупке учтена полная цена оборудования за вычетом указанной
          ниже остаточной стоимости.
        </p>
      </ParameterSection>

      <ParameterSection
        title="Нагрузка и подбор"
        entries={[
          ["Одновременные запросы в пике", number(input.concurrency)],
          ["Доля запросов на выбранную модель", pct(input.largeModelSharePct)],
          [
            "Учтённые одновременные запросы",
            number(result.effectiveConcurrency),
          ],
          [
            "Заданный вход запроса",
            input.inputTokens
              ? `${number(input.inputTokens)} токенов`
              : "По умолчанию из каталога",
          ],
          [
            "Учтённый вход запроса",
            `${number(result.effectiveInputTokens)} токенов`,
          ],
          [
            "Заданный ответ",
            input.outputTokens !== undefined
              ? `${number(input.outputTokens)} токенов`
              : "По умолчанию из каталога",
          ],
          ["Учтённый ответ", `${number(result.outputTokens)} токенов`],
          [
            "Вход и ответ вместе",
            `${number(result.effectiveInputTokens + result.outputTokens)} токенов`,
          ],
          [
            "Требование к первому токену (TTFT)",
            input.targetTtftMs
              ? `Не более ${number(input.targetTtftMs)} мс`
              : "Не задано",
          ],
          [
            "Требование к скорости ответа",
            input.minTokensPerSecond
              ? `Не менее ${number(input.minTokensPerSecond)} токенов/с на запрос`
              : "Не задано",
          ],
          ["Приоритет выбора", priority],
          [
            "Модель в параметрах",
            input.modelId === "auto"
              ? "Автоматический подбор"
              : (config.models.find((item) => item.id === input.modelId)
                  ?.name ?? input.modelId),
          ],
          [
            "GPU в параметрах",
            input.gpuId === "auto"
              ? "Автоматический подбор"
              : (config.gpus.find((item) => item.id === input.gpuId)?.name ??
                input.gpuId),
          ],
        ]}
      >
        <p>
          Предельный контекст задач проверяет возможности модели и не заменяет
          фактическую длину запроса. Стоимость других маршрутов при доле
          запросов менее 100% не включена.
        </p>
      </ParameterSection>

      <ParameterSection
        title="Требования выбранных задач"
        entries={[
          [
            "Требуемый класс качества",
            `${result.requiredQualityTier} — ${QUALITY_TIER_LABELS[result.requiredQualityTier]}`,
          ],
          [
            "Требуемый максимальный контекст",
            `${number(result.requiredContextK * 1000)} токенов`,
          ],
          [
            "Требуемые возможности",
            result.requiredCapabilities.join(", ") || "Не заданы",
          ],
          [
            "Пригодность выбранной связки",
            result.selectionValid
              ? "Соответствует заданным требованиям в пределах указанных допущений"
              : "Требования не подтверждены",
          ],
        ]}
      >
        <table className="parameter-task-table">
          <caption>Правила для каждой выбранной задачи</caption>
          <thead>
            <tr>
              <th scope="col">Задача</th>
              <th scope="col">Класс</th>
              <th scope="col">Контекст, токенов</th>
              <th scope="col">Возможности</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <th scope="row">{task.title}</th>
                <td>{task.minQualityTier}</td>
                <td>{number(task.minContextK * 1000)}</td>
                <td>{task.requiredCapabilities.join(", ") || "Не заданы"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ParameterSection>

      <ParameterSection
        title="Выбранная модель"
        entries={[
          ["Модель", model.name],
          ["Разработчик", model.developer],
          ["Архитектура", model.architecture],
          ["Все параметры модели", `${number(model.totalParamsB)} млрд`],
          [
            "Активные параметры на токен",
            `${number(model.activeParamsB)} млрд`,
          ],
          ["Формат весов", model.precision],
          [
            "Номинальная разрядность весов",
            `${number(model.bitsPerWeight)} бит`,
          ],
          [
            "Размер чекпоинта на экземпляр",
            gb(plan.checkpointWeightPerReplicaGb),
          ],
          [
            "Основание размера чекпоинта",
            model.checkpointWeightGb === undefined
              ? "Число всех параметров × номинальная разрядность / 8"
              : "Размер тензоров из каталога; имеет приоритет над номинальной разрядностью",
          ],
          [
            "Нативный контекст",
            `${number(model.nativeContextK * 1000)} токенов`,
          ],
          [
            "Максимальный контекст модели",
            `${number(model.maxContextK * 1000)} токенов`,
          ],
          [
            "Класс качества модели",
            `${model.qualityTier} — ${QUALITY_TIER_LABELS[model.qualityTier]}`,
          ],
          ["Возможности модели", model.capabilities.join(", ")],
          ["Минимум GPU в карточке модели", number(model.minGpuCount)],
          [
            "Параллельность в карточке модели",
            `${number(model.sessionsPerReplica)} запросов на экземпляр`,
          ],
          [
            "Рекомендуемый GPU в карточке модели",
            config.gpus.find((item) => item.id === model.recommendedGpuId)
              ?.name ?? model.recommendedGpuId,
          ],
          ["Лицензия", model.license],
          ["Примечание модели", model.note || "Нет"],
        ]}
      >
        <p>
          Для MoE в памяти учитываются все веса, включая экспертов, неактивных
          на текущем токене. Активное число параметров не используется вместо
          полного размера весов.
        </p>
      </ParameterSection>

      <ParameterSection
        title="Характеристики оборудования"
        entries={[
          ["Ускоритель", gpu.name],
          ["Производитель", gpu.vendor],
          ["Память одного GPU", gb(gpu.memoryGb)],
          ["GPU в одном сервере", number(gpu.nodeGpuCount)],
          ["Цена целого сервера", rub(gpu.nodePriceRub)],
          [
            "Доля цены сервера на один GPU",
            rub(gpu.nodePriceRub / gpu.nodeGpuCount),
          ],
          ["Тариф одного GPU-часа", rub(gpu.rentPerGpuHourRub)],
          ["Мощность одного сервера", `${number(gpu.nodePowerKw)} кВт`],
          [
            "Пропускная способность памяти GPU",
            gpu.memoryBandwidthTb > 0
              ? `${number(gpu.memoryBandwidthTb)} ТБ/с`
              : "Нет подтверждённых данных",
          ],
          ["Соединение ускорителей", gpu.interconnect],
        ]}
      >
        <p>
          Доля цены сервера не является отдельной ценой продажи карты. Публичные
          характеристики оборудования не подтверждают коммерческие условия
          покупки или аренды.
        </p>
        <p>
          Пропускная способность памяти приведена справочно. Задержка и скорость
          ответа не рассчитываются из этого значения.
        </p>
      </ParameterSection>

      <ParameterSection
        title="Профиль запуска"
        entries={[
          ["Профиль", profile.id],
          ["Движок", profile.engine],
          ["Версия движка", profile.engineVersion],
          ["Формат профиля", profile.precision],
          [
            "Статус профиля",
            profile.status === "measured" ? "Измеренный" : "Плановый",
          ],
          [
            "Статус этого расчёта",
            result.confidence === "measured"
              ? "В пределах измеренной нагрузки"
              : "Плановая оценка",
          ],
          ["GPU на экземпляр в профиле", number(profile.gpuCount)],
          ["Tensor parallel", number(profile.tensorParallel)],
          ["Pipeline parallel", number(profile.pipelineParallel)],
          [
            "Максимальный контекст профиля",
            `${number(profile.maxContextTokens)} токенов`,
          ],
          [
            "Максимальная параллельность профиля",
            number(profile.maxConcurrency),
          ],
          [
            "KV-кэш на 1000 токенов одного запроса",
            gb(profile.kvCacheGbPer1kTokens),
          ],
          ["Workspace на GPU", gb(profile.workspaceGbPerGpu)],
          ["Примечание профиля", profile.notes || "Нет"],
        ]}
      >
        {profile.benchmark ? (
          <ParameterList
            entries={[
              [
                "Измерение: вход",
                `${number(profile.benchmark.inputTokens)} токенов`,
              ],
              [
                "Измерение: ответ",
                `${number(profile.benchmark.outputTokens)} токенов`,
              ],
              [
                "Измерение: одновременные запросы",
                number(profile.benchmark.concurrency),
              ],
              [
                "Измерение: первый токен",
                `${number(profile.benchmark.ttftMs)} мс`,
              ],
              [
                "Измерение: скорость ответа на запрос",
                `${number(profile.benchmark.tokensPerSecond)} токенов/с`,
              ],
            ]}
          />
        ) : (
          <p>Замер задержки и скорости ответа в профиле отсутствует.</p>
        )}
      </ParameterSection>

      <ParameterSection
        title="План оборудования и память"
        entries={[
          [
            "Нижняя граница: только веса",
            `${number(plan.weightOnlyMinGpuCount)} GPU`,
          ],
          [
            "Нижняя граница: веса и один запрос с запасом",
            `${number(plan.singleRequestMinGpuCount)} GPU`,
          ],
          ["GPU на экземпляр в расчёте", number(plan.baseGpuCount)],
          ["Экземпляров модели", number(plan.replicas)],
          ["Запросов на экземпляр в расчёте", number(plan.sessionsPerReplica)],
          [
            "Запросов на экземпляр по памяти",
            number(plan.memorySessionsPerReplica),
          ],
          ["Рабочие GPU", number(plan.gpuCount)],
          ["Рабочие серверы", number(plan.workloadNodes)],
          ["Резервные серверы", number(plan.reserveNodes)],
          ["Серверов к покупке", number(plan.nodes)],
          ["GPU к покупке", number(plan.purchasedGpuCount)],
          ["GPU в резерве", number(reserveGpu)],
          [
            "Незадействованные GPU из-за округления серверов",
            number(plan.purchasedGpuCount - plan.gpuCount - reserveGpu),
          ],
          ["GPU в аренде с резервом", number(plan.rentedGpuCount)],
          [
            "Веса с запасом на экземпляр",
            gb(plan.requiredWeightMemoryPerReplicaGb),
          ],
          ["Веса всех экземпляров с запасом", gb(plan.requiredWeightMemoryGb)],
          ["KV-кэш одного запроса", gb(plan.kvMemoryPerRequestGb)],
          ["KV-кэш всех одновременных запросов", gb(plan.requiredKvMemoryGb)],
          ["Workspace рабочих GPU", gb(plan.requiredWorkspaceMemoryGb)],
          ["Всего требуется памяти", gb(plan.requiredTotalMemoryGb)],
          ["Доступная память рабочих GPU", gb(plan.availableMemoryGb)],
        ]}
      >
        <p>
          Нижняя граница по памяти не подтверждает работоспособность топологии и
          производительность. Резервные и свободные GPU не включены в доступную
          память рабочих экземпляров.
        </p>
      </ParameterSection>

      <ParameterSection
        title="Финансовые и технические допущения"
        entries={[
          ["Электроэнергия", `${rub(a.electricityRubKwh)} / кВт·ч`],
          ["PUE", number(a.pue)],
          ["Мощность в простое", `${pct(a.idlePowerPct)} от полной`],
          ["Ввод в эксплуатацию", `${pct(a.fitoutPctCapex)} от оборудования`],
          ["Резерв бюджета", `${pct(a.contingencyPct)} от оборудования`],
          [
            "Поддержка оборудования",
            `${pct(a.supportPctCapexYear)} от оборудования в год`,
          ],
          ["Размещение сервера", `${rub(a.rackMonthPerNodeRub)} / месяц`],
          [
            "Сеть и хранилище",
            `${rub(a.networkStorageMonthRub)} / месяц для каждого варианта`,
          ],
          [
            "Эксплуатация",
            `${rub(a.operationsMonthRub)} / месяц для каждого варианта`,
          ],
          [
            "Сервисная надбавка аренды",
            `${pct(a.rentalServicePct)} от рабочей и резервной аренды`,
          ],
          [
            "Остаточная стоимость в конце срока",
            `${pct(a.residualValuePct)} от оборудования`,
          ],
          ["Запас к памяти весов", pct(a.memoryOverheadPct)],
          ["Доступная доля памяти GPU", pct(a.usableMemoryPct)],
          ["Порог давности источников", `${number(a.stalePriceDays)} дней`],
          ["Дисконтирование и стоимость капитала", "Не учитываются"],
          [
            "НДС, доставка и комплектация",
            "Отдельно не начисляются; зависят от условий цен ниже",
          ],
          ["Электроэнергия покупки в месяц", rub(result.monthlyPowerRub)],
          ["Средние затраты покупки в месяц", rub(result.buyMonthlyAverage)],
          ["Затраты аренды в месяц", rub(result.rentMonthly)],
          ["Порог сравнения покупки и аренды", breakEven],
        ]}
      />

      <ParameterSection
        title="Значения каталога по умолчанию"
        entries={[
          ["Часы по умолчанию", `${number(a.defaultHoursMonth)} ч/мес.`],
          ["Горизонт по умолчанию", `${number(a.defaultYears)} лет`],
          ["Одновременные запросы по умолчанию", number(a.defaultConcurrency)],
          ["Вход по умолчанию", `${number(a.defaultInputTokens)} токенов`],
          ["Ответ по умолчанию", `${number(a.defaultOutputTokens)} токенов`],
        ]}
      >
        <p>
          Текущие применённые значения указаны в разделах нагрузки и условий
          сравнения; значения каталога не заменяют явно заданные параметры.
        </p>
      </ParameterSection>

      <ParameterSection title="Состав затрат покупки">
        <CostTable
          title="Покупка и владение"
          rows={[
            ["Оборудование", result.buy.equipment],
            ["Ввод в эксплуатацию", result.buy.fitout],
            ["Резерв бюджета", result.buy.contingency],
            ["Поддержка", result.buy.support],
            ["Электроэнергия", result.buy.electricity],
            ["Размещение", result.buy.placement],
            ["Сеть и хранилище", result.buy.networkStorage],
            ["Эксплуатация", result.buy.operations],
            ["Вычет остаточной стоимости", -result.buy.residual],
          ]}
          total={result.buyTco}
        />
      </ParameterSection>
      <ParameterSection title="Состав затрат аренды">
        <CostTable
          title="Аренда и обслуживание"
          rows={[
            ["Рабочие GPU / узлы", result.rent.compute],
            ["Резервные GPU / узлы", result.rent.reserve],
            ["Сервисная надбавка", result.rent.service],
            ["Сеть и хранилище", result.rent.networkStorage],
            ["Эксплуатация", result.rent.operations],
          ]}
          total={result.rentTco}
        />
      </ParameterSection>

      <ParameterSection
        title="Каталог и источники характеристик"
        entries={[
          ["Дата расчёта (UTC)", asOf],
          ["Версия каталога", config.catalogVersion],
          ["Ревизия каталога", number(config.revision)],
          ["Дата обновления каталога", config.updatedAt],
          ["Версия формата каталога", number(config.schemaVersion)],
          ["Основание характеристик модели", model.evidence],
          ["Дата характеристик модели", date(model.sourceDate)],
          [
            "Источник модели",
            <SourceLink
              key="model"
              url={model.sourceUrl}
              label="Открыть характеристики модели"
            />,
          ],
          ["Дата профиля запуска", date(profile.sourceDate)],
          [
            "Источник профиля запуска",
            <SourceLink
              key="profile"
              url={profile.sourceUrl}
              label="Открыть профиль запуска"
            />,
          ],
        ]}
      />
      <QuoteParameters
        title="Источник цены покупки"
        quote={gpu.purchaseQuote}
      />
      <QuoteParameters title="Источник тарифа аренды" quote={gpu.rentalQuote} />

      <ParameterSection title="Испытания качества">
        {result.qualityAssessments.length ? (
          result.qualityAssessments.map((assessment) => (
            <div key={assessment.id}>
              <h4>
                {config.tasks.find((task) => task.id === assessment.taskId)
                  ?.title ?? assessment.taskId}
              </h4>
              <ParameterList
                entries={[
                  [
                    "Статус испытания",
                    assessment.status === "measured"
                      ? "Измерено"
                      : "Планируется",
                  ],
                  [
                    "Класс по испытанию",
                    `${assessment.qualityTier} — ${QUALITY_TIER_LABELS[assessment.qualityTier]}`,
                  ],
                  ["Размер выборки", number(assessment.sampleSize)],
                  ["Набор данных", assessment.dataset],
                  [
                    "Правильные ответы",
                    assessment.correctAnswerPct === undefined
                      ? "Не измерены"
                      : pct(assessment.correctAnswerPct),
                  ],
                  [
                    "Ошибки извлечения",
                    assessment.extractionErrorPct === undefined
                      ? "Не измерены"
                      : pct(assessment.extractionErrorPct),
                  ],
                  [
                    "Успешные вызовы инструментов",
                    assessment.toolSuccessPct === undefined
                      ? "Не измерены"
                      : pct(assessment.toolSuccessPct),
                  ],
                  ["Дата испытания", date(assessment.sourceDate)],
                  [
                    "Источник испытания",
                    <SourceLink
                      key="quality"
                      url={assessment.sourceUrl}
                      label="Открыть результат испытания"
                    />,
                  ],
                  ["Примечание испытания", assessment.notes || "Нет"],
                ]}
              />
            </div>
          ))
        ) : (
          <p>
            Для выбранных задач и модели нет испытаний качества в каталоге.
            Класс качества задан экспертной оценкой.
          </p>
        )}
      </ParameterSection>

      <ParameterSection title="Ограничения расчёта">
        {result.selectionReasons.length || result.warnings.length ? (
          <ul>
            {Array.from(
              new Set([...result.selectionReasons, ...result.warnings]),
            ).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>Дополнительные ограничения не отмечены.</p>
        )}
      </ParameterSection>
    </section>
  );
}
