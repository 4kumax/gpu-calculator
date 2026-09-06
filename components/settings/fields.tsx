import { Capability } from "@/lib/config";
import { ReactNode, useEffect, useState } from "react";

export const CAPABILITIES: Capability[] = [
  "текст",
  "код",
  "изображения",
  "инструменты",
  "длинный контекст",
  "агенты",
];
export const numberValue = (value: string) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

export function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "url";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="control"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  optional = false,
  min,
  max,
  step = "any",
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? "" : String(value));
  }, [value, focused]);
  const invalid = !optional && text.trim() === "";
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="control"
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === "") {
            if (optional) onChange(undefined);
            return;
          }
          const number = Number(next);
          if (Number.isFinite(number)) onChange(number);
        }}
        onBlur={() => {
          setFocused(false);
          setText(value === undefined ? "" : String(value));
        }}
      />
      {invalid && (
        <small>
          Введите число. При выходе из поля восстановится прежнее значение.
        </small>
      )}
    </label>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
export function EnabledField({
  label = "Включено",
  value,
  onChange,
}: {
  label?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function CapabilityField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Capability[];
  onChange: (value: Capability[]) => void;
}) {
  return (
    <fieldset className="capability-options">
      <legend>{label}</legend>
      {CAPABILITIES.map((capability) => (
        <label key={capability}>
          <input
            type="checkbox"
            checked={value.includes(capability)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value.filter((item) => item !== capability), capability]
                  : value.filter((item) => item !== capability),
              )
            }
          />
          <span>{capability}</span>
        </label>
      ))}
    </fieldset>
  );
}
