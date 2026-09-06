export type PriceKind =
  "Публичная цена" | "Коммерческая оценка" | "Инженерная оценка";
export type Capability =
  | "текст"
  | "код"
  | "изображения"
  | "инструменты"
  | "длинный контекст"
  | "агенты";
export type QualityTier = 1 | 2 | 3 | 4 | 5;

export const MAX_QUALITY_TIER = 5;
export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  1: "Базовый",
  2: "Стандартный",
  3: "Продвинутый",
  4: "Frontier",
  5: "Верхний frontier",
};

export type ModelConfig = {
  id: string;
  enabled: boolean;
  name: string;
  developer: string;
  architecture: "Dense" | "MoE";
  totalParamsB: number;
  activeParamsB: number;
  nativeContextK: number;
  maxContextK: number;
  bitsPerWeight: number;
  checkpointWeightGb?: number;
  qualityTier: QualityTier;
  capabilities: Capability[];
  recommendedGpuId: string;
  minGpuCount: number;
  sessionsPerReplica: number;
  precision: string;
  license: string;
  note: string;
  sourceUrl: string;
  sourceDate: string;
  evidence:
    | "Публичные характеристики"
    | "Конфигурация проверена поставщиком"
    | "Инженерная оценка";
};

export type PriceQuote = {
  sourceUrl: string;
  sourceDate: string;
  sourceLabel: string;
  kind: PriceKind;
  terms: string;
};

export type GpuConfig = {
  id: string;
  enabled: boolean;
  name: string;
  vendor: string;
  memoryGb: number;
  nodeGpuCount: number;
  nodePriceRub: number;
  rentPerGpuHourRub: number;
  nodePowerKw: number;
  memoryBandwidthTb: number;
  interconnect: string;
  purchaseQuote: PriceQuote;
  rentalQuote: PriceQuote;
  /** Legacy provenance retained for schema-2 migration; calculations use separate quotes. */
  priceKind: PriceKind;
  sourceLabel: string;
  sourceUrl: string;
  sourceDate: string;
};

export type TaskRule = {
  id: string;
  enabled: boolean;
  title: string;
  description: string;
  category: string;
  minQualityTier: QualityTier;
  minContextK: number;
  requiredCapabilities: Capability[];
};

export type Assumptions = {
  defaultHoursMonth: number;
  defaultYears: number;
  defaultConcurrency: number;
  electricityRubKwh: number;
  pue: number;
  supportPctCapexYear: number;
  fitoutPctCapex: number;
  idlePowerPct: number;
  memoryOverheadPct: number;
  usableMemoryPct: number;
  rackMonthPerNodeRub: number;
  networkStorageMonthRub: number;
  operationsMonthRub: number;
  rentalServicePct: number;
  contingencyPct: number;
  residualValuePct: number;
  stalePriceDays: number;
};

export type DeploymentProfile = {
  id: string;
  enabled: boolean;
  modelId: string;
  gpuId: string;
  engine: string;
  engineVersion: string;
  precision: string;
  gpuCount: number;
  tensorParallel: number;
  pipelineParallel: number;
  maxContextTokens: number;
  maxConcurrency: number;
  kvCacheGbPer1kTokens: number;
  workspaceGbPerGpu: number;
  status: "estimated" | "measured";
  sourceUrl: string;
  sourceDate: string;
  notes: string;
  benchmark?: {
    inputTokens: number;
    outputTokens: number;
    concurrency: number;
    ttftMs: number;
    /** Per-request output throughput at the recorded concurrency. */
    tokensPerSecond: number;
  };
};

export type QualityAssessment = {
  id: string;
  modelId: string;
  taskId: string;
  status: "planned" | "measured";
  qualityTier: QualityTier;
  sampleSize: number;
  dataset: string;
  sourceUrl: string;
  sourceDate: string;
  notes: string;
  correctAnswerPct?: number;
  extractionErrorPct?: number;
  toolSuccessPct?: number;
};

export type AppConfig = {
  schemaVersion: 3;
  catalogVersion: string;
  revision: number;
  updatedAt: string;
  assumptions: Assumptions;
  models: ModelConfig[];
  gpus: GpuConfig[];
  tasks: TaskRule[];
  deploymentProfiles: DeploymentProfile[];
  qualityAssessments: QualityAssessment[];
};

type LegacyAppConfig = Omit<
  AppConfig,
  | "schemaVersion"
  | "catalogVersion"
  | "gpus"
  | "deploymentProfiles"
  | "qualityAssessments"
> & {
  schemaVersion: 2;
  gpus: Omit<GpuConfig, "purchaseQuote" | "rentalQuote">[];
};

export const STORAGE_KEY = "gpu-calculator:settings:v3";
export const LEGACY_STORAGE_KEY = "gpu-calculator:settings:v2";

