import {
  AppConfig,
  Capability,
  DeploymentProfile,
  GpuConfig,
  ModelConfig,
  PriceQuote,
  QualityAssessment,
  QualityTier,
  TaskRule,
  createEstimatedProfile,
  modelWeightGb,
} from "@/lib/config";

export type CalculationInput = {
  taskIds: string[];
  modelId: string | "auto";
  gpuId: string | "auto";
  hoursMonth: number;
  years: number;
  concurrency: number;
  reserveMode: "none" | "nplus1";
  largeModelSharePct: number;
  priority: "cost" | "balance" | "quality";
  /** Zero (or omitted) uses the configured workload default, never the model/task context limit. */
  inputTokens?: number;
  outputTokens?: number;
  /** Zero (or omitted) means no latency / output-throughput SLO. */
  targetTtftMs?: number;
  minTokensPerSecond?: number;
  rentalMode?: "gpu-hour" | "dedicated-node";
  reserveRentalMode?: "active-hours" | "always-on";
  /** ISO date used to reproduce source-age warnings. */
  asOf?: string;
};

export type CostBreakdown = {
  equipment: number;
  fitout: number;
  contingency: number;
  support: number;
  electricity: number;
  placement: number;
  networkStorage: number;
  operations: number;
  residual: number;
  total: number;
};
export type RentBreakdown = {
  compute: number;
  reserve: number;
  service: number;
  networkStorage: number;
  operations: number;
  total: number;
};
export type BreakEvenDirection =
  "above" | "below" | "always" | "never" | "equal";

export type DeploymentPlan = {
  gpu: GpuConfig;
  profile: DeploymentProfile;
  confidence: "estimated" | "measured";
  warnings: string[];
  reasons: string[];
  effectiveInputTokens: number;
  outputTokens: number;
  effectiveConcurrency: number;
  sessionsPerReplica: number;
  /** Physical-memory lower bound for packed weights alone; not a supported deployment. */
  weightOnlyMinGpuCount: number;
  /** Memory lower bound for one request including the configured headroom, cache and workspace. */
  singleRequestMinGpuCount: number;
  /** Packed checkpoint size before runtime headroom. Includes all resident MoE experts. */
  checkpointWeightPerReplicaGb: number;
  kvMemoryPerRequestGb: number;
  memorySessionsPerReplica: number;
  requiredWeightMemoryPerReplicaGb: number;
  requiredWeightMemoryGb: number;
  requiredKvMemoryGb: number;
  requiredWorkspaceMemoryGb: number;
  requiredTotalMemoryGb: number;
  baseGpuCount: number;
  replicas: number;
  gpuCount: number;
  workloadNodes: number;
  reserveNodes: number;
  nodes: number;
  purchasedGpuCount: number;
  /** Usable serving memory of active replicas only; standby and idle GPUs are excluded. */
  availableMemoryGb: number;
  rentedGpuCount: number;
};

type CostEstimate = {
  monthlyPowerRub: number;
  rentMonthly: number;
  buyMonthlyAverage: number;
  rentTco: number;
  buyTco: number;
  breakEvenHoursMonth: number | null;
  breakEvenDirection: BreakEvenDirection;
  buy: CostBreakdown;
  rent: RentBreakdown;
};

export type CalculationResult = CostEstimate & {
  model: ModelConfig;
  gpu: GpuConfig;
  profile: DeploymentProfile;
  confidence: "estimated" | "measured";
  warnings: string[];
  qualityAssessments: QualityAssessment[];
  eligibleModels: ModelConfig[];
  rejectedReasons: Record<string, string[]>;
  requiredQualityTier: QualityTier;
  requiredContextK: number;
  requiredCapabilities: Capability[];
  selectionValid: boolean;
  selectionReasons: string[];
  effectiveInputTokens: number;
  outputTokens: number;
  effectiveConcurrency: number;
  sessionsPerReplica: number;
  replicas: number;
  gpuCount: number;
  nodes: number;
  purchasedGpuCount: number;
  requiredWeightMemoryGb: number;
  requiredKvMemoryGb: number;
  requiredWorkspaceMemoryGb: number;
  requiredTotalMemoryGb: number;
  availableMemoryGb: number;
  decision: "buy" | "rent";
  plan: DeploymentPlan;
  alternatives: Array<{
    model: ModelConfig;
    gpu: GpuConfig;
    profile: DeploymentProfile;
    confidence: "estimated" | "measured";
    gpuCount: number;
    hourlyInfrastructureRub: number;
    bestTcoRub: number;
  }>;
};

function requirements(tasks: TaskRule[]): {
  qualityTier: QualityTier;
  contextK: number;
  capabilities: Capability[];
} {
  return {
    qualityTier: Math.max(
      1,
      ...tasks.map((task) => task.minQualityTier),
    ) as QualityTier,
    contextK: Math.max(1, ...tasks.map((task) => task.minContextK)),
    capabilities: Array.from(
      new Set(tasks.flatMap((task) => task.requiredCapabilities)),
    ),
  };
}

