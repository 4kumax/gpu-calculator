export type PriceKind = "Публичная цена" | "Коммерческая оценка" | "Инженерная оценка";
export type Capability = "текст" | "код" | "изображения" | "инструменты" | "длинный контекст" | "агенты";

export type ModelConfig = {
  id: string;
  enabled: boolean;
  name: string;
  developer: string;
  architecture: "Dense" | "MoE";
  totalParamsB: number;
  activeParamsB: number;
  contextK: number;
  bitsPerWeight: number;
  level: number;
  capabilities: Capability[];
  recommendedGpuId: string;
  minGpuCount: number;
  sessionsPerReplica: number;
  precision: string;
  license: string;
  note: string;
  sourceUrl: string;
  sourceDate: string;
  evidence: "Публичная рекомендация" | "Проверено поставщиком" | "Инженерная оценка";
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
  minLevel: number;
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
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  assumptions: Assumptions;
  models: ModelConfig[];
  gpus: GpuConfig[];
  tasks: TaskRule[];
};

export const STORAGE_KEY = "gpu-calculator:settings:v1";

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  revision: 1,
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
    {id:"ministral3-8b",enabled:true,name:"Ministral 3 8B Reasoning",developer:"Mistral AI",architecture:"Dense",totalParamsB:9,activeParamsB:9,contextK:262,bitsPerWeight:16,level:1,capabilities:["текст","код","изображения"],recommendedGpuId:"rtx4090",minGpuCount:1,sessionsPerReplica:14,precision:"BF16",license:"Apache-2.0",note:"Компактная мультимодальная reasoning-модель для локальных помощников.",sourceUrl:"https://huggingface.co/mistralai/Ministral-3-8B-Reasoning-2512",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"gpt-oss-20b",enabled:true,name:"GPT-OSS 20B",developer:"OpenAI",architecture:"MoE",totalParamsB:21,activeParamsB:3.6,contextK:131,bitsPerWeight:4,level:1,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"rtx4090",minGpuCount:1,sessionsPerReplica:14,precision:"MXFP4",license:"Apache-2.0 / Usage Policy",note:"Быстрая модель рассуждения и инструментальных вызовов.",sourceUrl:"https://huggingface.co/openai/gpt-oss-20b",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"qwen38-27b",enabled:true,name:"Qwen3.8 27B",developer:"Alibaba Qwen",architecture:"Dense",totalParamsB:27,activeParamsB:27,contextK:262,bitsPerWeight:4,level:2,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:1,sessionsPerReplica:12,precision:"NVFP4",license:"Apache-2.0",note:"Мультимодальная модель для документов, кода, видео и исследований.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-27B",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"tpro-it-21",enabled:true,name:"T-pro-it 2.1 33B",developer:"Т-Технологии",architecture:"Dense",totalParamsB:33,activeParamsB:33,contextK:131,bitsPerWeight:16,level:2,capabilities:["текст","код","инструменты"],recommendedGpuId:"h200",minGpuCount:1,sessionsPerReplica:9,precision:"BF16",license:"Apache-2.0",note:"Русскоязычный корпоративный ассистент и работа с инструкциями.",sourceUrl:"https://huggingface.co/t-tech/T-pro-it-2.1",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"gpt-oss-120b",enabled:true,name:"GPT-OSS 120B",developer:"OpenAI",architecture:"MoE",totalParamsB:117,activeParamsB:5.1,contextK:131,bitsPerWeight:4,level:2,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h100",minGpuCount:1,sessionsPerReplica:10,precision:"MXFP4",license:"Apache-2.0 / Usage Policy",note:"Универсальная reasoning-модель для агентов и инструментов.",sourceUrl:"https://huggingface.co/openai/gpt-oss-120b",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"mistral-small4",enabled:true,name:"Mistral Small 4 119B-A6.5B",developer:"Mistral AI",architecture:"MoE",totalParamsB:119,activeParamsB:6.5,contextK:256,bitsPerWeight:4,level:2,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:1,sessionsPerReplica:9,precision:"NVFP4",license:"Apache-2.0",note:"Извлечение из документов, код, изображения и корпоративные агенты.",sourceUrl:"https://huggingface.co/mistralai/Mistral-Small-4-119B-2603",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"qwen38-flash",enabled:true,name:"Qwen3.8 Flash Next 125B-A6B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:125,activeParamsB:6,contextK:1000,bitsPerWeight:8,level:3,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:2,sessionsPerReplica:10,precision:"FP8",license:"Qwen Community 1.0",note:"Экономичная модель для длинного контекста, видео, кода и агентов.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-Flash-Next",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"minimax-m27",enabled:true,name:"MiniMax M2.7 230B-A10B",developer:"MiniMax AI",architecture:"MoE",totalParamsB:230,activeParamsB:10,contextK:196,bitsPerWeight:8,level:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h100",minGpuCount:4,sessionsPerReplica:8,precision:"FP8",license:"Модифицированная; требуется юрпроверка",note:"Код, офисные задачи и многошаговые агенты.",sourceUrl:"https://huggingface.co/MiniMaxAI/MiniMax-M2.7",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"deepseek-v4-flash",enabled:true,name:"DeepSeek V4 Flash 284B-A13B",developer:"DeepSeek",architecture:"MoE",totalParamsB:284,activeParamsB:13,contextK:1000,bitsPerWeight:4,level:4,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:4,sessionsPerReplica:9,precision:"FP4/FP8",license:"MIT",note:"Код, длительные агенты и анализ сверхдлинных документов.",sourceUrl:"https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"glm53-flash",enabled:true,name:"GLM-5.3 Flash 321B-A18B",developer:"Z.ai",architecture:"MoE",totalParamsB:321,activeParamsB:18,contextK:1000,bitsPerWeight:8,level:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb200",minGpuCount:4,sessionsPerReplica:8,precision:"FP8",license:"MIT",note:"Мультимодальная модель для кода, документов, видео и агентов.",sourceUrl:"https://huggingface.co/zai-org/GLM-5.3-Flash",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"gigachat35-432b",enabled:true,name:"GigaChat 3.5 432B-A28B",developer:"Sber AI",architecture:"MoE",totalParamsB:432,activeParamsB:28,contextK:262,bitsPerWeight:8,level:4,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:7,precision:"FP8",license:"MIT",note:"Русский и английский язык, код, рассуждение и инструменты.",sourceUrl:"https://huggingface.co/ai-sage/GigaChat3.5-432B-A28B",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"minimax-m3",enabled:true,name:"MiniMax M3 428B-A23B",developer:"MiniMax AI",architecture:"MoE",totalParamsB:428,activeParamsB:23,contextK:1000,bitsPerWeight:16,level:5,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:7,precision:"BF16",license:"MiniMax Community",note:"Предельный код, изображения, видео и управление интерфейсами.",sourceUrl:"https://huggingface.co/MiniMaxAI/MiniMax-M3",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"mistral-large3",enabled:true,name:"Mistral Large 3 675B-A41B",developer:"Mistral AI",architecture:"MoE",totalParamsB:675,activeParamsB:41,contextK:256,bitsPerWeight:4,level:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"b200",minGpuCount:4,sessionsPerReplica:7,precision:"NVFP4",license:"Apache-2.0",note:"Корпоративный поиск, наука, код и мультимодальные документы.",sourceUrl:"https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"glm53",enabled:true,name:"GLM-5.3 743B-A39B",developer:"Z.ai",architecture:"MoE",totalParamsB:743,activeParamsB:39,contextK:1000,bitsPerWeight:8,level:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:6,precision:"FP8",license:"GLM-5.3; требуется юрпроверка",note:"Сложный код, рассуждение и длительные агентные задачи.",sourceUrl:"https://huggingface.co/zai-org/GLM-5.3",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"kimi-k26",enabled:true,name:"Kimi K2.6 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32.4,contextK:256,bitsPerWeight:4,level:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:7,precision:"INT4",license:"Modified MIT",note:"Сложный код, изображения, видео и автономные агенты.",sourceUrl:"https://huggingface.co/moonshotai/Kimi-K2.6",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"deepseek-v4-pro",enabled:true,name:"DeepSeek V4 Pro 1.6T-A49B",developer:"DeepSeek",architecture:"MoE",totalParamsB:1600,activeParamsB:49,contextK:1000,bitsPerWeight:4,level:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:6,precision:"FP4/FP8",license:"MIT",note:"Предельный код, рассуждение и длительные автономные агенты.",sourceUrl:"https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"qwen38-24t",enabled:true,name:"Qwen3.8 2.4T-A95B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:2400,activeParamsB:95,contextK:1000,bitsPerWeight:4,level:5,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:8,sessionsPerReplica:7,precision:"NVFP4",license:"Qwen3.8 Max; требуется юрпроверка",note:"Предельный класс кода, исследований и длительных агентов.",sourceUrl:"https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"gemma3-27b",enabled:true,name:"Gemma 3 27B",developer:"Google",architecture:"Dense",totalParamsB:27,activeParamsB:27,contextK:128,bitsPerWeight:4,level:1,capabilities:["текст","изображения"],recommendedGpuId:"l40s",minGpuCount:1,sessionsPerReplica:12,precision:"INT4",license:"Gemma",note:"Компактная мультимодальная модель для типовых задач.",sourceUrl:"https://huggingface.co/google/gemma-3-27b-it",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"qwen3-32b",enabled:true,name:"Qwen3 32B",developer:"Alibaba Qwen",architecture:"Dense",totalParamsB:32,activeParamsB:32,contextK:128,bitsPerWeight:4,level:1,capabilities:["текст","код","инструменты"],recommendedGpuId:"h100",minGpuCount:1,sessionsPerReplica:12,precision:"INT4",license:"Apache-2.0",note:"Типовые ответы, извлечение, маршрутизация и код.",sourceUrl:"https://github.com/QwenLM/Qwen3",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"llama33-70b",enabled:true,name:"Llama 3.3 70B",developer:"Meta",architecture:"Dense",totalParamsB:70,activeParamsB:70,contextK:128,bitsPerWeight:4,level:2,capabilities:["текст","код","инструменты"],recommendedGpuId:"h100nvl",minGpuCount:1,sessionsPerReplica:8,precision:"INT4",license:"Llama 3.3 Community",note:"Универсальная корпоративная модель среднего класса.",sourceUrl:"https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"qwen3-235b",enabled:true,name:"Qwen3-235B-A22B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:235,activeParamsB:22,contextK:128,bitsPerWeight:4,level:2,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:2,sessionsPerReplica:8,precision:"INT4",license:"Apache-2.0",note:"Основная корпоративная модель для документов и аналитики.",sourceUrl:"https://github.com/QwenLM/Qwen3",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"glm45",enabled:true,name:"GLM-4.5 355B-A32B",developer:"Z.ai",architecture:"MoE",totalParamsB:355,activeParamsB:32,contextK:128,bitsPerWeight:4,level:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:4,sessionsPerReplica:7,precision:"INT4",license:"MIT-like",note:"Агентные задачи, рассуждение и программирование.",sourceUrl:"https://huggingface.co/zai-org/GLM-4.5",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"qwen3-coder-480b",enabled:true,name:"Qwen3-Coder 480B-A35B",developer:"Alibaba Qwen",architecture:"MoE",totalParamsB:480,activeParamsB:35,contextK:256,bitsPerWeight:4,level:3,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:4,sessionsPerReplica:6,precision:"INT4",license:"Apache-2.0",note:"Разработка ПО и длительные задачи с инструментами.",sourceUrl:"https://github.com/QwenLM/Qwen3-Coder",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"deepseek-v3",enabled:true,name:"DeepSeek-V3 671B-A37B",developer:"DeepSeek",architecture:"MoE",totalParamsB:671,activeParamsB:37,contextK:128,bitsPerWeight:4,level:3,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:4,sessionsPerReplica:6,precision:"INT4",license:"DeepSeek Model License",note:"Сложный анализ, программирование и многошаговые задачи.",sourceUrl:"https://github.com/deepseek-ai/DeepSeek-V3",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"deepseek-r1",enabled:true,name:"DeepSeek-R1 671B-A37B",developer:"DeepSeek",architecture:"MoE",totalParamsB:671,activeParamsB:37,contextK:128,bitsPerWeight:4,level:4,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:5,precision:"INT4",license:"MIT / model terms",note:"Усиленное рассуждение для экспертных задач.",sourceUrl:"https://github.com/deepseek-ai/DeepSeek-R1",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"kimi-k2",enabled:true,name:"Kimi K2 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32,contextK:128,bitsPerWeight:8,level:4,capabilities:["текст","код","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:16,sessionsPerReplica:6,precision:"FP8",license:"Modified MIT",note:"Триллионная агентная модель первого поколения.",sourceUrl:"https://github.com/MoonshotAI/Kimi-K2",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"kimi-k25",enabled:true,name:"Kimi K2.5 1T-A32B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:1000,activeParamsB:32,contextK:256,bitsPerWeight:8,level:4,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"h200",minGpuCount:8,sessionsPerReplica:6,precision:"FP8",license:"Modified MIT",note:"Длительные агентные задачи, большой контекст и изображения.",sourceUrl:"https://github.com/MoonshotAI/Kimi-K2.5",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"},
    {id:"ring-1t",enabled:true,name:"Ring-1T",developer:"Ant Group / InclusionAI",architecture:"MoE",totalParamsB:1000,activeParamsB:50,contextK:128,bitsPerWeight:8,level:4,capabilities:["текст","код","инструменты","агенты"],recommendedGpuId:"h200",minGpuCount:16,sessionsPerReplica:5,precision:"FP8",license:"См. карточку модели",note:"Триллионная модель рассуждения; конфигурация требует проверки.",sourceUrl:"https://arxiv.org/abs/2510.18855",sourceDate:"2026-09-02",evidence:"Инженерная оценка"},
    {id:"kimi-k3",enabled:true,name:"Kimi K3 2.8T-A104B",developer:"Moonshot AI",architecture:"MoE",totalParamsB:2800,activeParamsB:104,contextK:1000,bitsPerWeight:4,level:5,capabilities:["текст","код","изображения","инструменты","длинный контекст","агенты"],recommendedGpuId:"gb300",minGpuCount:8,sessionsPerReplica:8,precision:"MXFP4/MXFP8",license:"Kimi K3 License",note:"Предельный класс мультимодальных и длительных агентных задач.",sourceUrl:"https://huggingface.co/moonshotai/Kimi-K3",sourceDate:"2026-09-02",evidence:"Публичная рекомендация"}
  ],
  tasks: [
    {id:"search",enabled:true,title:"Корпоративный поиск и ответы",description:"Регламенты, инструкции и база знаний",category:"Знания",minLevel:1,minContextK:32,requiredCapabilities:["текст"]},
    {id:"extract",enabled:true,title:"Извлечение и классификация",description:"Реквизиты, формы и маршрутизация",category:"Документы",minLevel:1,minContextK:16,requiredCapabilities:["текст"]},
    {id:"summary",enabled:true,title:"Пересказы и отчёты",description:"Сводки документов, писем и совещаний",category:"Документы",minLevel:1,minContextK:64,requiredCapabilities:["текст"]},
    {id:"contracts",enabled:true,title:"Договоры и закупки",description:"Риски, исключения и противоречия",category:"Корпоративные функции",minLevel:2,minContextK:128,requiredCapabilities:["текст"]},
    {id:"estimates",enabled:true,title:"Сметы, КС-2 и комплекты документов",description:"Ведомости, сметы, акты и итоговые файлы",category:"Строительство",minLevel:2,minContextK:128,requiredCapabilities:["текст"]},
    {id:"management",enabled:true,title:"Управленческая аналитика",description:"Сопоставление источников и варианты решений",category:"Управление",minLevel:3,minContextK:128,requiredCapabilities:["текст","инструменты"]},
    {id:"incidents",enabled:true,title:"Технические инциденты",description:"Журналы, регламенты и причинные связи",category:"Производство",minLevel:3,minContextK:128,requiredCapabilities:["текст","инструменты"]},
    {id:"coding",enabled:true,title:"Разработка программных систем",description:"Репозитории, изменения кода и проверки",category:"ИТ",minLevel:3,minContextK:128,requiredCapabilities:["код","инструменты"]},
    {id:"vision",enabled:true,title:"Документы с изображениями и схемами",description:"Страницы, таблицы, чертежи и изображения",category:"Мультимодальность",minLevel:4,minContextK:128,requiredCapabilities:["изображения","текст"]},
    {id:"agents",enabled:true,title:"Исследовательские и инженерные агенты",description:"Планы, расчёты, инструменты и проверка гипотез",category:"Агенты",minLevel:4,minContextK:256,requiredCapabilities:["агенты","инструменты"]},
    {id:"long",enabled:true,title:"Сверхдлинный контекст",description:"Сотни документов или крупный репозиторий",category:"Предельные задачи",minLevel:5,minContextK:512,requiredCapabilities:["длинный контекст"]},
    {id:"frontier",enabled:true,title:"Предельные мультимодальные задачи",description:"Изображения, длительная автономность и высокий потолок качества",category:"Предельные задачи",minLevel:5,minContextK:1000,requiredCapabilities:["изображения","агенты","длинный контекст"]}
  ]
};

