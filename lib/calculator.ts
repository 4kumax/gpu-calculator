import { AppConfig, Capability, GpuConfig, ModelConfig, TaskRule } from "@/lib/config";

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
  requiredLevel: number;
  requiredContextK: number;
  requiredCapabilities: Capability[];
  replicas: number;
  gpuCount: number;
  nodes: number;
  purchasedGpuCount: number;
  requiredMemoryGb: number;
  availableMemoryGb: number;
  monthlyPowerRub: number;
  rentMonthly: number;
  buyMonthlyAverage: number;
  rentTco: number;
  buyTco: number;
  breakEvenHoursMonth: number | null;
  decision: "buy" | "rent";
  buy: CostBreakdown;
  alternatives: Array<{model: ModelConfig; gpu: GpuConfig; hourlyInfrastructureRub: number}>;
};

function requirements(tasks: TaskRule[]) {
  const capabilities = Array.from(new Set(tasks.flatMap(t => t.requiredCapabilities)));
  return {
    level: Math.max(1, ...tasks.map(t => t.minLevel)),
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
    if (model.level < req.level) reasons.push(`уровень ${model.level} ниже требуемого ${req.level}`);
    if (model.contextK < req.contextK) reasons.push(`контекст ${model.contextK} тыс. ниже требуемого ${req.contextK} тыс.`);
    for (const capability of req.capabilities) if (!model.capabilities.includes(capability)) reasons.push(`нет возможности «${capability}»`);
    if (reasons.length) rejectedReasons[model.id] = reasons;
    return reasons.length === 0;
  }).sort((a,b) => a.level-b.level || a.totalParamsB-b.totalParamsB);
  return {tasks, req, eligible, rejectedReasons};
}

function modelHourlyCost(model: ModelConfig, gpu: GpuConfig) {
  return model.minGpuCount * gpu.rentPerGpuHourRub;
}

