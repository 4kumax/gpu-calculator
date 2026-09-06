import { useState } from "react";
import { AppConfig } from "@/lib/config";
import { configDifferences } from "@/lib/local-config-store";

export function DiffPreview({
  before,
  after,
  title = "Сравнение изменений",
}: {
  before: AppConfig;
  after: AppConfig;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const differences = configDifferences(before, after);
  const visible = expanded ? differences : differences.slice(0, 30);
  return (
    <div className="diff-preview">
      <h3>{title}</h3>
      <p>
        {differences.length
          ? `Изменено полей: ${differences.length}. Метаданные ревизии назначаются при сохранении.`
          : "Содержимое каталогов совпадает."}
      </p>
      {differences.length > 0 && (
        <div className="config-table-wrap">
          <table className="config-table diff-table">
            <thead>
              <tr>
                <th scope="col">Поле</th>
                <th scope="col">Сейчас</th>
                <th scope="col">После применения</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((difference) => (
                <tr key={difference.path}>
                  <th scope="row">{difference.path}</th>
                  <td>{difference.before}</td>
                  <td>{difference.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {differences.length > 30 && (
        <button className="button" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? "Свернуть список"
            : `Показать все ${differences.length} изменений`}
        </button>
      )}
    </div>
  );
}