function selectedRequirements(config: AppConfig, taskIds: string[]) {
  if (!Array.isArray(taskIds) || taskIds.some((id) => typeof id !== "string"))
    throw new Error("taskIds: требуется массив идентификаторов задач.");
  const availableTasks = new Set(
    config.tasks.filter((task) => task.enabled).map((task) => task.id),
  );
  const unknown = taskIds.filter((id) => !availableTasks.has(id));
  if (unknown.length)
    throw new Error(
      `Неизвестные или выключенные задачи: ${unknown.join(", ")}.`,
    );
  const tasks = config.tasks.filter((task) => taskIds.includes(task.id));
  return { tasks, req: requirements(tasks) };
}

function applicableAssessment(
  assessment: QualityAssessment,
  config: AppConfig,
  asOf: number,
): boolean {
  const ageDays = (asOf - Date.parse(assessment.sourceDate)) / 86_400_000;
  return (
    assessment.status === "measured" &&
    assessment.sampleSize > 0 &&
    ageDays >= 0 &&
    ageDays <= config.assumptions.stalePriceDays
  );
}

export function evaluateModels(
  config: AppConfig,
  taskIds: string[],
  asOfDate = new Date().toISOString().slice(0, 10),
) {
  const { tasks, req } = selectedRequirements(config, taskIds);
  const asOf = Date.parse(asOfDate);
  const rejectedReasons: Record<string, string[]> = {};
  const qualityHeadroom: Record<string, number> = {};
  const eligible = config.models
    .filter((model) => {
      if (!model.enabled) return false;
      const reasons: string[] = [];
      qualityHeadroom[model.id] = tasks.length
        ? Infinity
        : model.qualityTier - 1;
      for (const task of tasks) {
        const assessment = config.qualityAssessments.find(
          (item) =>
            item.modelId === model.id &&
            item.taskId === task.id &&
            applicableAssessment(item, config, asOf),
        );
        const tier = assessment?.qualityTier ?? model.qualityTier;
        qualityHeadroom[model.id] = Math.min(
          qualityHeadroom[model.id],
          tier - task.minQualityTier,
        );
        if (tier < task.minQualityTier)
          reasons.push(
            `«${task.title}»: класс качества ${tier} ниже требуемого ${task.minQualityTier}${assessment ? " по оценке на целевой выборке" : " (экспертная оценка)"}`,
          );
      }
      if (model.maxContextK < req.contextK)
        reasons.push(
          `максимальный контекст ${model.maxContextK} тыс. ниже требуемого ${req.contextK} тыс.`,
        );
      for (const capability of req.capabilities)
        if (!model.capabilities.includes(capability))
          reasons.push(`нет возможности «${capability}»`);
      if (reasons.length) rejectedReasons[model.id] = reasons;
      return reasons.length === 0;
    })
    .sort(
      (left, right) =>
        left.qualityTier - right.qualityTier ||
        left.name.localeCompare(right.name, "ru"),
    );
  return { tasks, req, eligible, rejectedReasons, qualityHeadroom };
}

function recommendedGpu(config: AppConfig, model: ModelConfig): GpuConfig {
  const gpu =
    config.gpus.find(
      (item) => item.enabled && item.id === model.recommendedGpuId,
    ) ?? config.gpus.find((item) => item.enabled);
  if (!gpu)
    throw new Error("Для расчёта требуется хотя бы один включённый GPU.");
  return gpu;
}

function validateInput(input: CalculationInput): void {
  if (!input || typeof input !== "object")
    throw new Error("Параметры расчёта должны быть объектом.");
  if (
    !Number.isFinite(input.hoursMonth) ||
    input.hoursMonth < 0 ||
    input.hoursMonth > 730
  )
    throw new Error(
      "Использование должно быть в диапазоне от 0 до 730 часов в месяц.",
    );
  if (!Number.isSafeInteger(input.years) || input.years < 1 || input.years > 5)
    throw new Error("Горизонт расчёта должен быть целым числом от 1 до 5 лет.");
  if (
    !Number.isSafeInteger(input.concurrency) ||
    input.concurrency < 1 ||
    input.concurrency > 10_000
  )
    throw new Error(
      "Пиковая параллельность должна быть целым числом от 1 до 10000.",
    );
  if (
    !Number.isFinite(input.largeModelSharePct) ||
    input.largeModelSharePct < 0.001 ||
    input.largeModelSharePct > 100
  )
    throw new Error("Доля нагрузки должна быть от 0,001 до 100%.");
  if (
    typeof input.modelId !== "string" ||
    !input.modelId ||
    typeof input.gpuId !== "string" ||
    !input.gpuId
  )
    throw new Error(
      "Идентификаторы модели и GPU должны быть непустыми строками.",
    );
  if (
    !["none", "nplus1"].includes(input.reserveMode) ||
    !["cost", "balance", "quality"].includes(input.priority)
  )
    throw new Error("Недопустимый режим резервирования или приоритет.");
  for (const key of ["inputTokens", "outputTokens"] as const) {
    const value = input[key];
    const min = key === "outputTokens" ? 1 : 0;
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < min || value > 10_000_000)
    )
      throw new Error(`${key}: требуется целое число от ${min} до 10000000.`);
  }
  for (const key of ["targetTtftMs", "minTokensPerSecond"] as const) {
    const value = input[key];
    const max = key === "targetTtftMs" ? 10_000_000 : 1_000_000;
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value < 0 || value > max)
    )
      throw new Error(`${key}: требуется конечное число от 0 до ${max}.`);
  }
  if (
    input.rentalMode !== undefined &&
    !["gpu-hour", "dedicated-node"].includes(input.rentalMode)
  )
    throw new Error("Неизвестная модель аренды.");
  if (
    input.reserveRentalMode !== undefined &&
    !["active-hours", "always-on"].includes(input.reserveRentalMode)
  )
    throw new Error("Неизвестный режим оплаты резерва.");
  if (input.asOf !== undefined) {
    const value = input.asOf;
    const valid =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, value.length === 10 ? 10 : 19) ===
        value.slice(0, value.length === 10 ? 10 : 19);
    if (!valid)
      throw new Error(
        "asOf: требуется корректная дата YYYY-MM-DD или UTC ISO timestamp.",
      );
  }
}