export function calculate(config: AppConfig, input: CalculationInput): CalculationResult {
  const evaluation = evaluateModels(config, input.taskIds);
  const fallbackModels = config.models.filter(m => m.enabled).sort((a,b) => a.level-b.level);
  const rankedEligible = [...evaluation.eligible].sort((left,right) => {
    if (input.priority === "quality") return right.level-left.level || right.totalParamsB-left.totalParamsB;
    if (input.priority === "cost") {
      const leftGpu=config.gpus.find(g=>g.id===left.recommendedGpuId) ?? config.gpus[0];
      const rightGpu=config.gpus.find(g=>g.id===right.recommendedGpuId) ?? config.gpus[0];
      return modelHourlyCost(left,leftGpu)-modelHourlyCost(right,rightGpu);
    }
    return left.level-right.level || left.totalParamsB-right.totalParamsB;
  });
  const autoModel = rankedEligible[0] ?? fallbackModels[fallbackModels.length-1];
  const model = input.modelId === "auto" ? autoModel : config.models.find(m => m.id === input.modelId && m.enabled) ?? autoModel;
  const recommendedGpu = config.gpus.find(g => g.id === model.recommendedGpuId && g.enabled) ?? config.gpus.find(g => g.enabled)!;
  const gpu = input.gpuId === "auto" ? recommendedGpu : config.gpus.find(g => g.id === input.gpuId && g.enabled) ?? recommendedGpu;
  const a = config.assumptions;
  const requiredMemoryGb = model.totalParamsB * model.bitsPerWeight / 8 * (1 + a.memoryOverheadPct / 100);
  const memoryFloor = Math.max(1, Math.ceil(requiredMemoryGb / (gpu.memoryGb * a.usableMemoryPct / 100)));
  const baseGpuCount = gpu.id === model.recommendedGpuId ? model.minGpuCount : Math.max(model.minGpuCount, memoryFloor);
  const replicas = Math.max(1, Math.ceil(input.concurrency / Math.max(1, model.sessionsPerReplica)));
  const shareFactor = Math.max(.01, input.largeModelSharePct / 100);
  const onlineReplicas = Math.max(1, Math.ceil(replicas * shareFactor));
  const gpuCount = baseGpuCount * onlineReplicas;
  const workloadNodes = Math.ceil(gpuCount / gpu.nodeGpuCount);
  const reserveNodes = input.reserveMode === "nplus1" ? 1 : 0;
  const nodes = workloadNodes + reserveNodes;
  const purchasedGpuCount = nodes * gpu.nodeGpuCount;
  const availableMemoryGb = purchasedGpuCount * gpu.memoryGb;
  const months = input.years * 12;
  const capex = nodes * gpu.nodePriceRub;
  const fitout = capex * a.fitoutPctCapex / 100;
  const contingency = capex * a.contingencyPct / 100;
  const support = capex * a.supportPctCapexYear / 100 * input.years;
  const activeShare = Math.min(1, input.hoursMonth / 730);
  const averagePowerFactor = a.idlePowerPct / 100 + (1 - a.idlePowerPct / 100) * activeShare;
  const monthlyPowerRub = nodes * gpu.nodePowerKw * 730 * averagePowerFactor * a.pue * a.electricityRubKwh;
  const electricity = monthlyPowerRub * months;
  const placement = nodes * a.rackMonthPerNodeRub * months;
  const networkStorage = a.networkStorageMonthRub * months;
  const operations = a.operationsMonthRub * months;
  const residual = capex * a.residualValuePct / 100;
  const buyTco = capex + fitout + contingency + support + electricity + placement + networkStorage + operations - residual;
  const rentedGpuCount = gpuCount + reserveNodes * gpu.nodeGpuCount;
  const rentComputeMonthly = rentedGpuCount * gpu.rentPerGpuHourRub * input.hoursMonth * (1 + a.rentalServicePct / 100);
  const rentMonthly = rentComputeMonthly + a.networkStorageMonthRub + a.operationsMonthRub;
  const rentTco = rentMonthly * months;
  const buyMonthlyAverage = buyTco / months;
  const variableRentHour = rentedGpuCount * gpu.rentPerGpuHourRub * (1 + a.rentalServicePct / 100);
  const activeEnergyHour = nodes * gpu.nodePowerKw * (1 - a.idlePowerPct/100) * a.pue * a.electricityRubKwh;
  const fixedMonthlyBuy = (capex + fitout + contingency + support - residual) / months + nodes * a.rackMonthPerNodeRub + a.networkStorageMonthRub + a.operationsMonthRub + nodes * gpu.nodePowerKw * 730 * (a.idlePowerPct/100) * a.pue * a.electricityRubKwh;
  const denominator = variableRentHour - activeEnergyHour;
  const breakEvenHoursMonth = denominator > 0 ? fixedMonthlyBuy / denominator : null;
  const alternatives = evaluation.eligible.slice(0, 5).map(candidate => {
    const candidateGpu = config.gpus.find(g => g.id === candidate.recommendedGpuId && g.enabled) ?? gpu;
    return {model:candidate,gpu:candidateGpu,hourlyInfrastructureRub:modelHourlyCost(candidate,candidateGpu)};
  }).sort((x,y) => x.hourlyInfrastructureRub-y.hourlyInfrastructureRub);
  return {
    model,gpu,eligibleModels:evaluation.eligible,rejectedReasons:evaluation.rejectedReasons,
    requiredLevel:evaluation.req.level,requiredContextK:evaluation.req.contextK,requiredCapabilities:evaluation.req.capabilities,
    replicas:onlineReplicas,gpuCount,nodes,purchasedGpuCount,requiredMemoryGb,availableMemoryGb,monthlyPowerRub,
    rentMonthly,buyMonthlyAverage,rentTco,buyTco,breakEvenHoursMonth,decision:buyTco<rentTco?"buy":"rent",
    buy:{equipment:capex,fitout,contingency,support,electricity,placement,networkStorage,operations,residual,total:buyTco},alternatives
  };
}

export const formatRub = (n:number) => new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(n);
export const compactRub = (n:number) => n >= 1e9 ? `${(n/1e9).toFixed(2)} млрд ₽` : n >= 1e6 ? `${(n/1e6).toFixed(n>=1e7?1:2)} млн ₽` : `${Math.round(n/1000)} тыс. ₽`;
