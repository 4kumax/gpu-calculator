import { AppConfig, Capability, GpuConfig, ModelConfig, QualityTier, TaskRule, modelWeightGb } from "@/lib/config";

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

export type CalculationResult = {
  model: ModelConfig;
  gpu: GpuConfig;
  eligibleModels: ModelConfig[];
  rejectedReasons: Record<string, string[]>;
  requiredQualityTier: QualityTier;
  requiredContextK: number;
  requiredCapabilities: Capability[];
  selectionValid: boolean;
  selectionReasons: string[];
  replicas: number;
  gpuCount: number;
  nodes: number;
  purchasedGpuCount: number;
  requiredWeightMemoryGb: number;
  availableMemoryGb: number;
  monthlyPowerRub: number;
  rentMonthly: number;
  buyMonthlyAverage: number;
  rentTco: number;
  buyTco: number;
  breakEvenHoursMonth: number | null;
  decision: "buy" | "rent";
  buy: CostBreakdown;
  alternatives: Array<{model: ModelConfig; gpu: GpuConfig; gpuCount: number; hourlyInfrastructureRub: number; bestTcoRub: number}>;
};

export type DeploymentPlan = {
  gpu: GpuConfig;
  requiredWeightMemoryPerReplicaGb: number;
  requiredWeightMemoryGb: number;
  baseGpuCount: number;
  replicas: number;
  gpuCount: number;
  workloadNodes: number;
  reserveNodes: number;
  nodes: number;
  purchasedGpuCount: number;
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
  buy: CostBreakdown;
};

function requirements(tasks: TaskRule[]): {qualityTier: QualityTier; contextK: number; capabilities: Capability[]} {
  const capabilities = Array.from(new Set(tasks.flatMap(t => t.requiredCapabilities)));
  return {
    qualityTier: Math.max(1, ...tasks.map(t => t.minQualityTier)) as QualityTier,
    contextK: Math.max(1, ...tasks.map(t => t.minContextK)),
    capabilities
  };
}

export function evaluateModels(config: AppConfig, taskIds: string[]) {
  const tasks = config.tasks.filter(t => t.enabled && taskIds.includes(t.id));
  const req = requirements(tasks);
  const rejectedReasons: Record<string, string[]> = {};
  const eligible = config.models.filter(model => {
    if (!model.enabled) return false;
    const reasons: string[] = [];
    if (model.qualityTier < req.qualityTier) reasons.push(`класс качества ${model.qualityTier} ниже требуемого ${req.qualityTier}`);
    if (model.maxContextK < req.contextK) reasons.push(`максимальный контекст ${model.maxContextK} тыс. ниже требуемого ${req.contextK} тыс.`);
    for (const capability of req.capabilities) if (!model.capabilities.includes(capability)) reasons.push(`нет возможности «${capability}»`);
    if (reasons.length) rejectedReasons[model.id] = reasons;
    return reasons.length === 0;
  }).sort((a,b) => a.qualityTier-b.qualityTier || a.name.localeCompare(b.name, "ru"));
  return {tasks, req, eligible, rejectedReasons};
}

function recommendedGpu(config: AppConfig, model: ModelConfig) {
  const enabledGpus = config.gpus.filter(gpu => gpu.enabled);
  const gpu = enabledGpus.find(item => item.id === model.recommendedGpuId) ?? enabledGpus[0];
  if (!gpu) throw new Error("Для расчёта требуется хотя бы один включённый GPU.");
  return gpu;
}

export function planModelDeployment(config: AppConfig, model: ModelConfig, input: CalculationInput, selectedGpu?: GpuConfig): DeploymentPlan {
  const gpu = selectedGpu ?? recommendedGpu(config, model);
  const a = config.assumptions;
  const requiredWeightMemoryPerReplicaGb = modelWeightGb(model) * (1 + a.memoryOverheadPct / 100);
  const memoryFloor = Math.max(1, Math.ceil(requiredWeightMemoryPerReplicaGb / (gpu.memoryGb * a.usableMemoryPct / 100)));
  const baseGpuCount = Math.max(model.minGpuCount, memoryFloor);
  const shareFactor = Math.max(.01, input.largeModelSharePct / 100);
  const replicas = Math.max(1, Math.ceil(input.concurrency * shareFactor / Math.max(1, model.sessionsPerReplica)));
  const gpuCount = baseGpuCount * replicas;
  const requiredWeightMemoryGb = requiredWeightMemoryPerReplicaGb * replicas;
  const workloadNodes = Math.ceil(gpuCount / gpu.nodeGpuCount);
  const reserveNodes = input.reserveMode === "nplus1" ? 1 : 0;
  const nodes = workloadNodes + reserveNodes;
  const purchasedGpuCount = nodes * gpu.nodeGpuCount;
  const availableMemoryGb = purchasedGpuCount * gpu.memoryGb;
  const rentedGpuCount = gpuCount + reserveNodes * gpu.nodeGpuCount;
  return {gpu,requiredWeightMemoryPerReplicaGb,requiredWeightMemoryGb,baseGpuCount,replicas,gpuCount,workloadNodes,reserveNodes,nodes,purchasedGpuCount,availableMemoryGb,rentedGpuCount};
}

