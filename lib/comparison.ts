import { AppConfig, GpuConfig, ModelConfig } from "@/lib/config";
import {
  calculate,
  CalculationInput,
  CalculationResult,
  evaluateModels,
} from "@/lib/calculator";

export type ComparisonRow = {
  id: string;
  model: ModelConfig;
  gpu: GpuConfig;
  result: CalculationResult | null;
  status: "measured" | "estimated" | "unsupported";
  eligible: boolean;
  reasons: string[];
  warnings: string[];
  /** Allocated share of a complete node price, not a separately purchasable card quote. */
  purchasePerGpuEquivalentRub: number;
  purchaseNodeRub: number;
  rentPerGpuHourRub: number;
  bestTcoRub: number | null;
};

export type DeploymentComparison = {
  /** One row for every enabled model × enabled accelerator; no silent omissions. */
  rows: ComparisonRow[];
  /** The best eligible accelerator for each model, or a rejected representative with reasons. */
  modelRows: ComparisonRow[];
  recommended: ComparisonRow | null;
};

/**
 * Compare the same scenario, period, reserve policy and prices for every pair.
 * Missing launch profiles remain unsupported even when a memory estimate is finite.
 * For a pair with several profiles, calculate chooses the best admissible profile.
 * Manual IDs in input do not narrow the comparison matrix.
 */
export function compareDeployments(
  config: AppConfig,
  input: CalculationInput,
): DeploymentComparison {
  const evaluation = evaluateModels(config, input.taskIds, input.asOf);
  const models = config.models.filter((model) => model.enabled);
  const gpus = config.gpus.filter((gpu) => gpu.enabled);
  const rows: ComparisonRow[] = [];
  for (const model of models) {
    for (const gpu of gpus) {
      let result: CalculationResult | null = null;
      let reasons: string[] = [];
      try {
        // Scope the candidate search, not the scenario or economic assumptions.
        result = calculate(
          { ...config, models: [model] },
          { ...input, modelId: model.id, gpuId: gpu.id },
        );
        reasons = result.selectionReasons;
      } catch (error) {
        reasons = [
          ...(evaluation.rejectedReasons[model.id] ?? []),
          error instanceof Error
            ? error.message
            : "Не удалось рассчитать конфигурацию.",
        ];
      }
      const eligible = result?.selectionValid === true;
      rows.push({
        id: `${model.id}--${gpu.id}--${result?.profile.id ?? "unavailable"}`,
        model,
        gpu,
        result,
        status: eligible ? result!.confidence : "unsupported",
        eligible,
        reasons: [...new Set(reasons)],
        warnings: result?.warnings ?? [],
        purchasePerGpuEquivalentRub: gpu.nodePriceRub / gpu.nodeGpuCount,
        purchaseNodeRub: gpu.nodePriceRub,
        rentPerGpuHourRub: gpu.rentPerGpuHourRub,
        bestTcoRub: result ? Math.min(result.buyTco, result.rentTco) : null,
      });
    }
  }
  const compareCost = (left: ComparisonRow, right: ComparisonRow) =>
    Number(!left.eligible) - Number(!right.eligible) ||
    Number(left.status !== "measured") - Number(right.status !== "measured") ||
    (left.bestTcoRub ?? Infinity) - (right.bestTcoRub ?? Infinity) ||
    left.id.localeCompare(right.id);
  const compareModels = (left: ComparisonRow, right: ComparisonRow) => {
    const eligibility = Number(!left.eligible) - Number(!right.eligible);
    if (eligibility) return eligibility;
    const qualityDifference =
      evaluation.qualityHeadroom[left.model.id] -
      evaluation.qualityHeadroom[right.model.id];
    if (input.priority === "quality")
      return -qualityDifference || compareCost(left, right);
    if (input.priority === "balance")
      return qualityDifference || compareCost(left, right);
    return (
      (left.bestTcoRub ?? Infinity) - (right.bestTcoRub ?? Infinity) ||
      -qualityDifference ||
      compareCost(left, right)
    );
  };
  const modelRows = models
    .map(
      (model) =>
        rows.filter((row) => row.model.id === model.id).sort(compareCost)[0],
    )
    .filter((row): row is ComparisonRow => row !== undefined)
    .sort(compareModels);
  return {
    rows,
    modelRows,
    // Costs can be inspected without tasks, but there is no business requirement
    // against which an automatic recommendation could be justified.
    recommended: input.taskIds.length
      ? (modelRows.find((row) => row.eligible) ?? null)
      : null,
  };
}