export function planModelDeployment(
  config: AppConfig,
  model: ModelConfig,
  input: CalculationInput,
  selectedGpu?: GpuConfig,
  selectedProfile?: DeploymentProfile,
): DeploymentPlan {
  validateInput(input);
  selectedRequirements(config, input.taskIds);
  const gpu = selectedGpu ?? recommendedGpu(config, model);
  const catalogProfile =
    selectedProfile ??
    config.deploymentProfiles.find(
      (profile) =>
        profile.enabled &&
        profile.modelId === model.id &&
        profile.gpuId === gpu.id,
    );
  // A minimum on the recommended accelerator is not a minimum on every other GPU.
  // Unprofiled pairs expose a conditional memory estimate only, and stay ineligible.
  const profile = catalogProfile ?? {
    ...createEstimatedProfile(model, gpu),
    gpuCount: 1,
    tensorParallel: 1,
    pipelineParallel: 1,
  };
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!catalogProfile)
    reasons.push(
      `для ${gpu.name} отсутствует профиль запуска: не подтверждены производительность, межсоединение и формат весов; показана оценка памяти`,
    );
  if (profile.gpuId !== gpu.id || profile.modelId !== model.id)
    throw new Error("Профиль запуска не соответствует выбранным модели и GPU.");
  const effectiveInputTokens =
    input.inputTokens || config.assumptions.defaultInputTokens;
  const outputTokens =
    input.outputTokens ?? config.assumptions.defaultOutputTokens;
  const contextTokens = effectiveInputTokens + outputTokens;
  if (
    contextTokens > Math.min(profile.maxContextTokens, model.maxContextK * 1000)
  )
    reasons.push(
      `контекст входа и ответа ${contextTokens} токенов превышает предел профиля ${Math.min(profile.maxContextTokens, model.maxContextK * 1000)}`,
    );
  if (contextTokens > model.nativeContextK * 1000)
    warnings.push(
      "Контекст превышает нативный: необходима проверка расширения контекста и качества на выбранном движке.",
    );
  // Rounding happens once, after the exact workload share (including fractions below 1%).
  const effectiveConcurrency = Math.max(
    1,
    Math.ceil((input.concurrency * input.largeModelSharePct) / 100),
  );
  const checkpointWeightPerReplicaGb = modelWeightGb(model);
  const weightOnlyMinGpuCount = Math.ceil(
    checkpointWeightPerReplicaGb / gpu.memoryGb,
  );
  const requiredWeightMemoryPerReplicaGb =
    checkpointWeightPerReplicaGb *
    (1 + config.assumptions.memoryOverheadPct / 100);
  const kvPerSessionGb = (contextTokens / 1000) * profile.kvCacheGbPer1kTokens;
  const usableGpuMemoryGb =
    (gpu.memoryGb * config.assumptions.usableMemoryPct) / 100;
  const remainingPerGpuGb = usableGpuMemoryGb - profile.workspaceGbPerGpu;
  if (remainingPerGpuGb <= 0)
    throw new Error(
      `Workspace профиля ${profile.id} занимает всю доступную память GPU.`,
    );
  const singleRequestMinGpuCount = Math.ceil(
    (requiredWeightMemoryPerReplicaGb + kvPerSessionGb) / remainingPerGpuGb,
  );
  let baseGpuCount = profile.gpuCount;
  if (!catalogProfile) {
    // A one-request minimum followed by replication is not necessarily the
    // smallest memory-only deployment. Evaluate batching before duplicating weights.
    let bestActiveGpuCount = Infinity;
    let bestReplicaCount = Infinity;
    for (
      let sessions = 1;
      sessions <= Math.min(effectiveConcurrency, profile.maxConcurrency);
      sessions += 1
    ) {
      const groupGpuCount = Math.max(
        1,
        Math.ceil(
          (requiredWeightMemoryPerReplicaGb + kvPerSessionGb * sessions) /
            remainingPerGpuGb,
        ),
      );
      const replicaCount = Math.ceil(effectiveConcurrency / sessions);
      const activeGpuCount = groupGpuCount * replicaCount;
      if (
        activeGpuCount < bestActiveGpuCount ||
        (activeGpuCount === bestActiveGpuCount &&
          replicaCount < bestReplicaCount)
      ) {
        baseGpuCount = groupGpuCount;
        bestActiveGpuCount = activeGpuCount;
        bestReplicaCount = replicaCount;
      }
    }
  }
  if (catalogProfile && singleRequestMinGpuCount > baseGpuCount)
    reasons.push(
      `${profile.status === "measured" ? "Измеренная" : "Плановая"} конфигурация не вмещает веса, workspace и KV-кэш одной сессии: нижняя граница по памяти ${singleRequestMinGpuCount} GPU, в профиле ${baseGpuCount}. Требуется отдельный профиль с подтверждённой топологией.`,
    );
  const memorySessionCapacity =
    kvPerSessionGb === 0
      ? profile.maxConcurrency
      : Math.floor(
          Math.max(
            0,
            baseGpuCount * remainingPerGpuGb - requiredWeightMemoryPerReplicaGb,
          ) /
            kvPerSessionGb +
            1e-9,
        );
  const measuredConcurrency =
    profile.status === "measured" && profile.benchmark
      ? profile.benchmark.concurrency
      : profile.maxConcurrency;
  const sessionsPerReplica = Math.max(
    1,
    Math.min(
      profile.maxConcurrency,
      measuredConcurrency,
      memorySessionCapacity,
    ),
  );
  // Duplicating an instance that cannot serve even one request never fixes it.
  // Keep the rejected profile visible once instead of inventing a larger fleet.
  const replicas =
    singleRequestMinGpuCount > baseGpuCount
      ? 1
      : Math.max(1, Math.ceil(effectiveConcurrency / sessionsPerReplica));
  const gpuCount = baseGpuCount * replicas;
  if (
    !Number.isSafeInteger(baseGpuCount) ||
    !Number.isSafeInteger(gpuCount) ||
    gpuCount < 1
  )
    throw new Error(
      `Профиль ${profile.id}: требуемое количество GPU выходит за допустимые числовые пределы.`,
    );
  const peakSessionsPerReplica = Math.min(
    sessionsPerReplica,
    effectiveConcurrency,
  );
  const benchmark = profile.benchmark;
  const asOf = Date.parse(input.asOf ?? new Date().toISOString().slice(0, 10));
  const evidenceAgeDays = (asOf - Date.parse(profile.sourceDate)) / 86_400_000;
  const evidenceCurrent =
    !!profile.sourceDate &&
    evidenceAgeDays >= 0 &&
    evidenceAgeDays <= config.assumptions.stalePriceDays;
  if (profile.sourceDate && evidenceAgeDays > config.assumptions.stalePriceDays)
    warnings.push(
      "Источник профиля запуска устарел; условия измерения требуют повторной проверки.",
    );
  const measuredEnvelope =
    profile.status === "measured" &&
    profile.precision === model.precision &&
    !!benchmark &&
    !!profile.sourceUrl &&
    evidenceCurrent &&
    baseGpuCount === profile.gpuCount &&
    replicas === 1 &&
    effectiveInputTokens <= benchmark.inputTokens &&
    outputTokens <= benchmark.outputTokens &&
    peakSessionsPerReplica <= benchmark.concurrency &&
    memorySessionCapacity > 0 &&
    contextTokens <= profile.maxContextTokens;
  const confidence = measuredEnvelope ? "measured" : "estimated";
  if (profile.status === "estimated")
    warnings.push(
      "Профиль плановый: KV-кэш, workspace и параллельность заданы допущениями; производительность и совместимость запуска не измерены.",
    );
  else if (!measuredEnvelope)
    warnings.push(
      "Нагрузка или дата источника выходят за условия измерения; производительность для этого расчёта не подтверждена.",
    );
  if (baseGpuCount !== profile.gpuCount)
    warnings.push(
      `Память требует ${baseGpuCount} GPU на реплику вместо ${profile.gpuCount}; новая топология является оценкой и требует проверки запуска.`,
    );
  if (replicas > 1)
    warnings.push(
      "Независимые реплики предполагают равномерную балансировку запросов; масштабирование нагрузки необходимо проверить.",
    );
  if (profile.precision !== model.precision)
    reasons.push(
      "Формат весов профиля отличается от каталожного чекпоинта; добавьте модель с соответствующим размером весов.",
    );
  if ((input.targetTtftMs ?? 0) > 0) {
    if (!measuredEnvelope)
      reasons.push(
        "Целевой TTFT не подтверждён измерением для заданной нагрузки.",
      );
    else if (benchmark!.ttftMs > input.targetTtftMs!)
      reasons.push(
        `Измеренный TTFT ${benchmark!.ttftMs} мс превышает цель ${input.targetTtftMs} мс.`,
      );
  }
  if ((input.minTokensPerSecond ?? 0) > 0) {
    if (!measuredEnvelope)
      reasons.push(
        "Целевая скорость генерации не подтверждена измерением для заданной нагрузки.",
      );
    else if (benchmark!.tokensPerSecond < input.minTokensPerSecond!)
      reasons.push(
        `Измеренная скорость ${benchmark!.tokensPerSecond} токенов/с ниже цели ${input.minTokensPerSecond} токенов/с.`,
      );
  }
  const requiredWeightMemoryGb = requiredWeightMemoryPerReplicaGb * replicas;
  const requiredKvMemoryGb = kvPerSessionGb * effectiveConcurrency;
  const requiredWorkspaceMemoryGb = gpuCount * profile.workspaceGbPerGpu;
  const requiredTotalMemoryGb =
    requiredWeightMemoryGb + requiredKvMemoryGb + requiredWorkspaceMemoryGb;
  const workloadNodes = Math.ceil(gpuCount / gpu.nodeGpuCount);
  const reserveNodes = input.reserveMode === "nplus1" ? 1 : 0;
  const nodes = workloadNodes + reserveNodes;
  if (reserveNodes && baseGpuCount > gpu.nodeGpuCount)
    warnings.push(
      "Один резервный узел не заменяет целую реплику; восстановление предполагает перераспределение GPU между узлами.",
    );
  return {
    gpu,
    profile,
    confidence,
    warnings,
    reasons,
    effectiveInputTokens,
    outputTokens,
    effectiveConcurrency,
    sessionsPerReplica,
    weightOnlyMinGpuCount,
    singleRequestMinGpuCount,
    checkpointWeightPerReplicaGb,
    kvMemoryPerRequestGb: kvPerSessionGb,
    memorySessionsPerReplica: memorySessionCapacity,
    requiredWeightMemoryPerReplicaGb,
    requiredWeightMemoryGb,
    requiredKvMemoryGb,
    requiredWorkspaceMemoryGb,
    requiredTotalMemoryGb,
    baseGpuCount,
    replicas,
    gpuCount,
    workloadNodes,
    reserveNodes,
    nodes,
    purchasedGpuCount: nodes * gpu.nodeGpuCount,
    availableMemoryGb: gpuCount * usableGpuMemoryGb,
    rentedGpuCount:
      (input.rentalMode === "dedicated-node"
        ? workloadNodes * gpu.nodeGpuCount
        : gpuCount) +
      reserveNodes * gpu.nodeGpuCount,
  };
}