function estimateCosts(config: AppConfig, input: CalculationInput, plan: DeploymentPlan): CostEstimate {
  const {gpu,nodes,workloadNodes,reserveNodes,rentedGpuCount} = plan;
  const a = config.assumptions;
  const months = input.years * 12;
  const capex = nodes * gpu.nodePriceRub;
  const fitout = capex * a.fitoutPctCapex / 100;
  const contingency = capex * a.contingencyPct / 100;
  const support = capex * a.supportPctCapexYear / 100 * input.years;
  const activeShare = Math.min(1, input.hoursMonth / 730);
  const averagePowerFactor = a.idlePowerPct / 100 + (1 - a.idlePowerPct / 100) * activeShare;
  const monthlyPowerRub = (workloadNodes * averagePowerFactor + reserveNodes * a.idlePowerPct / 100) * gpu.nodePowerKw * 730 * a.pue * a.electricityRubKwh;
  const electricity = monthlyPowerRub * months;
  const placement = nodes * a.rackMonthPerNodeRub * months;
  const networkStorage = a.networkStorageMonthRub * months;
  const operations = a.operationsMonthRub * months;
  const residual = capex * a.residualValuePct / 100;
  const buyTco = capex + fitout + contingency + support + electricity + placement + networkStorage + operations - residual;
  const rentComputeMonthly = rentedGpuCount * gpu.rentPerGpuHourRub * input.hoursMonth * (1 + a.rentalServicePct / 100);
  const rentMonthly = rentComputeMonthly + a.networkStorageMonthRub + a.operationsMonthRub;
  const rentTco = rentMonthly * months;
  const buyMonthlyAverage = buyTco / months;
  const variableRentHour = rentedGpuCount * gpu.rentPerGpuHourRub * (1 + a.rentalServicePct / 100);
  const activeEnergyHour = workloadNodes * gpu.nodePowerKw * (1 - a.idlePowerPct/100) * a.pue * a.electricityRubKwh;
  const fixedMonthlyDifference = (capex + fitout + contingency + support - residual) / months + nodes * a.rackMonthPerNodeRub + nodes * gpu.nodePowerKw * 730 * (a.idlePowerPct/100) * a.pue * a.electricityRubKwh;
  const variableMonthlySavingsPerHour = variableRentHour - activeEnergyHour;
  const rawBreakEvenHoursMonth = variableMonthlySavingsPerHour > 0 ? Math.max(0, fixedMonthlyDifference / variableMonthlySavingsPerHour) : fixedMonthlyDifference <= 0 ? 0 : null;
  const breakEvenHoursMonth = rawBreakEvenHoursMonth !== null && rawBreakEvenHoursMonth <= 730 ? rawBreakEvenHoursMonth : null;
  return {monthlyPowerRub,rentMonthly,buyMonthlyAverage,rentTco,buyTco,breakEvenHoursMonth,buy:{equipment:capex,fitout,contingency,support,electricity,placement,networkStorage,operations,residual,total:buyTco}};
}