export function cloneDefaultConfig(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  if (config.schemaVersion !== 1) errors.push("Поддерживается только версия схемы 1.");
  const duplicate = (ids: string[]) => ids.find((id, i) => !id || ids.indexOf(id) !== i);
  if (duplicate(config.models.map(x => x.id))) errors.push("Идентификаторы моделей должны быть непустыми и уникальными.");
  if (duplicate(config.gpus.map(x => x.id))) errors.push("Идентификаторы GPU должны быть непустыми и уникальными.");
  if (duplicate(config.tasks.map(x => x.id))) errors.push("Идентификаторы задач должны быть непустыми и уникальными.");
  const gpuIds = new Set(config.gpus.map(x => x.id));
  for (const model of config.models) {
    if (model.totalParamsB <= 0 || model.activeParamsB <= 0 || model.activeParamsB > model.totalParamsB) errors.push(`Модель «${model.name}»: проверьте количество параметров.`);
    if (!gpuIds.has(model.recommendedGpuId)) errors.push(`Модель «${model.name}» ссылается на отсутствующий GPU.`);
    if (model.minGpuCount < 1 || model.contextK < 1) errors.push(`Модель «${model.name}»: конфигурация должна быть положительной.`);
  }
  for (const gpu of config.gpus) if (gpu.memoryGb <= 0 || gpu.nodeGpuCount < 1 || gpu.nodePriceRub < 0 || gpu.rentPerGpuHourRub < 0) errors.push(`GPU «${gpu.name}»: проверьте память, размер узла и цены.`);
  if (config.assumptions.pue < 1) errors.push("PUE не может быть меньше 1.");
  return errors;
}
