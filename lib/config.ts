export type PriceKind = "Публичная цена" | "Коммерческая оценка" | "Инженерная оценка";
export type Capability = "текст" | "код" | "изображения" | "инструменты" | "длинный контекст" | "агенты";
export type QualityTier = 1 | 2 | 3 | 4 | 5;

export const MAX_QUALITY_TIER = 5;
export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  1: "Базовый",
  2: "Стандартный",
  3: "Продвинутый",
  4: "Frontier",
  5: "Верхний frontier"
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
  evidence: "Публичные характеристики" | "Конфигурация проверена поставщиком" | "Инженерная оценка";
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

export type AppConfig = {
  schemaVersion: 2;
  revision: number;
  updatedAt: string;
  assumptions: Assumptions;
  models: ModelConfig[];
  gpus: GpuConfig[];
  tasks: TaskRule[];
};

export const STORAGE_KEY = "gpu-calculator:settings:v2";

export const DEFAULT_CONFIG: AppConfig = {
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
    stalePriceDays: 90
  },
  gpus: [
    {id:"rtx4090",enabled:true,name:"RTX 4090 24 ГБ",vendor:"NVIDIA",memoryGb:24,nodeGpuCount:4,nodePriceRub:2_800_000,rentPerGpuHourRub:80,nodePowerKw:2.6,memoryBandwidthTb:1.01,interconnect:"PCIe",priceKind:"Инженерная оценка",sourceLabel:"Рыночная оценка РФ",sourceUrl:"",sourceDate:"2026-09-02"},
    {id:"l40s",enabled:true,name:"L40S 48 ГБ",vendor:"NVIDIA",memoryGb:48,nodeGpuCount:8,nodePriceRub:16_000_000,rentPerGpuHourRub:190,nodePowerKw:4.8,memoryBandwidthTb:.864,interconnect:"PCIe",priceKind:"Инженерная оценка",sourceLabel:"Рыночная оценка РФ",sourceUrl:"",sourceDate:"2026-09-02"},
    {id:"a100",enabled:true,name:"A100 80 ГБ",vendor:"NVIDIA",memoryGb:80,nodeGpuCount:8,nodePriceRub:18_000_000,rentPerGpuHourRub:427,nodePowerKw:6.5,memoryBandwidthTb:2.04,interconnect:"NVLink / NVSwitch",priceKind:"Коммерческая оценка",sourceLabel:"Cloud.ru",sourceUrl:"https://cloud.ru/documents/tariffs/evolution/evolution-compute-gpu",sourceDate:"2026-09-02"},
    {id:"h100",enabled:true,name:"H100 80 ГБ",vendor:"NVIDIA",memoryGb:80,nodeGpuCount:8,nodePriceRub:27_465_738,rentPerGpuHourRub:570,nodePowerKw:10.2,memoryBandwidthTb:3.35,interconnect:"NVLink / NVSwitch",priceKind:"Публичная цена",sourceLabel:"Cloud.ru / Servermall",sourceUrl:"https://servermall.ru/sets/servery-nvidia/",sourceDate:"2026-09-02"},
    {id:"h100nvl",enabled:true,name:"H100 NVL 94 ГБ",vendor:"NVIDIA",memoryGb:94,nodeGpuCount:4,nodePriceRub:22_000_000,rentPerGpuHourRub:490,nodePowerKw:4.8,memoryBandwidthTb:3.9,interconnect:"NVLink bridge",priceKind:"Инженерная оценка",sourceLabel:"Рыночная оценка РФ",sourceUrl:"https://selectel.ru/graphics-card-nvidia-h100-94gb/",sourceDate:"2026-09-02"},
    {id:"h200",enabled:true,name:"H200 141 ГБ",vendor:"NVIDIA",memoryGb:141,nodeGpuCount:8,nodePriceRub:34_157_144,rentPerGpuHourRub:587.67,nodePowerKw:10.2,memoryBandwidthTb:4.8,interconnect:"NVLink / NVSwitch",priceKind:"Публичная цена",sourceLabel:"Selectel / ServerICT",sourceUrl:"https://serverict.com/servers-gpu/asus/asus-h200-nvidia/",sourceDate:"2026-09-02"},
    {id:"mi300x",enabled:true,name:"Instinct MI300X 192 ГБ",vendor:"AMD",memoryGb:192,nodeGpuCount:8,nodePriceRub:32_000_000,rentPerGpuHourRub:600,nodePowerKw:8.0,memoryBandwidthTb:5.3,interconnect:"Infinity Fabric",priceKind:"Инженерная оценка",sourceLabel:"Инженерная оценка",sourceUrl:"https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html",sourceDate:"2026-09-02"},
    {id:"b200",enabled:true,name:"B200 180 ГБ",vendor:"NVIDIA",memoryGb:180,nodeGpuCount:8,nodePriceRub:52_724_649,rentPerGpuHourRub:950,nodePowerKw:14.3,memoryBandwidthTb:8,interconnect:"NVLink / NVSwitch",priceKind:"Коммерческая оценка",sourceLabel:"ServerICT; аренда — оценка",sourceUrl:"https://serverict.com/server/nvidia/nvidia-dgx-b200/",sourceDate:"2026-09-02"},
    {id:"gb200",enabled:true,name:"GB200 192 ГБ",vendor:"NVIDIA",memoryGb:192,nodeGpuCount:4,nodePriceRub:35_000_000,rentPerGpuHourRub:1100,nodePowerKw:8,memoryBandwidthTb:8,interconnect:"NVLink-C2C / NVL",priceKind:"Инженерная оценка",sourceLabel:"Инженерная оценка",sourceUrl:"https://www.nvidia.com/en-us/data-center/gb200-nvl72/",sourceDate:"2026-09-02"},
    {id:"gb300",enabled:true,name:"GB300 288 ГБ",vendor:"NVIDIA",memoryGb:288,nodeGpuCount:4,nodePriceRub:45_000_000,rentPerGpuHourRub:1350,nodePowerKw:8.5,memoryBandwidthTb:8,interconnect:"NVLink-C2C / NVL",priceKind:"Инженерная оценка",sourceLabel:"Инженерная оценка",sourceUrl:"https://www.nvidia.com/en-us/data-center/gb300-nvl72/",sourceDate:"2026-09-02"}
  ],
  models: [
    {id:"ministral3-8b",enabled:true,name:"Ministral 3 8B Reasoning",developer:"Mistral AI",architecture:"Dense",totalParamsB:9,activeParamsB:9,nativeContextK:262,maxContextK:262,bitsPerWeight:16,qualityTier:1,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"rtx4090",minGpuCount:1,sessionsPerReplica:8,precision:"BF16",license:"Apache-2.0",note:"Компактная мультимодальная reasoning-модель для локальных помощников.",sourceUrl:"https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"gpt-oss-20b",enabled:true,name:"GPT-OSS 20B",developer:"OpenAI",architecture:"MoE",totalParamsB:21,activeParamsB:3.6,nativeContextK:131,maxContextK:131,bitsPerWeight:4,qualityTier:1,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"rtx4090",minGpuCount:1,sessionsPerReplica:8,precision:"MXFP4",license:"Apache-2.0 / Usage Policy",note:"Быстрая модель рассуждения и инструментальных вызовов.",sourceUrl:"https://huggingface.co/openai/gpt-oss-20b",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"qwen38-27b",enabled:true,name:"Qwen3.8 27B",developer:"Alibaba Qwen",architecture:"Dense",totalParamsB:27,activeParamsB:27,nativeContextK:262,maxContextK:1000,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:1,sessionsPerReplica:8,precision:"FP8",license:"Apache-2.0",note:"Сильная компактная мультимодальная модель для кода, видео и агентных задач.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-27B-FP8",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"tpro-it-21",enabled:true,name:"T-pro-it 2.1 33B",developer:"Т-Технологии",architecture:"Dense",totalParamsB:33,activeParamsB:33,nativeContextK:41,maxContextK:131,bitsPerWeight:16,qualityTier:2,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:1,sessionsPerReplica:8,precision:"BF16",license:"Apache-2.0",note:"Русскоязычный корпоративный ассистент; контекст свыше 41 тыс. требует YaRN.",sourceUrl:"https://huggingface.co/t-tech/T-pro-it-2.1",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"gpt-oss-120b",enabled:true,name:"GPT-OSS 120B",developer:"OpenAI",architecture:"MoE",totalParamsB:117,activeParamsB:5.1,nativeContextK:131,maxContextK:131,bitsPerWeight:4,qualityTier:2,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h100",minGpuCount:1,sessionsPerReplica:8,precision:"MXFP4",license:"Apache-2.0 / Usage Policy",note:"Универсальная reasoning-модель для агентов и инструментов.",sourceUrl:"https://huggingface.co/openai/gpt-oss-120b",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"mistral-small4",enabled:true,name:"Mistral Small 4 119B-A6.5B",developer:"Mistral AI",architecture:"MoE",totalParamsB:119,activeParamsB:6.5,nativeContextK:256,maxContextK:256,bitsPerWeight:4,qualityTier:3,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:2,sessionsPerReplica:8,precision:"NVFP4",license:"Apache-2.0",note:"Продвинутый мультимодальный reasoning-класс для документов, кода и агентов.",sourceUrl:"https://huggingface.co/mistralai/Mistral-Small-4-119B-2603-NVFP4",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"qwen38-flash",enabled:true,name:"Qwen3.8 Flash Next 125B-A6B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:125,activeParamsB:6,nativeContextK:262,maxContextK:1000,bitsPerWeight:8,checkpointWeightGb:172.8,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:2,sessionsPerReplica:8,precision:"FP8",license:"Qwen Community 1.0",note:"Эффективный frontier-класс для длинного контекста, видео, кода и агентов.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-Flash-Next-FP8",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"minimax-m27",enabled:true,name:"MiniMax M2.7 230B-A10B",developer:"MiniMax AI",architecture:"MoE",totalParamsB:230,activeParamsB:10,nativeContextK:196,maxContextK:196,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h100",minGpuCount:4,sessionsPerReplica:8,precision:"FP8",license:"Модифицированная; требуется юрпроверка",note:"Код, офисные задачи и многошаговые агенты.",sourceUrl:"https://huggingface.co/MiniMaxAI/MiniMax-M2.7",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"deepseek-v4-flash",enabled:true,name:"DeepSeek V4 Flash 284B-A13B",developer:"DeepSeek",architecture:"MoE",totalParamsB:284,activeParamsB:13,nativeContextK:1000,maxContextK:1000,bitsPerWeight:4,checkpointWeightGb:155,qualityTier:4,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:4,sessionsPerReplica:8,precision:"FP4/FP8 mixed",license:"MIT",note:"Frontier-класс для кода, длительных агентов и сверхдлинных документов.",sourceUrl:"https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"glm53-flash",enabled:true,name:"GLM-5.3 Flash 320B-A18B",developer:"Z.ai",architecture:"MoE",totalParamsB:320,activeParamsB:18,nativeContextK:1000,maxContextK:1000,bitsPerWeight:8,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb200",minGpuCount:4,sessionsPerReplica:8,precision:"FP8",license:"MIT",note:"Эффективный мультимодальный frontier-класс для кода, видео и агентов.",sourceUrl:"https://huggingface.co/zai-org/GLM-5.3-Flash",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"gigachat35-432b",enabled:true,name:"GigaChat 3.5 Ultra 432B-A28B",developer:"Sber AI",architecture:"MoE",totalParamsB:432,activeParamsB:28,nativeContextK:32,maxContextK:262,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"MIT",note:"Продвинутый русско-английский класс для кода, рассуждения и инструментов.",sourceUrl:"https://huggingface.co/ai-sage/GigaChat3.5-432B-A28B",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"minimax-m3",enabled:true,name:"MiniMax M3 428B-A23B",developer:"MiniMax AI",architecture:"MoE",totalParamsB:428,activeParamsB:23,nativeContextK:1000,maxContextK:1000,bitsPerWeight:16,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"BF16",license:"MiniMax Community",note:"Сильный мультимодальный frontier-класс для кода, видео и управления интерфейсами.",sourceUrl:"https://huggingface.co/MiniMaxAI/MiniMax-M3",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"mistral-large3",enabled:true,name:"Mistral Large 3 675B-A41B",developer:"Mistral AI",architecture:"MoE",totalParamsB:675,activeParamsB:41,nativeContextK:256,maxContextK:256,bitsPerWeight:8,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"Apache-2.0",note:"Frontier-класс для корпоративного поиска, науки, кода и мультимодальных документов.",sourceUrl:"https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"glm53",enabled:true,name:"GLM-5.3 744B-A40B",developer:"Z.ai",architecture:"MoE",totalParamsB:744,activeParamsB:40,nativeContextK:1000,maxContextK:1000,bitsPerWeight:8,qualityTier:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"GLM-5.3; требуется юрпроверка",note:"Верхний frontier-класс для сложного кода и длительных агентных задач.",sourceUrl:"https://huggingface.co/zai-org/GLM-5.3",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"kimi-k26",enabled:true,name:"Kimi K2.6 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32,nativeContextK:256,maxContextK:256,bitsPerWeight:4,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"INT4",license:"Modified MIT",note:"Frontier-класс для кода, изображений, видео и автономных агентов.",sourceUrl:"https://huggingface.co/moonshotai/Kimi-K2.6",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"deepseek-v4-pro",enabled:true,name:"DeepSeek V4 Pro 1.6T-A49B",developer:"DeepSeek",architecture:"MoE",totalParamsB:1600,activeParamsB:49,nativeContextK:1000,maxContextK:1000,bitsPerWeight:4,qualityTier:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:4,sessionsPerReplica:8,precision:"FP4",license:"MIT",note:"Верхний frontier-класс для кода, рассуждения и длительных автономных агентов.",sourceUrl:"https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"qwen38-24t",enabled:true,name:"Qwen3.8 2.4T-A95B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:2400,activeParamsB:95,nativeContextK:262,maxContextK:1010,bitsPerWeight:8,qualityTier:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:16,sessionsPerReplica:8,precision:"FP8",license:"Qwen3.8 Max; требуется юрпроверка",note:"Верхний frontier-класс для кода, исследований и длительных агентов.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B-FP8",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"gemma3-27b",enabled:true,name:"Gemma 3 27B",developer:"Google",architecture:"Dense",totalParamsB:27,activeParamsB:27,nativeContextK:128,maxContextK:128,bitsPerWeight:4,qualityTier:1,capabilities:["текст","изображения"],recommendedGpuId:"l40s",minGpuCount:1,sessionsPerReplica:8,precision:"INT4",license:"Gemma",note:"Компактная мультимодальная модель для типовых задач.",sourceUrl:"https://huggingface.co/google/gemma-3-27b-it",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"qwen3-32b",enabled:true,name:"Qwen3 32B",developer:"Alibaba Qwen",architecture:"Dense",totalParamsB:32,activeParamsB:32,nativeContextK:41,maxContextK:131,bitsPerWeight:4,qualityTier:1,capabilities:["текст","код","инструменты"],recommendedGpuId:"h100",minGpuCount:1,sessionsPerReplica:8,precision:"INT4",license:"Apache-2.0",note:"Типовые ответы, извлечение и код; контекст свыше 41 тыс. требует расширения.",sourceUrl:"https://github.com/QwenLM/Qwen3",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"llama33-70b",enabled:true,name:"Llama 3.3 70B",developer:"Meta",architecture:"Dense",totalParamsB:70,activeParamsB:70,nativeContextK:128,maxContextK:128,bitsPerWeight:4,qualityTier:2,capabilities:["текст","код","инструменты"],recommendedGpuId:"h100nvl",minGpuCount:1,sessionsPerReplica:8,precision:"INT4",license:"Llama 3.3 Community",note:"Универсальная корпоративная модель среднего класса.",sourceUrl:"https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"qwen3-235b",enabled:true,name:"Qwen3-235B-A22B Instruct 2507",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:235,activeParamsB:22,nativeContextK:262,maxContextK:262,bitsPerWeight:4,qualityTier:2,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:2,sessionsPerReplica:8,precision:"INT4",license:"Apache-2.0",note:"Корпоративная модель для документов, аналитики и агентных сценариев.",sourceUrl:"https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"glm45",enabled:true,name:"GLM-4.5 355B-A32B",developer:"Z.ai",architecture:"MoE",totalParamsB:355,activeParamsB:32,nativeContextK:128,maxContextK:128,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"MIT-like",note:"Продвинутые агентные задачи, рассуждение и программирование.",sourceUrl:"https://huggingface.co/zai-org/GLM-4.5-FP8",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"qwen3-coder-480b",enabled:true,name:"Qwen3-Coder 480B-A35B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:480,activeParamsB:35,nativeContextK:262,maxContextK:262,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"Apache-2.0",note:"Разработка ПО и длительные задачи с инструментами.",sourceUrl:"https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"deepseek-v3",enabled:true,name:"DeepSeek-V3 671B-A37B",developer:"DeepSeek",architecture:"MoE",totalParamsB:671,activeParamsB:37,nativeContextK:128,maxContextK:128,bitsPerWeight:8,qualityTier:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"DeepSeek Model License",note:"Сложный анализ, программирование и многошаговые задачи.",sourceUrl:"https://github.com/deepseek-ai/DeepSeek-V3",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"deepseek-r1",enabled:true,name:"DeepSeek-R1 671B-A37B",developer:"DeepSeek",architecture:"MoE",totalParamsB:671,activeParamsB:37,nativeContextK:128,maxContextK:128,bitsPerWeight:8,qualityTier:4,capabilities:["текст","код"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"FP8",license:"MIT",note:"Усиленное рассуждение для экспертных задач; инструменты требуют внешней оркестрации.",sourceUrl:"https://github.com/deepseek-ai/DeepSeek-R1",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"kimi-k2",enabled:true,name:"Kimi K2 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32,nativeContextK:128,maxContextK:128,bitsPerWeight:8,qualityTier:4,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:16,sessionsPerReplica:8,precision:"FP8",license:"Modified MIT",note:"Триллионная агентная модель первого поколения.",sourceUrl:"https://github.com/MoonshotAI/Kimi-K2",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"kimi-k25",enabled:true,name:"Kimi K2.5 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32,nativeContextK:256,maxContextK:256,bitsPerWeight:4,qualityTier:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:8,precision:"INT4",license:"Modified MIT",note:"Длительные агентные задачи, большой контекст и изображения.",sourceUrl:"https://github.com/MoonshotAI/Kimi-K2.5",sourceDate:"2026-09-02",evidence:"Публичные характеристики"},
    {id:"ring-26-1t",enabled:true,name:"Ring 2.6 1T-A50B",developer:"Ant Group / InclusionAI",architecture:"MoE",totalParamsB:1000,activeParamsB:50,nativeContextK:131,maxContextK:256,bitsPerWeight:8,qualityTier:4,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:16,sessionsPerReplica:8,precision:"FP8",license:"MIT",note:"Актуальная триллионная reasoning-модель; конфигурация GPU остаётся инженерной оценкой.",sourceUrl:"https://huggingface.co/inclusionAI/Ring-2.6-1T",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"kimi-k3",enabled:true,name:"Kimi K3 2.8T-A104B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:2800,activeParamsB:104,nativeContextK:1049,maxContextK:1049,bitsPerWeight:4,qualityTier:5,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:8,sessionsPerReplica:8,precision:"MXFP4/MXFP8",license:"Kimi K3 License",note:"Верхний frontier-класс мультимодальных и длительных агентных задач.",sourceUrl:"https://huggingface.co/moonshotai/Kimi-K3",sourceDate:"2026-09-02",evidence:"Публичные характеристики"}
  ],
  tasks: [
    {id:"search",enabled:true,title:"Корпоративный поиск и ответы",description:"Регламенты, инструкции и база знаний",category:"Знания",minQualityTier:1,minContextK:32,requiredCapabilities:["текст"]},
    {id:"extract",enabled:true,title:"Извлечение и классификация",description:"Реквизиты, формы и маршрутизация",category:"Документы",minQualityTier:1,minContextK:16,requiredCapabilities:["текст"]},
    {id:"summary",enabled:true,title:"Пересказы и отчёты",description:"Сводки документов, писем и совещаний",category:"Документы",minQualityTier:1,minContextK:64,requiredCapabilities:["текст"]},
    {id:"contracts",enabled:true,title:"Договоры и закупки",description:"Риски, исключения и противоречия",category:"Корпоративные функции",minQualityTier:2,minContextK:128,requiredCapabilities:["текст"]},
    {id:"estimates",enabled:true,title:"Сметы, КС-2 и комплекты документов",description:"Ведомости, сметы, акты и итоговые файлы",category:"Строительство",minQualityTier:2,minContextK:128,requiredCapabilities:["текст"]},
    {id:"management",enabled:true,title:"Управленческая аналитика",description:"Сопоставление источников и варианты решений",category:"Управление",minQualityTier:3,minContextK:128,requiredCapabilities:["текст","инструменты"]},
    {id:"incidents",enabled:true,title:"Технические инциденты",description:"Журналы, регламенты и причинные связи",category:"Производство",minQualityTier:3,minContextK:128,requiredCapabilities:["текст","инструменты"]},
    {id:"coding",enabled:true,title:"Разработка программных систем",description:"Репозитории, изменения кода и проверки",category:"ИТ",minQualityTier:3,minContextK:128,requiredCapabilities:["код","инструменты"]},
    {id:"vision",enabled:true,title:"Документы с изображениями и схемами",description:"Страницы, таблицы, чертежи и изображения",category:"Мультимодальность",minQualityTier:3,minContextK:128,requiredCapabilities:["изображения","текст"]},
    {id:"agents",enabled:true,title:"Исследовательские и инженерные агенты",description:"Планы, расчёты, инструменты и проверка гипотез",category:"Агенты",minQualityTier:4,minContextK:256,requiredCapabilities:["агенты","инструменты"]},
    {id:"long",enabled:true,title:"Сверхдлинный контекст",description:"Сотни документов или крупный репозиторий",category:"Предельные задачи",minQualityTier:3,minContextK:512,requiredCapabilities:["длинный контекст"]},
    {id:"frontier",enabled:true,title:"Предельные мультимодальные задачи",description:"Изображения, длительная автономность и высокий потолок качества",category:"Предельные задачи",minQualityTier:5,minContextK:1000,requiredCapabilities:["изображения","агенты","длинный контекст"]}
  ]
};

export function cloneDefaultConfig(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;
}

export function modelWeightGb(model: ModelConfig): number {
  return model.checkpointWeightGb ?? model.totalParamsB * model.bitsPerWeight / 8;
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  if (!config || typeof config !== "object") return ["Конфигурация должна быть объектом."];
  if (!Array.isArray(config.models) || !Array.isArray(config.gpus) || !Array.isArray(config.tasks) || !config.assumptions || typeof config.assumptions !== "object") return ["Конфигурация не содержит обязательные каталоги или допущения."];
  if (config.models.some(model => !model || typeof model !== "object") || config.gpus.some(gpu => !gpu || typeof gpu !== "object") || config.tasks.some(task => !task || typeof task !== "object")) return ["Элементы каталогов должны быть объектами."];
  if (config.schemaVersion !== 2) errors.push("Поддерживается только версия схемы 2.");
  const validIds = (ids: unknown[]) => ids.every(id => typeof id === "string" && id.trim().length > 0) && new Set(ids).size === ids.length;
  if (!validIds(config.models.map(x => x.id))) errors.push("Идентификаторы моделей должны быть непустыми и уникальными.");
  if (!validIds(config.gpus.map(x => x.id))) errors.push("Идентификаторы GPU должны быть непустыми и уникальными.");
  if (!validIds(config.tasks.map(x => x.id))) errors.push("Идентификаторы задач должны быть непустыми и уникальными.");
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const positiveInteger = (value: unknown) => finite(value) && Number.isInteger(value) && value > 0;
  const allowedCapabilities: Capability[] = ["текст","код","изображения","инструменты","длинный контекст","агенты"];
  const gpuIds = new Set(config.gpus.map(x => x.id).filter((id): id is string => typeof id === "string"));
  const enabledGpuIds = new Set(config.gpus.filter(x => x.enabled).map(x => x.id).filter((id): id is string => typeof id === "string"));
  if (!config.models.some(x => x.enabled)) errors.push("Должна быть включена хотя бы одна модель.");
  if (!config.gpus.some(x => x.enabled)) errors.push("Должен быть включён хотя бы один GPU.");
  for (const model of config.models) {
    const modelName = typeof model.name === "string" && model.name.trim() ? model.name : String(model.id ?? "без названия");
    if (!finite(model.totalParamsB) || !finite(model.activeParamsB) || model.totalParamsB <= 0 || model.activeParamsB <= 0 || model.activeParamsB > model.totalParamsB) errors.push(`Модель «${modelName}»: проверьте количество параметров.`);
    if (!gpuIds.has(model.recommendedGpuId)) errors.push(`Модель «${model.name}» ссылается на отсутствующий GPU.`);
    if (model.enabled && !enabledGpuIds.has(model.recommendedGpuId)) errors.push(`Модель «${model.name}» ссылается на выключенный GPU.`);
    if (!finite(model.qualityTier) || !Number.isInteger(model.qualityTier) || model.qualityTier < 1 || model.qualityTier > MAX_QUALITY_TIER) errors.push(`Модель «${modelName}»: класс качества должен быть от 1 до ${MAX_QUALITY_TIER}.`);
    if (!positiveInteger(model.minGpuCount) || !positiveInteger(model.nativeContextK) || !positiveInteger(model.maxContextK) || model.maxContextK < model.nativeContextK || !finite(model.bitsPerWeight) || model.bitsPerWeight <= 0 || !positiveInteger(model.sessionsPerReplica)) errors.push(`Модель «${modelName}»: GPU, сессии и контекст должны быть положительными целыми числами, а максимальный контекст — не меньше нативного.`);
    if (model.checkpointWeightGb !== undefined && (!finite(model.checkpointWeightGb) || model.checkpointWeightGb <= 0)) errors.push(`Модель «${modelName}»: размер чекпоинта должен быть положительным числом.`);
    if (model.architecture !== "Dense" && model.architecture !== "MoE") errors.push(`Модель «${modelName}»: неизвестная архитектура.`);
    if (!Array.isArray(model.capabilities) || model.capabilities.some(capability => !allowedCapabilities.includes(capability))) errors.push(`Модель «${modelName}»: указана неизвестная возможность.`);
    if (!["Публичные характеристики","Конфигурация проверена поставщиком","Инженерная оценка"].includes(model.evidence)) errors.push(`Модель «${modelName}»: неизвестный статус источника.`);
    const recommendedGpu = config.gpus.find(gpu => gpu.id === model.recommendedGpuId);
    if (recommendedGpu && finite(model.totalParamsB) && finite(model.bitsPerWeight) && (model.checkpointWeightGb === undefined || finite(model.checkpointWeightGb)) && finite(config.assumptions.memoryOverheadPct) && finite(config.assumptions.usableMemoryPct) && finite(recommendedGpu.memoryGb) && positiveInteger(model.minGpuCount)) {
      const requiredMemoryGb = modelWeightGb(model) * (1 + config.assumptions.memoryOverheadPct / 100);
      const availableMemoryGb = model.minGpuCount * recommendedGpu.memoryGb * config.assumptions.usableMemoryPct / 100;
      if (availableMemoryGb < requiredMemoryGb) errors.push(`Модель «${model.name}»: минимальная конфигурация GPU не вмещает чекпоинт с заданным запасом.`);
    }
  }
  for (const task of config.tasks) {
    const taskName = typeof task.title === "string" && task.title.trim() ? task.title : String(task.id ?? "без названия");
    if (!finite(task.minQualityTier) || !Number.isInteger(task.minQualityTier) || task.minQualityTier < 1 || task.minQualityTier > MAX_QUALITY_TIER) errors.push(`Задача «${taskName}»: класс качества должен быть от 1 до ${MAX_QUALITY_TIER}.`);
    if (!positiveInteger(task.minContextK)) errors.push(`Задача «${taskName}»: контекст должен быть положительным целым числом.`);
    if (!Array.isArray(task.requiredCapabilities) || task.requiredCapabilities.some(capability => !allowedCapabilities.includes(capability))) errors.push(`Задача «${taskName}»: указана неизвестная возможность.`);
  }
  for (const gpu of config.gpus) {
    const gpuName = typeof gpu.name === "string" && gpu.name.trim() ? gpu.name : String(gpu.id ?? "без названия");
    if (!finite(gpu.memoryGb) || gpu.memoryGb <= 0 || !positiveInteger(gpu.nodeGpuCount) || !finite(gpu.nodePriceRub) || gpu.nodePriceRub < 0 || !finite(gpu.rentPerGpuHourRub) || gpu.rentPerGpuHourRub < 0 || !finite(gpu.nodePowerKw) || gpu.nodePowerKw <= 0 || !finite(gpu.memoryBandwidthTb) || gpu.memoryBandwidthTb < 0) errors.push(`GPU «${gpuName}»: проверьте память, целое количество GPU в узле, мощность, пропускную способность и цены.`);
    if (!["Публичная цена","Коммерческая оценка","Инженерная оценка"].includes(gpu.priceKind)) errors.push(`GPU «${gpuName}»: неизвестный статус цены.`);
  }
  const a = config.assumptions;
  if (!finite(a.defaultHoursMonth) || a.defaultHoursMonth < 0 || a.defaultHoursMonth > 730) errors.push("Использование по умолчанию должно быть от 0 до 730 ч/мес.");
  if (!positiveInteger(a.defaultYears) || !positiveInteger(a.defaultConcurrency)) errors.push("Горизонт и параллельность по умолчанию должны быть положительными целыми числами.");
  if (!finite(a.pue) || a.pue < 1) errors.push("PUE не может быть меньше 1.");
  const percentageKeys: Array<keyof Assumptions> = ["supportPctCapexYear","fitoutPctCapex","idlePowerPct","memoryOverheadPct","usableMemoryPct","rentalServicePct","contingencyPct","residualValuePct"];
  if (percentageKeys.some(key => !finite(a[key]) || a[key] < 0 || a[key] > 100) || a.usableMemoryPct === 0) errors.push("Процентные допущения должны быть в диапазоне от 0 до 100%, а используемая память — больше 0%.");
  const nonNegativeKeys: Array<keyof Assumptions> = ["electricityRubKwh","rackMonthPerNodeRub","networkStorageMonthRub","operationsMonthRub"];
  if (nonNegativeKeys.some(key => !finite(a[key]) || a[key] < 0)) errors.push("Стоимостные допущения не могут быть отрицательными.");
  if (!finite(a.stalePriceDays) || !Number.isInteger(a.stalePriceDays) || a.stalePriceDays < 0) errors.push("Срок актуальности цены должен быть неотрицательным целым числом дней.");
  return errors;
}