function costsAtHours(
  config: AppConfig,
  input: CalculationInput,
  plan: DeploymentPlan,
  hoursMonth: number,
) {
  const { gpu, nodes, workloadNodes, reserveNodes, gpuCount } = plan;
  const a = config.assumptions;
  const months = input.years * 12;
  const capex = nodes * gpu.nodePriceRub;
  const fitout = (capex * a.fitoutPctCapex) / 100;
  const contingency = (capex * a.contingencyPct) / 100;
  const support = ((capex * a.supportPctCapexYear) / 100) * input.years;
  const averagePowerFactor =
    a.idlePowerPct / 100 + ((1 - a.idlePowerPct / 100) * hoursMonth) / 730;
  const monthlyPowerRub =
    (workloadNodes * averagePowerFactor +
      (reserveNodes * a.idlePowerPct) / 100) *
    gpu.nodePowerKw *
    730 *
    a.pue *
    a.electricityRubKwh;
  const electricity = monthlyPowerRub * months;
  const placement = nodes * a.rackMonthPerNodeRub * months;
  const networkStorage = a.networkStorageMonthRub * months;
  const operations = a.operationsMonthRub * months;
  const residual = (capex * a.residualValuePct) / 100;
  const buyTco =
    capex +
    fitout +
    contingency +
    support +
    electricity +
    placement +
    networkStorage +
    operations -
    residual;
  const dedicated = input.rentalMode === "dedicated-node";
  const compute =
    (dedicated
      ? workloadNodes * gpu.nodeGpuCount * 730
      : gpuCount * hoursMonth) *
    gpu.rentPerGpuHourRub *
    months;
  const reserveHours =
    dedicated || input.reserveRentalMode === "always-on" ? 730 : hoursMonth;
  const reserve =
    reserveNodes *
    gpu.nodeGpuCount *
    gpu.rentPerGpuHourRub *
    reserveHours *
    months;
  const service = ((compute + reserve) * a.rentalServicePct) / 100;
  const rentTco = compute + reserve + service + networkStorage + operations;
  return {
    monthlyPowerRub,
    rentMonthly: rentTco / months,
    buyMonthlyAverage: buyTco / months,
    rentTco,
    buyTco,
    buy: {
      equipment: capex,
      fitout,
      contingency,
      support,
      electricity,
      placement,
      networkStorage,
      operations,
      residual,
      total: buyTco,
    },
    rent: {
      compute,
      reserve,
      service,
      networkStorage,
      operations,
      total: rentTco,
    },
  };
}