export function calculate(config: AppConfig, input: CalculationInput): CalculationResult {
  if (!Number.isFinite(input.hoursMonth) || input.hoursMonth < 0 || input.hoursMonth > 730) throw new Error("Использование должно быть в диапазоне от 0 до 730 часов в месяц.");
  if (!Number.isInteger(input.years) || input.years < 1) throw new Error("Горизонт расчёта должен быть положительным целым числом лет.");
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1) throw new Error("Пиковая параллельность должна быть положительным целым числом.");
  if (!Number.isFinite(input.largeModelSharePct) || input.largeModelSharePct <= 0 || input.largeModelSharePct > 100) throw new Error("Доля нагрузки должна быть больше 0 и не превышать 100%.");
  const evaluation = evaluateModels(config, input.taskIds);
  const enabledModels = config.models.filter(model => model.enabled);
  if (!enabledModels.length) throw new Error("Для расчёта требуется хотя бы одна включённая модель.");

  const plans = new Map<string, DeploymentPlan>();
  const costs = new Map<string, CostEstimate>();
  const planFor = (model: ModelConfig) => {
    const existing = plans.get(model.id);
    if (existing) return existing;
    const plan = planModelDeployment(config, model, input);
    plans.set(model.id, plan);
    return plan;
  };
  const costFor = (model: ModelConfig) => {
    const existing = costs.get(model.id);
    if (existing) return existing;
    const estimate = estimateCosts(config, input, planFor(model));
    costs.set(model.id, estimate);
    return estimate;
  };
  const bestTco = (model: ModelConfig) => Math.min(costFor(model).buyTco, costFor(model).rentTco);
  const rankedEligible = [...evaluation.eligible].sort((left,right) => {
    if (input.priority === "quality") return right.qualityTier-left.qualityTier || bestTco(left)-bestTco(right) || left.name.localeCompare(right.name, "ru");
    if (input.priority === "cost") return bestTco(left)-bestTco(right) || right.qualityTier-left.qualityTier || left.name.localeCompare(right.name, "ru");
    const leftExcess = left.qualityTier - evaluation.req.qualityTier;
    const rightExcess = right.qualityTier - evaluation.req.qualityTier;
    return leftExcess-rightExcess || bestTco(left)-bestTco(right) || left.name.localeCompare(right.name, "ru");
  });
  const fallbackModel = [...enabledModels].sort((left,right) => right.qualityTier-left.qualityTier || bestTco(left)-bestTco(right) || left.name.localeCompare(right.name, "ru"))[0];
  const autoModel = rankedEligible[0] ?? fallbackModel;
  const manualModel = input.modelId === "auto" ? undefined : enabledModels.find(candidate => candidate.id === input.modelId);
  const requestedModel = input.modelId === "auto" ? autoModel : manualModel ?? autoModel;
  const model = requestedModel;
  const autoGpu = recommendedGpu(config, model);
  const manualGpu = input.gpuId === "auto" ? undefined : config.gpus.find(candidate => candidate.id === input.gpuId && candidate.enabled);
  const gpu = input.gpuId === "auto" ? autoGpu : manualGpu ?? autoGpu;
  const selectionReasons: string[] = [];
  if (input.modelId !== "auto" && !manualModel) selectionReasons.push("выбранная вручную модель недоступна; показан автоматический вариант");
  if (!evaluation.eligible.some(candidate => candidate.id === model.id)) selectionReasons.push(...(evaluation.rejectedReasons[model.id] ?? ["модель недоступна для выбранного набора задач"]));
  if (input.gpuId !== "auto" && !manualGpu) selectionReasons.push("выбранный вручную GPU недоступен; показана каталожная конфигурация");
  else if (manualGpu && manualGpu.id !== model.recommendedGpuId) selectionReasons.push(`для ${manualGpu.name} не подтверждены производительность, межсоединение и формат весов; проверена только вместимость памяти`);
  const selectionValid = selectionReasons.length === 0;
  const plan = planModelDeployment(config, model, input, gpu);
  const estimate = estimateCosts(config, input, plan);
  const alternatives = rankedEligible.slice(0, 5).map(candidate => {
    const candidatePlan = planFor(candidate);
    return {model:candidate,gpu:candidatePlan.gpu,gpuCount:candidatePlan.gpuCount,hourlyInfrastructureRub:candidatePlan.rentedGpuCount*candidatePlan.gpu.rentPerGpuHourRub*(1+config.assumptions.rentalServicePct/100),bestTcoRub:bestTco(candidate)};
  });
  return {
    model,gpu,eligibleModels:evaluation.eligible,rejectedReasons:evaluation.rejectedReasons,
    requiredQualityTier:evaluation.req.qualityTier,requiredContextK:evaluation.req.contextK,requiredCapabilities:evaluation.req.capabilities,
    selectionValid,selectionReasons,
    replicas:plan.replicas,gpuCount:plan.gpuCount,nodes:plan.nodes,purchasedGpuCount:plan.purchasedGpuCount,requiredWeightMemoryGb:plan.requiredWeightMemoryGb,availableMemoryGb:plan.availableMemoryGb,monthlyPowerRub:estimate.monthlyPowerRub,
    rentMonthly:estimate.rentMonthly,buyMonthlyAverage:estimate.buyMonthlyAverage,rentTco:estimate.rentTco,buyTco:estimate.buyTco,breakEvenHoursMonth:estimate.breakEvenHoursMonth,decision:estimate.buyTco<estimate.rentTco?"buy":"rent",
    buy:estimate.buy,alternatives
  };
}

export const formatRub = (n:number) => new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(n);
export const compactRub = (n:number) => n >= 1e9 ? `${(n/1e9).toFixed(2)} млрд ₽` : n >= 1e6 ? `${(n/1e6).toFixed(n>=1e7?1:2)} млн ₽` : `${Math.round(n/1000)} тыс. ₽`;
