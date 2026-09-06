/** The explicit monthly horizon is authoritative. `years` is only a legacy fallback. */
export function calculationMonths(input: {
  months?: number;
  years: number;
}): number {
  if (input.months !== undefined) {
    if (
      !Number.isSafeInteger(input.months) ||
      input.months < 1 ||
      input.months > 120
    )
      throw new Error(
        "Горизонт расчёта должен быть целым числом от 1 до 120 месяцев.",
      );
    return input.months;
  }
  if (!Number.isSafeInteger(input.years) || input.years < 1 || input.years > 5)
    throw new Error(
      "Срок старого расчёта должен быть целым числом от 1 до 5 лет.",
    );
  return input.years * 12;
}