function estimateCosts(
  config: AppConfig,
  input: CalculationInput,
  plan: DeploymentPlan,
): CostEstimate {
  const estimate = costsAtHours(config, input, plan, input.hoursMonth);
  const zero = costsAtHours(config, input, plan, 0);
  const full = costsAtHours(config, input, plan, 730);
  const intercept = zero.buyTco - zero.rentTco;
  const end = full.buyTco - full.rentTco;
  const slope = (end - intercept) / 730;
  const epsilon =
    Math.max(
      1,
      Math.abs(zero.buyTco),
      Math.abs(zero.rentTco),
      Math.abs(full.buyTco),
      Math.abs(full.rentTco),
    ) * 1e-12;
  let breakEvenHoursMonth: number | null = null;
  let breakEvenDirection: BreakEvenDirection;
  if (Math.abs(slope * 730) <= epsilon)
    breakEvenDirection =
      Math.abs(intercept) <= epsilon
        ? "equal"
        : intercept < 0
          ? "always"
          : "never";
  else if (intercept <= epsilon && end <= epsilon) {
    breakEvenDirection =
      Math.abs(intercept) <= epsilon && slope < 0 ? "above" : "always";
    if (breakEvenDirection === "above") breakEvenHoursMonth = 0;
  } else if (intercept >= -epsilon && end >= -epsilon)
    breakEvenDirection = "never";
  else {
    breakEvenHoursMonth = Math.min(730, Math.max(0, -intercept / slope));
    breakEvenDirection = slope < 0 ? "above" : "below";
  }
  return { ...estimate, breakEvenHoursMonth, breakEvenDirection };
}

