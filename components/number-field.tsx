"use client";

import { useEffect, useId, useState } from "react";

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000000,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const valid =
    text.trim() !== "" &&
    Number.isFinite(Number(text)) &&
    Number(text) >= min &&
    Number(text) <= max &&
    (step < 1 || Number.isInteger(Number(text)));
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        className="control"
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-invalid={!valid}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          const number = Number(raw);
          if (
            raw.trim() &&
            Number.isFinite(number) &&
            number >= min &&
            number <= max &&
            (step < 1 || Number.isInteger(number))
          )
            onChange(number);
        }}
        onBlur={() => setText(String(value))}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