const LEGACY_DEFAULT_CONFIG: LegacyAppConfig = {
  schemaVersion: 2,
  revision: 2,
  updatedAt: "2026-09-02T00:00:00.000Z",
  assumptions: {
    defaultHoursMonth: 360,
    defaultYears: 3,
    defaultConcurrency: 8,
    electricityRubKwh: 9.5,
    pue: 1.4,
    supportPctCapexYear: 10,
    fitoutPctCapex: 15,
    idlePowerPct: 30,
    memoryOverheadPct: 12,
    usableMemoryPct: 90,
    rackMonthPerNodeRub: 65_000,
    networkStorageMonthRub: 120_000,
    operationsMonthRub: 350_000,
    rentalServicePct: 5,
    contingencyPct: 5,
    residualValuePct: 0,
    stalePriceDays: 90,
  },
  gpus: [
    {
      id: "rtx4090",
      enabled: true,
      name: "RTX 4090 24 ГБ",
      vendor: "NVIDIA",
      memoryGb: 24,
      nodeGpuCount: 4,
      nodePriceRub: 2_800_000,
      rentPerGpuHourRub: 80,
      nodePowerKw: 2.6,
      memoryBandwidthTb: 1.01,
      interconnect: "PCIe",
      priceKind: "Инженерная оценка",
      sourceLabel: "Рыночная оценка РФ",
      sourceUrl: "",
      sourceDate: "2026-09-02",
    },
    {
      id: "l40s",
      enabled: true,
      name: "L40S 48 ГБ",
      vendor: "NVIDIA",
      memoryGb: 48,
      nodeGpuCount: 8,
      nodePriceRub: 16_000_000,
      rentPerGpuHourRub: 190,
      nodePowerKw: 4.8,
      memoryBandwidthTb: 0.864,
      interconnect: "PCIe",
      priceKind: "Инженерная оценка",
      sourceLabel: "Рыночная оценка РФ",
      sourceUrl: "",
      sourceDate: "2026-09-02",
    },
    {
      id: "a100",
      enabled: true,
      name: "A100 80 ГБ",
      vendor: "NVIDIA",
      memoryGb: 80,
      nodeGpuCount: 8,
      nodePriceRub: 18_000_000,
      rentPerGpuHourRub: 427,
      nodePowerKw: 6.5,
      memoryBandwidthTb: 2.04,
      interconnect: "NVLink / NVSwitch",
      priceKind: "Коммерческая оценка",
      sourceLabel: "Cloud.ru",
      sourceUrl:
        "https://cloud.ru/documents/tariffs/evolution/evolution-compute-gpu",
      sourceDate: "2026-09-02",
    },
    {
      id: "h100",
      enabled: true,
      name: "H100 80 ГБ",
      vendor: "NVIDIA",
      memoryGb: 80,
      nodeGpuCount: 8,
      nodePriceRub: 27_465_738,
      rentPerGpuHourRub: 570,
      nodePowerKw: 10.2,
      memoryBandwidthTb: 3.35,
      interconnect: "NVLink / NVSwitch",
      priceKind: "Публичная цена",
      sourceLabel: "Cloud.ru / Servermall",
      sourceUrl: "https://servermall.ru/sets/servery-nvidia/",
      sourceDate: "2026-09-02",
    },
    {
      id: "h100nvl",
      enabled: true,
      name: "H100 NVL 94 ГБ",
      vendor: "NVIDIA",
      memoryGb: 94,
      nodeGpuCount: 4,
      nodePriceRub: 22_000_000,
      rentPerGpuHourRub: 490,
      nodePowerKw: 4.8,
      memoryBandwidthTb: 3.9,
      interconnect: "NVLink bridge",
      priceKind: "Инженерная оценка",
      sourceLabel: "Рыночная оценка РФ",
      sourceUrl: "https://selectel.ru/graphics-card-nvidia-h100-94gb/",
      sourceDate: "2026-09-02",
    },
    {
      id: "h200",
      enabled: true,
      name: "H200 141 ГБ",
      vendor: "NVIDIA",
      memoryGb: 141,
      nodeGpuCount: 8,
      nodePriceRub: 34_157_144,
      rentPerGpuHourRub: 587.67,
      nodePowerKw: 10.2,
      memoryBandwidthTb: 4.8,
      interconnect: "NVLink / NVSwitch",
      priceKind: "Публичная цена",
      sourceLabel: "Selectel / ServerICT",
      sourceUrl: "https://serverict.com/servers-gpu/asus/asus-h200-nvidia/",
      sourceDate: "2026-09-02",
    },
    {
      id: "mi300x",
      enabled: true,
      name: "Instinct MI300X 192 ГБ",
      vendor: "AMD",
      memoryGb: 192,
      nodeGpuCount: 8,
      nodePriceRub: 32_000_000,
      rentPerGpuHourRub: 600,
      nodePowerKw: 8.0,
      memoryBandwidthTb: 5.3,
      interconnect: "Infinity Fabric",
      priceKind: "Инженерная оценка",
      sourceLabel: "Инженерная оценка",
      sourceUrl:
        "https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html",
      sourceDate: "2026-09-02",
    },
    {
      id: "b200",
      enabled: true,
      name: "B200 180 ГБ",
      vendor: "NVIDIA",
      memoryGb: 180,
      nodeGpuCount: 8,
      nodePriceRub: 52_724_649,
      rentPerGpuHourRub: 950,
      nodePowerKw: 14.3,
      memoryBandwidthTb: 8,
      interconnect: "NVLink / NVSwitch",
      priceKind: "Коммерческая оценка",
      sourceLabel: "ServerICT; аренда — оценка",
      sourceUrl: "https://serverict.com/server/nvidia/nvidia-dgx-b200/",
      sourceDate: "2026-09-02",
    },
    {
      id: "gb200",
      enabled: true,
      name: "GB200 192 ГБ",
      vendor: "NVIDIA",
      memoryGb: 192,
      nodeGpuCount: 4,
      nodePriceRub: 35_000_000,
      rentPerGpuHourRub: 1100,
      nodePowerKw: 8,
      memoryBandwidthTb: 8,
      interconnect: "NVLink-C2C / NVL",
      priceKind: "Инженерная оценка",
      sourceLabel: "Инженерная оценка",
      sourceUrl: "https://www.nvidia.com/en-us/data-center/gb200-nvl72/",
      sourceDate: "2026-09-02",
    },
    {
      id: "gb300",
      enabled: true,
      name: "GB300 288 ГБ",
      vendor: "NVIDIA",
      memoryGb: 288,
      nodeGpuCount: 4,
      nodePriceRub: 45_000_000,
      rentPerGpuHourRub: 1350,
      nodePowerKw: 8.5,
      memoryBandwidthTb: 8,
      interconnect: "NVLink-C2C / NVL",
      priceKind: "Инженерная оценка",
      sourceLabel: "Инженерная оценка",
      sourceUrl: "https://www.nvidia.com/en-us/data-center/gb300-nvl72/",
      sourceDate: "2026-09-02",
    },
  ],
  models: [
    {
      id: "ministral3-8b",
      enabled: true,
      name: "Ministral 3 8B Reasoning",
      developer: "Mistral AI",
      architecture: "Dense",
      totalParamsB: 9,
      activeParamsB: 9,
      nativeContextK: 262,
      maxContextK: 262,
      bitsPerWeight: 16,
      qualityTier: 1,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "rtx4090",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "BF16",
      license: "Apache-2.0",
      note: "Компактная мультимодальная reasoning-модель для локальных помощников.",
      sourceUrl:
        "https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "gpt-oss-20b",
      enabled: true,
      name: "GPT-OSS 20B",
      developer: "OpenAI",
      architecture: "MoE",
      totalParamsB: 21,
      activeParamsB: 3.6,
      nativeContextK: 131,
      maxContextK: 131,
      bitsPerWeight: 4,
      qualityTier: 1,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "rtx4090",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "MXFP4",
      license: "Apache-2.0 / Usage Policy",
      note: "Быстрая модель рассуждения и инструментальных вызовов.",
      sourceUrl: "https://huggingface.co/openai/gpt-oss-20b",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "qwen38-27b",
      enabled: true,
      name: "Qwen3.8 27B",
      developer: "Alibaba Qwen",
      architecture: "Dense",
      totalParamsB: 27,
      activeParamsB: 27,
      nativeContextK: 262,
      maxContextK: 1000,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Apache-2.0",
      note: "Сильная компактная мультимодальная модель для кода, видео и агентных задач.",
      sourceUrl: "https://huggingface.co/Qwen/Qwen3.8-27B-FP8",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "tpro-it-21",
      enabled: true,
      name: "T-pro-it 2.1 33B",
      developer: "Т-Технологии",
      architecture: "Dense",
      totalParamsB: 33,
      activeParamsB: 33,
      nativeContextK: 41,
      maxContextK: 131,
      bitsPerWeight: 16,
      qualityTier: 2,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h200",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "BF16",
      license: "Apache-2.0",
      note: "Русскоязычный корпоративный ассистент; контекст свыше 41 тыс. требует YaRN.",
      sourceUrl: "https://huggingface.co/t-tech/T-pro-it-2.1",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "gpt-oss-120b",
      enabled: true,
      name: "GPT-OSS 120B",
      developer: "OpenAI",
      architecture: "MoE",
      totalParamsB: 117,
      activeParamsB: 5.1,
      nativeContextK: 131,
      maxContextK: 131,
      bitsPerWeight: 4,
      qualityTier: 2,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h100",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "MXFP4",
      license: "Apache-2.0 / Usage Policy",
      note: "Универсальная reasoning-модель для агентов и инструментов.",
      sourceUrl: "https://huggingface.co/openai/gpt-oss-120b",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "mistral-small4",
      enabled: true,
      name: "Mistral Small 4 119B-A6.5B",
      developer: "Mistral AI",
      architecture: "MoE",
      totalParamsB: 119,
      activeParamsB: 6.5,
      nativeContextK: 256,
      maxContextK: 256,
      bitsPerWeight: 4,
      qualityTier: 3,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "b200",
      minGpuCount: 2,
      sessionsPerReplica: 8,
      precision: "NVFP4",
      license: "Apache-2.0",
      note: "Продвинутый мультимодальный reasoning-класс для документов, кода и агентов.",
      sourceUrl:
        "https://huggingface.co/mistralai/Mistral-Small-4-119B-2603-NVFP4",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "qwen38-flash",
      enabled: true,
      name: "Qwen3.8 Flash Next 125B-A6B",
      developer: "Alibaba Qwen",
      architecture: "MoE",
      totalParamsB: 125,
      activeParamsB: 6,
      nativeContextK: 262,
      maxContextK: 1000,
      bitsPerWeight: 8,
      checkpointWeightGb: 172.8,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb300",
      minGpuCount: 2,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Qwen Community 1.0",
      note: "Эффективный frontier-класс для длинного контекста, видео, кода и агентов.",
      sourceUrl: "https://huggingface.co/Qwen/Qwen3.8-Flash-Next-FP8",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "minimax-m27",
      enabled: true,
      name: "MiniMax M2.7 230B-A10B",
      developer: "MiniMax AI",
      architecture: "MoE",
      totalParamsB: 230,
      activeParamsB: 10,
      nativeContextK: 196,
      maxContextK: 196,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h100",
      minGpuCount: 4,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Модифицированная; требуется юрпроверка",
      note: "Код, офисные задачи и многошаговые агенты.",
      sourceUrl: "https://huggingface.co/MiniMaxAI/MiniMax-M2.7",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "deepseek-v4-flash",
      enabled: true,
      name: "DeepSeek V4 Flash 284B-A13B",
      developer: "DeepSeek",
      architecture: "MoE",
      totalParamsB: 284,
      activeParamsB: 13,
      nativeContextK: 1000,
      maxContextK: 1000,
      bitsPerWeight: 4,
      checkpointWeightGb: 155,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb300",
      minGpuCount: 4,
      sessionsPerReplica: 8,
      precision: "FP4/FP8 mixed",
      license: "MIT",
      note: "Frontier-класс для кода, длительных агентов и сверхдлинных документов.",
      sourceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "glm53-flash",
      enabled: true,
      name: "GLM-5.3 Flash 320B-A18B",
      developer: "Z.ai",
      architecture: "MoE",
      totalParamsB: 320,
      activeParamsB: 18,
      nativeContextK: 1000,
      maxContextK: 1000,
      bitsPerWeight: 8,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb200",
      minGpuCount: 4,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "MIT",
      note: "Эффективный мультимодальный frontier-класс для кода, видео и агентов.",
      sourceUrl: "https://huggingface.co/zai-org/GLM-5.3-Flash",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "gigachat35-432b",
      enabled: true,
      name: "GigaChat 3.5 Ultra 432B-A28B",
      developer: "Sber AI",
      architecture: "MoE",
      totalParamsB: 432,
      activeParamsB: 28,
      nativeContextK: 32,
      maxContextK: 262,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "MIT",
      note: "Продвинутый русско-английский класс для кода, рассуждения и инструментов.",
      sourceUrl: "https://huggingface.co/ai-sage/GigaChat3.5-432B-A28B",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "minimax-m3",
      enabled: true,
      name: "MiniMax M3 428B-A23B",
      developer: "MiniMax AI",
      architecture: "MoE",
      totalParamsB: 428,
      activeParamsB: 23,
      nativeContextK: 1000,
      maxContextK: 1000,
      bitsPerWeight: 16,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "BF16",
      license: "MiniMax Community",
      note: "Сильный мультимодальный frontier-класс для кода, видео и управления интерфейсами.",
      sourceUrl: "https://huggingface.co/MiniMaxAI/MiniMax-M3",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "mistral-large3",
      enabled: true,
      name: "Mistral Large 3 675B-A41B",
      developer: "Mistral AI",
      architecture: "MoE",
      totalParamsB: 675,
      activeParamsB: 41,
      nativeContextK: 256,
      maxContextK: 256,
      bitsPerWeight: 8,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "b200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Apache-2.0",
      note: "Frontier-класс для корпоративного поиска, науки, кода и мультимодальных документов.",
      sourceUrl:
        "https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "glm53",
      enabled: true,
      name: "GLM-5.3 744B-A40B",
      developer: "Z.ai",
      architecture: "MoE",
      totalParamsB: 744,
      activeParamsB: 40,
      nativeContextK: 1000,
      maxContextK: 1000,
      bitsPerWeight: 8,
      qualityTier: 5,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "b200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "GLM-5.3; требуется юрпроверка",
      note: "Верхний frontier-класс для сложного кода и длительных агентных задач.",
      sourceUrl: "https://huggingface.co/zai-org/GLM-5.3",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "kimi-k26",
      enabled: true,
      name: "Kimi K2.6 1T-A32B",
      developer: "Moonshot AI",
      architecture: "MoE",
      totalParamsB: 1000,
      activeParamsB: 32,
      nativeContextK: 256,
      maxContextK: 256,
      bitsPerWeight: 4,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Modified MIT",
      note: "Frontier-класс для кода, изображений, видео и автономных агентов.",
      sourceUrl: "https://huggingface.co/moonshotai/Kimi-K2.6",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "deepseek-v4-pro",
      enabled: true,
      name: "DeepSeek V4 Pro 1.6T-A49B",
      developer: "DeepSeek",
      architecture: "MoE",
      totalParamsB: 1600,
      activeParamsB: 49,
      nativeContextK: 1000,
      maxContextK: 1000,
      bitsPerWeight: 4,
      qualityTier: 5,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb300",
      minGpuCount: 4,
      sessionsPerReplica: 8,
      precision: "FP4",
      license: "MIT",
      note: "Верхний frontier-класс для кода, рассуждения и длительных автономных агентов.",
      sourceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "qwen38-24t",
      enabled: true,
      name: "Qwen3.8 2.4T-A95B",
      developer: "Alibaba Qwen",
      architecture: "MoE",
      totalParamsB: 2400,
      activeParamsB: 95,
      nativeContextK: 262,
      maxContextK: 1010,
      bitsPerWeight: 8,
      qualityTier: 5,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb300",
      minGpuCount: 16,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Qwen3.8 Max; требуется юрпроверка",
      note: "Верхний frontier-класс для кода, исследований и длительных агентов.",
      sourceUrl: "https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B-FP8",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "gemma3-27b",
      enabled: true,
      name: "Gemma 3 27B",
      developer: "Google",
      architecture: "Dense",
      totalParamsB: 27,
      activeParamsB: 27,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 4,
      qualityTier: 1,
      capabilities: ["текст", "изображения"],
      recommendedGpuId: "l40s",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Gemma",
      note: "Компактная мультимодальная модель для типовых задач.",
      sourceUrl: "https://huggingface.co/google/gemma-3-27b-it",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "qwen3-32b",
      enabled: true,
      name: "Qwen3 32B",
      developer: "Alibaba Qwen",
      architecture: "Dense",
      totalParamsB: 32,
      activeParamsB: 32,
      nativeContextK: 41,
      maxContextK: 131,
      bitsPerWeight: 4,
      qualityTier: 1,
      capabilities: ["текст", "код", "инструменты"],
      recommendedGpuId: "h100",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Apache-2.0",
      note: "Типовые ответы, извлечение и код; контекст свыше 41 тыс. требует расширения.",
      sourceUrl: "https://github.com/QwenLM/Qwen3",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "llama33-70b",
      enabled: true,
      name: "Llama 3.3 70B",
      developer: "Meta",
      architecture: "Dense",
      totalParamsB: 70,
      activeParamsB: 70,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 4,
      qualityTier: 2,
      capabilities: ["текст", "код", "инструменты"],
      recommendedGpuId: "h100nvl",
      minGpuCount: 1,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Llama 3.3 Community",
      note: "Универсальная корпоративная модель среднего класса.",
      sourceUrl: "https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "qwen3-235b",
      enabled: true,
      name: "Qwen3-235B-A22B Instruct 2507",
      developer: "Alibaba Qwen",
      architecture: "MoE",
      totalParamsB: 235,
      activeParamsB: 22,
      nativeContextK: 262,
      maxContextK: 262,
      bitsPerWeight: 4,
      qualityTier: 2,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 2,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Apache-2.0",
      note: "Корпоративная модель для документов, аналитики и агентных сценариев.",
      sourceUrl: "https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "glm45",
      enabled: true,
      name: "GLM-4.5 355B-A32B",
      developer: "Z.ai",
      architecture: "MoE",
      totalParamsB: 355,
      activeParamsB: 32,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "MIT-like",
      note: "Продвинутые агентные задачи, рассуждение и программирование.",
      sourceUrl: "https://huggingface.co/zai-org/GLM-4.5-FP8",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "qwen3-coder-480b",
      enabled: true,
      name: "Qwen3-Coder 480B-A35B",
      developer: "Alibaba Qwen",
      architecture: "MoE",
      totalParamsB: 480,
      activeParamsB: 35,
      nativeContextK: 262,
      maxContextK: 262,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Apache-2.0",
      note: "Разработка ПО и длительные задачи с инструментами.",
      sourceUrl:
        "https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "deepseek-v3",
      enabled: true,
      name: "DeepSeek-V3 671B-A37B",
      developer: "DeepSeek",
      architecture: "MoE",
      totalParamsB: 671,
      activeParamsB: 37,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 8,
      qualityTier: 3,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "DeepSeek Model License",
      note: "Сложный анализ, программирование и многошаговые задачи.",
      sourceUrl: "https://github.com/deepseek-ai/DeepSeek-V3",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "deepseek-r1",
      enabled: true,
      name: "DeepSeek-R1 671B-A37B",
      developer: "DeepSeek",
      architecture: "MoE",
      totalParamsB: 671,
      activeParamsB: 37,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 8,
      qualityTier: 4,
      capabilities: ["текст", "код"],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "MIT",
      note: "Усиленное рассуждение для экспертных задач; инструменты требуют внешней оркестрации.",
      sourceUrl: "https://github.com/deepseek-ai/DeepSeek-R1",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "kimi-k2",
      enabled: true,
      name: "Kimi K2 1T-A32B",
      developer: "Moonshot AI",
      architecture: "MoE",
      totalParamsB: 1000,
      activeParamsB: 32,
      nativeContextK: 128,
      maxContextK: 128,
      bitsPerWeight: 8,
      qualityTier: 4,
      capabilities: ["текст", "код", "инструменты", "агенты"],
      recommendedGpuId: "h200",
      minGpuCount: 16,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "Modified MIT",
      note: "Триллионная агентная модель первого поколения.",
      sourceUrl: "https://github.com/MoonshotAI/Kimi-K2",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "kimi-k25",
      enabled: true,
      name: "Kimi K2.5 1T-A32B",
      developer: "Moonshot AI",
      architecture: "MoE",
      totalParamsB: 1000,
      activeParamsB: 32,
      nativeContextK: 256,
      maxContextK: 256,
      bitsPerWeight: 4,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "INT4",
      license: "Modified MIT",
      note: "Длительные агентные задачи, большой контекст и изображения.",
      sourceUrl: "https://github.com/MoonshotAI/Kimi-K2.5",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
    {
      id: "ring-26-1t",
      enabled: true,
      name: "Ring 2.6 1T-A50B",
      developer: "Ant Group / InclusionAI",
      architecture: "MoE",
      totalParamsB: 1000,
      activeParamsB: 50,
      nativeContextK: 131,
      maxContextK: 256,
      bitsPerWeight: 8,
      qualityTier: 4,
      capabilities: [
        "текст",
        "код",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "h200",
      minGpuCount: 16,
      sessionsPerReplica: 8,
      precision: "FP8",
      license: "MIT",
      note: "Актуальная триллионная reasoning-модель; конфигурация GPU остаётся инженерной оценкой.",
      sourceUrl: "https://huggingface.co/inclusionAI/Ring-2.6-1T",
      sourceDate: "2026-09-02",
      evidence: "Инженерная оценка",
    },
    {
      id: "kimi-k3",
      enabled: true,
      name: "Kimi K3 2.8T-A104B",
      developer: "Moonshot AI",
      architecture: "MoE",
      totalParamsB: 2800,
      activeParamsB: 104,
      nativeContextK: 1049,
      maxContextK: 1049,
      bitsPerWeight: 4,
      qualityTier: 5,
      capabilities: [
        "текст",
        "код",
        "изображения",
        "инструменты",
        "длинный контекст",
        "агенты",
      ],
      recommendedGpuId: "gb300",
      minGpuCount: 8,
      sessionsPerReplica: 8,
      precision: "MXFP4/MXFP8",
      license: "Kimi K3 License",
      note: "Верхний frontier-класс мультимодальных и длительных агентных задач.",
      sourceUrl: "https://huggingface.co/moonshotai/Kimi-K3",
      sourceDate: "2026-09-02",
      evidence: "Публичные характеристики",
    },
  ],
  tasks: [
    {
      id: "search",
      enabled: true,
      title: "Корпоративный поиск и ответы",
      description: "Регламенты, инструкции и база знаний",
      category: "Знания",
      minQualityTier: 1,
      minContextK: 32,
      requiredCapabilities: ["текст"],
    },
    {
      id: "extract",
      enabled: true,
      title: "Извлечение и классификация",
      description: "Реквизиты, формы и маршрутизация",
      category: "Документы",
      minQualityTier: 1,
      minContextK: 16,
      requiredCapabilities: ["текст"],
    },
    {
      id: "summary",
      enabled: true,
      title: "Пересказы и отчёты",
      description: "Сводки документов, писем и совещаний",
      category: "Документы",
      minQualityTier: 1,
      minContextK: 64,
      requiredCapabilities: ["текст"],
    },
    {
      id: "contracts",
      enabled: true,
      title: "Договоры и закупки",
      description: "Риски, исключения и противоречия",
      category: "Корпоративные функции",
      minQualityTier: 2,
      minContextK: 128,
      requiredCapabilities: ["текст"],
    },
    {
      id: "estimates",
      enabled: true,
      title: "Сметы, КС-2 и комплекты документов",
      description: "Ведомости, сметы, акты и итоговые файлы",
      category: "Строительство",
      minQualityTier: 2,
      minContextK: 128,
      requiredCapabilities: ["текст"],
    },
    {
      id: "management",
      enabled: true,
      title: "Управленческая аналитика",
      description: "Сопоставление источников и варианты решений",
      category: "Управление",
      minQualityTier: 3,
      minContextK: 128,
      requiredCapabilities: ["текст", "инструменты"],
    },
    {
      id: "incidents",
      enabled: true,
      title: "Технические инциденты",
      description: "Журналы, регламенты и причинные связи",
      category: "Производство",
      minQualityTier: 3,
      minContextK: 128,
      requiredCapabilities: ["текст", "инструменты"],
    },
    {
      id: "coding",
      enabled: true,
      title: "Разработка программных систем",
      description: "Репозитории, изменения кода и проверки",
      category: "ИТ",
      minQualityTier: 3,
      minContextK: 128,
      requiredCapabilities: ["код", "инструменты"],
    },
    {
      id: "vision",
      enabled: true,
      title: "Документы с изображениями и схемами",
      description: "Страницы, таблицы, чертежи и изображения",
      category: "Мультимодальность",
      minQualityTier: 3,
      minContextK: 128,
      requiredCapabilities: ["изображения", "текст"],
    },
    {
      id: "agents",
      enabled: true,
      title: "Исследовательские и инженерные агенты",
      description: "Планы, расчёты, инструменты и проверка гипотез",
      category: "Агенты",
      minQualityTier: 4,
      minContextK: 256,
      requiredCapabilities: ["агенты", "инструменты"],
    },
    {
      id: "long",
      enabled: true,
      title: "Сверхдлинный контекст",
      description: "Сотни документов или крупный репозиторий",
      category: "Предельные задачи",
      minQualityTier: 3,
      minContextK: 512,
      requiredCapabilities: ["длинный контекст"],
    },
    {
      id: "frontier",
      enabled: true,
      title: "Предельные мультимодальные задачи",
      description:
        "Изображения, длительная автономность и высокий потолок качества",
      category: "Предельные задачи",
      minQualityTier: 5,
      minContextK: 1000,
      requiredCapabilities: ["изображения", "агенты", "длинный контекст"],
    },
  ],
};

export function createEstimatedProfile(
  model: ModelConfig,
  gpu: Pick<GpuConfig, "id">,
): DeploymentProfile {
  return {
    id: `${model.id}--${gpu.id}--estimate`,
    enabled: true,
    modelId: model.id,
    gpuId: gpu.id,
    engine: "Требует проверки",
    engineVersion: "Не измерено",
    precision: model.precision,
    gpuCount: model.minGpuCount,
    tensorParallel: model.minGpuCount,
    pipelineParallel: 1,
    maxContextTokens: model.maxContextK * 1000,
    maxConcurrency: model.sessionsPerReplica,
    kvCacheGbPer1kTokens: 0.125,
    workspaceGbPerGpu: 1,
    status: "estimated",
    sourceUrl: "",
    sourceDate: "",
    notes:
      "Плановое допущение: KV-кэш 0,125 ГБ на 1000 токенов одной сессии, workspace 1 ГБ на GPU. Коэффициенты одинаковы для всех моделей и не являются замерами или характеристиками архитектуры. Параллельность перенесена из v2; движок, формат весов и топологию необходимо проверить.",
  };
}

function migrateV2(legacy: LegacyAppConfig): AppConfig {
  return {
    ...legacy,
    schemaVersion: 3,
    catalogVersion: `${legacy.updatedAt.slice(0, 10)}.legacy-v2`,
    gpus: legacy.gpus.map((gpu) => ({
      ...gpu,
      purchaseQuote: {
        sourceLabel:
          gpu.id === "a100"
            ? "Неподтверждённая оценка покупки"
            : gpu.sourceLabel,
        sourceUrl: gpu.id === "a100" ? "" : gpu.sourceUrl,
        sourceDate: gpu.sourceDate,
        kind: gpu.id === "a100" ? "Инженерная оценка" : gpu.priceKind,
        terms:
          "Перенесено из каталога v2. Стоимость целого узла; состав, НДС, доставка и дата предложения требуют подтверждения. Публичные цены могут быть указаны «от».",
      },
      rentalQuote: {
        sourceLabel: "Неподтверждённая оценка аренды из v2",
        sourceUrl: "",
        sourceDate: "",
        kind: "Инженерная оценка",
        terms:
          "Численный тариф перенесён из v2 без отдельного подтверждающего источника аренды. Расчёт за GPU-час; для выделенного узла оплачивается полный узел 730 часов/месяц.",
      },
    })),
    deploymentProfiles: legacy.models.map((model) =>
      createEstimatedProfile(model, { id: model.recommendedGpuId }),
    ),
    qualityAssessments: [],
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  ...migrateV2(LEGACY_DEFAULT_CONFIG),
  catalogVersion: "2026-09-06.1",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

export function cloneDefaultConfig(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;
}

export function modelWeightGb(model: ModelConfig): number {
  return (
    model.checkpointWeightGb ?? (model.totalParamsB * model.bitsPerWeight) / 8
  );
}

export const CAPABILITIES: Capability[] = [
  "текст",
  "код",
  "изображения",
  "инструменты",
  "длинный контекст",
  "агенты",
];
const PRICE_KINDS: PriceKind[] = [
  "Публичная цена",
  "Коммерческая оценка",
  "Инженерная оценка",
];
type JsonRecord = Record<string, unknown>;
type Rule = (value: unknown) => boolean;
const object = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string: Rule = (value) => typeof value === "string";
const text: Rule = (value) =>
  typeof value === "string" && value.trim().length > 0;
const boolean: Rule = (value) => typeof value === "boolean";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const numberIn =
  (min: number, max = Number.MAX_SAFE_INTEGER, integer = false): Rule =>
  (value) =>
    finite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isSafeInteger(value));
const positive = numberIn(Number.MIN_VALUE);
const positiveInteger = numberIn(1, 1_000_000, true);
const percent = numberIn(0, 100);
const quality = numberIn(1, MAX_QUALITY_TIER, true);
const enumeration =
  (values: readonly unknown[]): Rule =>
  (value) =>
    values.includes(value);
const capabilities: Rule = (value) =>
  Array.isArray(value) &&
  value.every((item) => CAPABILITIES.includes(item)) &&
  new Set(value).size === value.length;
const url: Rule = (value) => {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
};
const dateOnly: Rule = (value) =>
  typeof value === "string" &&
  (value === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value));
const timestamp: Rule = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  dateOnly(value.slice(0, 10)) &&
  new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

const MODEL_RULES: Record<string, Rule> = {
  id: text,
  enabled: boolean,
  name: text,
  developer: text,
  architecture: enumeration(["Dense", "MoE"]),
  totalParamsB: positive,
  activeParamsB: positive,
  nativeContextK: positiveInteger,
  maxContextK: positiveInteger,
  bitsPerWeight: numberIn(Number.MIN_VALUE, 64),
  qualityTier: quality,
  capabilities,
  recommendedGpuId: text,
  minGpuCount: positiveInteger,
  sessionsPerReplica: positiveInteger,
  precision: text,
  license: text,
  note: string,
  sourceUrl: url,
  sourceDate: dateOnly,
  evidence: enumeration([
    "Публичные характеристики",
    "Конфигурация проверена поставщиком",
    "Инженерная оценка",
  ]),
};
const GPU_RULES: Record<string, Rule> = {
  id: text,
  enabled: boolean,
  name: text,
  vendor: text,
  memoryGb: positive,
  nodeGpuCount: positiveInteger,
  nodePriceRub: numberIn(0),
  rentPerGpuHourRub: numberIn(0),
  nodePowerKw: positive,
  memoryBandwidthTb: numberIn(0),
  interconnect: text,
  priceKind: enumeration(PRICE_KINDS),
  sourceLabel: string,
  sourceUrl: url,
  sourceDate: dateOnly,
};
const QUOTE_RULES: Record<string, Rule> = {
  sourceLabel: string,
  sourceUrl: url,
  sourceDate: dateOnly,
  kind: enumeration(PRICE_KINDS),
  terms: string,
};
const TASK_RULES: Record<string, Rule> = {
  id: text,
  enabled: boolean,
  title: text,
  description: string,
  category: text,
  minQualityTier: quality,
  minContextK: positiveInteger,
  requiredCapabilities: capabilities,
};
const ASSUMPTION_RULES: Record<keyof Assumptions, Rule> = {
  defaultHoursMonth: numberIn(0, 730),
  defaultYears: numberIn(1, 5, true),
  defaultConcurrency: numberIn(1, 10_000, true),
  electricityRubKwh: numberIn(0),
  pue: numberIn(1, 10),
  supportPctCapexYear: percent,
  fitoutPctCapex: percent,
  idlePowerPct: percent,
  memoryOverheadPct: percent,
  usableMemoryPct: numberIn(Number.MIN_VALUE, 100),
  rackMonthPerNodeRub: numberIn(0),
  networkStorageMonthRub: numberIn(0),
  operationsMonthRub: numberIn(0),
  rentalServicePct: percent,
  contingencyPct: percent,
  residualValuePct: percent,
  stalePriceDays: numberIn(0, 36500, true),
};
const PROFILE_RULES: Record<string, Rule> = {
  id: text,
  enabled: boolean,
  modelId: text,
  gpuId: text,
  engine: text,
  engineVersion: text,
  precision: text,
  gpuCount: positiveInteger,
  tensorParallel: positiveInteger,
  pipelineParallel: positiveInteger,
  maxContextTokens: positiveInteger,
  maxConcurrency: positiveInteger,
  kvCacheGbPer1kTokens: numberIn(0),
  workspaceGbPerGpu: numberIn(0),
  status: enumeration(["estimated", "measured"]),
  sourceUrl: url,
  sourceDate: dateOnly,
  notes: string,
};
// Large contexts above one million tokens remain representable.
PROFILE_RULES.maxContextTokens = numberIn(1, 1_000_000_000, true);
const BENCHMARK_RULES: Record<string, Rule> = {
  inputTokens: positiveInteger,
  outputTokens: positiveInteger,
  concurrency: positiveInteger,
  ttftMs: positive,
  tokensPerSecond: positive,
};
BENCHMARK_RULES.inputTokens = numberIn(1, 1_000_000_000, true);
BENCHMARK_RULES.outputTokens = numberIn(1, 1_000_000_000, true);
const ASSESSMENT_RULES: Record<string, Rule> = {
  id: text,
  modelId: text,
  taskId: text,
  status: enumeration(["planned", "measured"]),
  qualityTier: quality,
  sampleSize: numberIn(0, 1_000_000_000, true),
  dataset: string,
  sourceUrl: url,
  sourceDate: dateOnly,
  notes: string,
};

function shape(
  value: unknown,
  path: string,
  rules: Record<string, Rule>,
  errors: string[],
  optional: Record<string, Rule> = {},
  nested: string[] = [],
): value is JsonRecord {
  if (!object(value)) {
    errors.push(`${path}: требуется объект.`);
    return false;
  }
  for (const [key, rule] of Object.entries(rules))
    if (!rule(value[key]))
      errors.push(
        `${path}.${key}: отсутствует или имеет недопустимый тип/значение.`,
      );
  for (const [key, rule] of Object.entries(optional))
    if (value[key] !== undefined && !rule(value[key]))
      errors.push(`${path}.${key}: недопустимый тип/значение.`);
  for (const key of Object.keys(value))
    if (
      !Object.prototype.hasOwnProperty.call(rules, key) &&
      !Object.prototype.hasOwnProperty.call(optional, key) &&
      !nested.includes(key)
    )
      errors.push(`${path}.${key}: неизвестное поле.`);
  return true;
}

function validateVersion(value: unknown, version: 2 | 3): string[] {
  const errors: string[] = [];
  const rootRules: Record<string, Rule> = {
    schemaVersion: enumeration([version]),
    revision: numberIn(version === 3 ? 0 : 1, Number.MAX_SAFE_INTEGER, true),
    updatedAt: timestamp,
  };
  if (version === 3) rootRules.catalogVersion = text;
  if (
    !shape(value, "config", rootRules, errors, {}, [
      "assumptions",
      "models",
      "gpus",
      "tasks",
      ...(version === 3 ? ["deploymentProfiles", "qualityAssessments"] : []),
    ])
  )
    return errors;
  shape(value.assumptions, "assumptions", ASSUMPTION_RULES, errors);
  const lists = [
    "models",
    "gpus",
    "tasks",
    ...(version === 3 ? ["deploymentProfiles", "qualityAssessments"] : []),
  ];
  for (const key of lists) {
    const list = value[key];
    if (!Array.isArray(list)) {
      errors.push(`${key}: требуется массив.`);
      continue;
    }
    if (list.length > 10_000) {
      errors.push(`${key}: не более 10000 записей.`);
      continue;
    }
    const ids = new Set<string>();
    for (const [index, entry] of list.entries()) {
      const path = `${key}[${index}]`;
      const rules =
        key === "models"
          ? MODEL_RULES
          : key === "gpus"
            ? GPU_RULES
            : key === "tasks"
              ? TASK_RULES
              : key === "deploymentProfiles"
                ? PROFILE_RULES
                : ASSESSMENT_RULES;
      const optional: Record<string, Rule> =
        key === "models"
          ? { checkpointWeightGb: positive }
          : key === "qualityAssessments"
            ? {
                correctAnswerPct: percent,
                extractionErrorPct: percent,
                toolSuccessPct: percent,
              }
            : {};
      const nested =
        key === "gpus" && version === 3
          ? ["purchaseQuote", "rentalQuote"]
          : key === "deploymentProfiles"
            ? ["benchmark"]
            : [];
      if (!shape(entry, path, rules, errors, optional, nested)) continue;
      if (typeof entry.id === "string") {
        if (ids.has(entry.id))
          errors.push(`${path}.id: идентификатор должен быть уникальным.`);
        ids.add(entry.id);
      }
      if (key === "gpus" && version === 3)
        for (const quote of ["purchaseQuote", "rentalQuote"])
          shape(entry[quote], `${path}.${quote}`, QUOTE_RULES, errors);
      if (key === "deploymentProfiles" && entry.benchmark !== undefined)
        shape(entry.benchmark, `${path}.benchmark`, BENCHMARK_RULES, errors);
    }
  }
  // No typed field is read until every structural check has succeeded.
  if (errors.length) return errors;
  const config = value as unknown as AppConfig;
  const gpuById = new Map(config.gpus.map((gpu) => [gpu.id, gpu]));
  const modelById = new Map(config.models.map((model) => [model.id, model]));
  const taskIds = new Set(config.tasks.map((task) => task.id));
  if (!config.models.some((model) => model.enabled))
    errors.push("models: должна быть включена хотя бы одна модель.");
  if (!config.gpus.some((gpu) => gpu.enabled))
    errors.push("gpus: должен быть включён хотя бы один GPU.");
  for (const [index, model] of config.models.entries()) {
    if (model.activeParamsB > model.totalParamsB)
      errors.push(
        `models[${index}].activeParamsB: не может превышать общее число параметров.`,
      );
    if (model.nativeContextK > model.maxContextK)
      errors.push(
        `models[${index}].maxContextK: не может быть меньше нативного контекста.`,
      );
    if (!gpuById.has(model.recommendedGpuId))
      errors.push(`models[${index}].recommendedGpuId: отсутствующий GPU.`);
    if (
      model.enabled &&
      gpuById.get(model.recommendedGpuId)?.enabled === false &&
      (version === 2 ||
        !config.deploymentProfiles.some(
          (profile) =>
            profile.enabled &&
            profile.modelId === model.id &&
            gpuById.get(profile.gpuId)?.enabled,
        ))
    )
      errors.push(
        `models[${index}].recommendedGpuId: выключенный GPU и нет доступного альтернативного профиля.`,
      );
  }
  if (version === 3) {
    for (const [index, gpu] of config.gpus.entries())
      for (const key of ["purchaseQuote", "rentalQuote"] as const) {
        const quote = gpu[key];
        if (
          quote.kind !== "Инженерная оценка" &&
          (!quote.sourceUrl || !quote.sourceDate)
        )
          errors.push(
            `gpus[${index}].${key}: публичная или коммерческая цена требует источник и дату.`,
          );
      }
    for (const [index, profile] of config.deploymentProfiles.entries()) {
      const path = `deploymentProfiles[${index}]`;
      const model = modelById.get(profile.modelId);
      if (!model) errors.push(`${path}.modelId: отсутствующая модель.`);
      const gpu = gpuById.get(profile.gpuId);
      if (!gpu) errors.push(`${path}.gpuId: отсутствующий GPU.`);
      else if (
        profile.workspaceGbPerGpu >=
        (gpu.memoryGb * config.assumptions.usableMemoryPct) / 100
      )
        errors.push(
          `${path}.workspaceGbPerGpu: workspace должен оставлять доступную память для весов и KV-кэша.`,
        );
      if (
        profile.tensorParallel * profile.pipelineParallel !==
        profile.gpuCount
      )
        errors.push(
          `${path}: tensorParallel × pipelineParallel должно равняться gpuCount.`,
        );
      if (model && profile.maxContextTokens > model.maxContextK * 1000)
        errors.push(
          `${path}.maxContextTokens: превышает максимальный контекст модели.`,
        );
      if (
        profile.benchmark &&
        (profile.benchmark.concurrency > profile.maxConcurrency ||
          profile.benchmark.inputTokens + profile.benchmark.outputTokens >
            profile.maxContextTokens)
      )
        errors.push(`${path}.benchmark: нагрузка выходит за границы профиля.`);
      if (
        profile.status === "measured" &&
        (!profile.benchmark || !profile.sourceUrl || !profile.sourceDate)
      )
        errors.push(
          `${path}: измеренный профиль требует benchmark, sourceUrl и sourceDate.`,
        );
    }
    const assessedPairs = new Set<string>();
    for (const [index, assessment] of config.qualityAssessments.entries()) {
      const path = `qualityAssessments[${index}]`;
      if (!modelById.has(assessment.modelId))
        errors.push(`${path}.modelId: отсутствующая модель.`);
      if (!taskIds.has(assessment.taskId))
        errors.push(`${path}.taskId: отсутствующая задача.`);
      if (assessment.status === "measured") {
        if (
          !assessment.sampleSize ||
          !assessment.dataset.trim() ||
          !assessment.sourceUrl ||
          !assessment.sourceDate ||
          [
            assessment.correctAnswerPct,
            assessment.extractionErrorPct,
            assessment.toolSuccessPct,
          ].every((metric) => metric === undefined)
        )
          errors.push(
            `${path}: измеренная оценка требует выборку, датасет, источник, дату и хотя бы одну метрику.`,
          );
        const pair = `${assessment.modelId}/${assessment.taskId}`;
        if (assessedPairs.has(pair))
          errors.push(
            `${path}: для пары модель/задача допускается одна актуальная измеренная оценка.`,
          );
        assessedPairs.add(pair);
      }
    }
  }
  return errors;
}

/** Strict validation of the current schema. Use parseConfig to migrate schema 2. */
export function validateConfig(value: unknown): string[] {
  return validateVersion(value, 3);
}

export type ParseConfigResult = {
  config: AppConfig | null;
  errors: string[];
  warnings: string[];
};
export function parseConfig(value: unknown): ParseConfigResult {
  const legacy = object(value) && value.schemaVersion === 2;
  const errors = validateVersion(value, legacy ? 2 : 3);
  if (errors.length) return { config: null, errors, warnings: [] };
  const config = legacy
    ? migrateV2(value as LegacyAppConfig)
    : (JSON.parse(JSON.stringify(value)) as AppConfig);
  const migrationErrors = legacy ? validateConfig(config) : [];
  if (migrationErrors.length)
    return { config: null, errors: migrationErrors, warnings: [] };
  return {
    config,
    errors: [],
    warnings: legacy
      ? [
          "Каталог v2 перенесён в v3. Профили запуска и KV-кэш являются плановыми допущениями. Источники покупки и аренды разделены; неподтверждённые тарифы аренды помечены инженерной оценкой.",
        ]
      : [],
  };
}