function quoteWarnings(
  quote: PriceQuote,
  kind: string,
  staleDays: number,
  asOf: number,
): string[] {
  const warnings: string[] = [];
  if (quote.kind === "Инженерная оценка")
    warnings.push(`${kind}: цена является инженерной оценкой.`);
  if (!quote.sourceUrl)
    warnings.push(
      `${kind}: отсутствует отдельный подтверждающий источник цены.`,
    );
  if (!quote.sourceDate) warnings.push(`${kind}: не указана дата цены.`);
  else {
    const days = (asOf - Date.parse(quote.sourceDate)) / 86_400_000;
    if (days < 0)
      warnings.push(
        `${kind}: дата источника находится в будущем относительно даты расчёта.`,
      );
    else if (days > staleDays)
      warnings.push(
        `${kind}: цена устарела (${Math.floor(days)} дней, допустимо ${staleDays}).`,
      );
  }
  return warnings;
}

export function calculate(
  config: AppConfig,
  input: CalculationInput,
): CalculationResult {
  validateInput(input);
  const evaluation = evaluateModels(config, input.taskIds, input.asOf);
  const enabledModels = config.models.filter((model) => model.enabled);
  if (!enabledModels.length)
    throw new Error("Для расчёта требуется хотя бы одна включённая модель.");
  const manualGpu =
    input.gpuId === "auto"
      ? undefined
      : config.gpus.find((gpu) => gpu.id === input.gpuId && gpu.enabled);
  type Candidate = {
    model: ModelConfig;
    plan: DeploymentPlan;
    cost: CostEstimate;
  };
  const candidates = new Map<string, Candidate>();
  const bestTco = (candidate: Candidate) =>
    Math.min(candidate.cost.buyTco, candidate.cost.rentTco);
  for (const model of enabledModels) {
    const profiles = config.deploymentProfiles.filter(
      (profile) =>
        profile.enabled &&
        profile.modelId === model.id &&
        (!manualGpu || profile.gpuId === manualGpu.id) &&
        config.gpus.some((gpu) => gpu.id === profile.gpuId && gpu.enabled),
    );
    const variants: Candidate[] = [];
    const failedProfiles: string[] = [];
    for (const profile of profiles.length ? profiles : [undefined]) {
      try {
        const gpu =
          manualGpu ??
          (profile
            ? config.gpus.find((gpu) => gpu.id === profile.gpuId)!
            : recommendedGpu(config, model));
        const plan = planModelDeployment(config, model, input, gpu, profile);
        const cost = estimateCosts(config, input, plan);
        if (
          ![
            cost.buyTco,
            cost.rentTco,
            plan.requiredTotalMemoryGb,
            plan.availableMemoryGb,
          ].every(Number.isFinite)
        )
          throw new Error(
            "Расчёт выходит за числовые пределы; проверьте память, нагрузку и цены.",
          );
        variants.push({ model, plan, cost });
      } catch (error) {
        failedProfiles.push(
          error instanceof Error
            ? error.message
            : "Не удалось рассчитать профиль запуска.",
        );
      }
    }
    if (!variants.length) {
      evaluation.rejectedReasons[model.id] = [
        ...(evaluation.rejectedReasons[model.id] ?? []),
        ...failedProfiles,
      ];
      continue;
    }
    variants.sort(
      (left, right) =>
        Number(left.plan.reasons.length > 0) -
          Number(right.plan.reasons.length > 0) ||
        Number(left.plan.confidence !== "measured") -
          Number(right.plan.confidence !== "measured") ||
        bestTco(left) - bestTco(right) ||
        left.plan.profile.id.localeCompare(right.plan.profile.id),
    );
    candidates.set(model.id, variants[0]);
  }
  if (
    input.modelId !== "auto" &&
    enabledModels.some((model) => model.id === input.modelId) &&
    !candidates.has(input.modelId)
  )
    throw new Error(
      `Выбранная модель не может быть рассчитана: ${(evaluation.rejectedReasons[input.modelId] ?? []).join(" ")}`,
    );
  if (!candidates.size)
    throw new Error(
      `Не удалось рассчитать ни одного профиля запуска: ${Object.values(evaluation.rejectedReasons).flat().slice(0, 3).join(" ")}`,
    );
  const eligibleIds = new Set(evaluation.eligible.map((model) => model.id));
  const ranked = [...candidates.values()]
    .filter(
      (candidate) =>
        eligibleIds.has(candidate.model.id) &&
        candidate.plan.reasons.length === 0,
    )
    .sort((left, right) => {
      if (input.priority === "quality")
        return (
          evaluation.qualityHeadroom[right.model.id] -
            evaluation.qualityHeadroom[left.model.id] ||
          bestTco(left) - bestTco(right) ||
          left.model.name.localeCompare(right.model.name, "ru")
        );
      if (input.priority === "cost")
        return (
          bestTco(left) - bestTco(right) ||
          evaluation.qualityHeadroom[right.model.id] -
            evaluation.qualityHeadroom[left.model.id] ||
          left.model.name.localeCompare(right.model.name, "ru")
        );
      return (
        evaluation.qualityHeadroom[left.model.id] -
          evaluation.qualityHeadroom[right.model.id] ||
        bestTco(left) - bestTco(right) ||
        left.model.name.localeCompare(right.model.name, "ru")
      );
    });
  const fallback = [...candidates.values()].sort(
    (left, right) =>
      Number(!eligibleIds.has(left.model.id)) -
        Number(!eligibleIds.has(right.model.id)) ||
      left.plan.reasons.length - right.plan.reasons.length ||
      evaluation.qualityHeadroom[right.model.id] -
        evaluation.qualityHeadroom[left.model.id] ||
      bestTco(left) - bestTco(right),
  )[0];
  const manual =
    input.modelId === "auto" ? undefined : candidates.get(input.modelId);
  const selected = manual ?? ranked[0] ?? fallback;
  const { model, plan, cost } = selected;
  const selectionReasons = [
    ...(evaluation.rejectedReasons[model.id] ?? []),
    ...plan.reasons,
  ];
  if (input.modelId !== "auto" && !manual)
    selectionReasons.push(
      "выбранная вручную модель недоступна; показан автоматический вариант",
    );
  if (input.gpuId !== "auto" && !manualGpu)
    selectionReasons.push(
      "выбранный вручную GPU недоступен; показана каталожная конфигурация",
    );
  const asOf = Date.parse(input.asOf ?? new Date().toISOString().slice(0, 10));
  const warnings = [
    ...plan.warnings,
    ...quoteWarnings(
      plan.gpu.purchaseQuote,
      "Покупка",
      config.assumptions.stalePriceDays,
      asOf,
    ),
    ...quoteWarnings(
      plan.gpu.rentalQuote,
      "Аренда",
      config.assumptions.stalePriceDays,
      asOf,
    ),
  ];
  const qualityAssessments = config.qualityAssessments.filter(
    (item) => item.modelId === model.id && input.taskIds.includes(item.taskId),
  );
  const missingQuality = evaluation.tasks.filter(
    (task) =>
      !qualityAssessments.some(
        (item) =>
          item.taskId === task.id && applicableAssessment(item, config, asOf),
      ),
  );
  if (missingQuality.length || evaluation.tasks.length === 0)
    warnings.push(
      "Класс качества без целевых измерений является экспертной оценкой; публичные характеристики модели не подтверждают качество на ваших задачах.",
    );
  for (const assessment of qualityAssessments.filter(
    (item) => item.status === "measured",
  )) {
    warnings.push(
      `Оценка качества ${assessment.id}: выборка ${assessment.sampleSize}; статистическая надёжность и переносимость на реальные документы требуют отдельной проверки.`,
    );
    if (Date.parse(assessment.sourceDate) > asOf)
      warnings.push(
        `Оценка качества ${assessment.id}: дата измерения находится в будущем.`,
      );
    else if (
      (asOf - Date.parse(assessment.sourceDate)) / 86_400_000 >
      config.assumptions.stalePriceDays
    )
      warnings.push(
        `Оценка качества ${assessment.id}: требуется проверка актуальности датасета и результатов.`,
      );
  }
  if (model.sourceDate && Date.parse(model.sourceDate) > asOf)
    warnings.push("Характеристики модели: дата источника находится в будущем.");
  if (input.rentalMode === "dedicated-node")
    warnings.push(
      "Выделенный узел: оплачиваются все GPU узла 730 часов в месяц; стоимость выведена из тарифа за GPU-час и требует отдельного предложения поставщика.",
    );
  for (const candidate of candidates.values())
    if (candidate.plan.reasons.length)
      evaluation.rejectedReasons[candidate.model.id] = [
        ...(evaluation.rejectedReasons[candidate.model.id] ?? []),
        ...candidate.plan.reasons,
      ];
  const result: CalculationResult = {
    ...cost,
    model,
    gpu: plan.gpu,
    profile: plan.profile,
    confidence: plan.confidence,
    warnings: [...new Set(warnings)],
    qualityAssessments,
    eligibleModels: ranked.map((candidate) => candidate.model),
    rejectedReasons: evaluation.rejectedReasons,
    requiredQualityTier: evaluation.req.qualityTier,
    requiredContextK: evaluation.req.contextK,
    requiredCapabilities: evaluation.req.capabilities,
    selectionValid: selectionReasons.length === 0,
    selectionReasons,
    effectiveInputTokens: plan.effectiveInputTokens,
    outputTokens: plan.outputTokens,
    effectiveConcurrency: plan.effectiveConcurrency,
    sessionsPerReplica: plan.sessionsPerReplica,
    replicas: plan.replicas,
    gpuCount: plan.gpuCount,
    nodes: plan.nodes,
    purchasedGpuCount: plan.purchasedGpuCount,
    requiredWeightMemoryGb: plan.requiredWeightMemoryGb,
    requiredKvMemoryGb: plan.requiredKvMemoryGb,
    requiredWorkspaceMemoryGb: plan.requiredWorkspaceMemoryGb,
    requiredTotalMemoryGb: plan.requiredTotalMemoryGb,
    availableMemoryGb: plan.availableMemoryGb,
    decision: cost.buyTco < cost.rentTco ? "buy" : "rent",
    plan,
    alternatives: ranked.slice(0, 5).map((candidate) => ({
      model: candidate.model,
      gpu: candidate.plan.gpu,
      profile: candidate.plan.profile,
      confidence: candidate.plan.confidence,
      gpuCount: candidate.plan.gpuCount,
      hourlyInfrastructureRub:
        candidate.plan.rentedGpuCount *
        candidate.plan.gpu.rentPerGpuHourRub *
        (1 + config.assumptions.rentalServicePct / 100),
      bestTcoRub: bestTco(candidate),
    })),
  };
  if (
    ![
      result.buyTco,
      result.rentTco,
      result.requiredTotalMemoryGb,
      result.availableMemoryGb,
    ].every(Number.isFinite)
  )
    throw new Error(
      "Расчёт выходит за числовые пределы: уменьшите нагрузку или стоимостные допущения.",
    );
  return result;
}

export type CashflowPoint = {
  month: number;
  buyCumulative: number;
  rentCumulative: number;
};
export function cumulativeCashflow(
  config: AppConfig,
  input: CalculationInput,
  result = calculate(config, input),
): CashflowPoint[] {
  const cost = estimateCosts(config, input, result.plan);
  const months = input.years * 12;
  const upfront = cost.buy.equipment + cost.buy.fitout + cost.buy.contingency;
  const monthlyOperating =
    (cost.buy.support +
      cost.buy.electricity +
      cost.buy.placement +
      cost.buy.networkStorage +
      cost.buy.operations) /
    months;
  return Array.from({ length: months + 1 }, (_, month) => ({
    month,
    buyCumulative:
      upfront +
      monthlyOperating * month -
      (month === months ? cost.buy.residual : 0),
    rentCumulative: cost.rentMonthly * month,
  }));
}

export type SensitivityScenario = {
  id: "optimistic" | "base" | "conservative";
  label: string;
  buyTco: number;
  rentTco: number;
  decision: "buy" | "rent";
  hoursMonth: number;
  purchaseMultiplier: number;
  rentalMultiplier: number;
};
export function calculateSensitivity(
  config: AppConfig,
  input: CalculationInput,
  result = calculate(config, input),
): { scenarios: SensitivityScenario[]; cashflow: CashflowPoint[] } {
  const definitions = [
    {
      id: "optimistic" as const,
      label: "В пользу покупки",
      purchaseMultiplier: 0.8,
      rentalMultiplier: 1.2,
    },
    {
      id: "base" as const,
      label: "Базовый",
      purchaseMultiplier: 1,
      rentalMultiplier: 1,
    },
    {
      id: "conservative" as const,
      label: "В пользу аренды",
      purchaseMultiplier: 1.2,
      rentalMultiplier: 0.8,
    },
  ];
  const scenarios = definitions.map((definition) => {
    // Keep the originally selected model, profile, replica count and hardware fixed.
    const plan = {
      ...result.plan,
      gpu: {
        ...result.gpu,
        nodePriceRub: result.gpu.nodePriceRub * definition.purchaseMultiplier,
        rentPerGpuHourRub:
          result.gpu.rentPerGpuHourRub * definition.rentalMultiplier,
      },
    };
    const atZero = costsAtHours(config, input, plan, 0);
    const atFull = costsAtHours(config, input, plan, 730);
    const moreHoursFavorPurchase =
      atFull.buyTco - atFull.rentTco < atZero.buyTco - atZero.rentTco;
    // A dedicated rental has fixed compute cost: more operating hours can favor renting.
    const increaseHours =
      definition.id === "optimistic"
        ? moreHoursFavorPurchase
        : !moreHoursFavorPurchase;
    const hoursMonth =
      definition.id === "base"
        ? input.hoursMonth
        : Math.min(730, input.hoursMonth * (increaseHours ? 1.25 : 0.75));
    const costs = estimateCosts(config, { ...input, hoursMonth }, plan);
    return {
      ...definition,
      hoursMonth,
      buyTco: costs.buyTco,
      rentTco: costs.rentTco,
      decision:
        costs.buyTco < costs.rentTco ? ("buy" as const) : ("rent" as const),
    };
  });
  return { scenarios, cashflow: cumulativeCashflow(config, input, result) };
}

export const formatRub = (n: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
export const compactRub = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)} млрд ₽`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)} млн ₽`
      : `${Math.round(n / 1000)} тыс. ₽`;
