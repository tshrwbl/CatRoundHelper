import { Plus, X } from "lucide-react";
import { useState, useMemo } from "react";
import { ruleFields, matchers } from "./App";
import { ValueSelectModal } from "./ValueSelectModal";

export function FilterRule({ rule, index, metadata, fields = ruleFields, onChange, onRemove }) {
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
  const field = fields.find(([value]) => value === rule.field) || fields[0];
  const options = metadata[field[2]] || [];

  const selected = useMemo(() => {
    if (Array.isArray(rule.value)) return rule.value;
    if (typeof rule.value === "string" && rule.value)
      return rule.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return [];
  }, [rule.value]);

  const hasInvalidOption = useMemo(() => {
    if (selected.length === 0) return false;
    if (options.length === 0) return false;
    return selected.some((val) => !options.includes(val));
  }, [selected, options]);

  const handleModalSelect = (nextSelected) => {
    onChange({
      ...rule,
      value: nextSelected,
      listValue: nextSelected.join(", "),
    });
  };

  const handleListValueChange = (event) => {
    const nextListValue = event.target.value;
    const parsed = nextListValue
      .split(",")
      .map((val) => val.trim())
      .filter(Boolean);
    onChange({
      ...rule,
      listValue: nextListValue,
      value: parsed,
    });
  };

  const matcher = rule.matcher || "contains";
  return (
    <article className="modal-rule">
      <div className="rule-heading">
        <span>Filter {index + 1}</span>
        {index > 0 && (
          <select className="join" value={rule.join || "AND"} onChange={(event) => onChange({ ...rule, join: event.target.value })}>
            <option>AND</option>
            <option>OR</option>
          </select>
        )}
        <button className="remove-rule" title="Remove filter" onClick={onRemove}>
          <X size={15} />
        </button>
      </div>
      <div className="rule-inputs">
        <label>
          Field
          <select value={field[0]} onChange={(event) => onChange({ ...rule, field: event.target.value, value: [], listValue: "" })}>
            {fields.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Match
          <select
            value={matcher}
            onChange={(event) =>
              onChange({
                ...rule,
                matcher: event.target.value,
                value: event.target.value === "in" ? [] : "",
                listValue: "",
              })
            }
          >
            {matchers.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Condition
          <select value={rule.mode || "include"} onChange={(event) => onChange({ ...rule, mode: event.target.value })}>
            <option value="include">Include matches</option>
            <option value="exclude">Exclude matches</option>
          </select>
        </label>
      </div>
      {matcher === "contains" && (
        <label className="rule-value">
          Text to find
          <input value={typeof rule.value === "string" ? rule.value : ""} placeholder="Matches like %this text%" onChange={(event) => onChange({ ...rule, value: event.target.value })} />
        </label>
      )}
      {matcher === "is" && (
        <label className="rule-value">
          Select one value
          <select value={typeof rule.value === "string" ? rule.value : ""} onChange={(event) => onChange({ ...rule, value: event.target.value })}>
            <option value="">Choose a value…</option>
            {options.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      )}
      {matcher === "in" && (
        <div className="list-values">
          <label>
            Pick multiple values
            <button
              type="button"
              className="secondary"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "9px 10px",
                height: "40px",
              }}
              onClick={() => setIsSelectModalOpen(true)}
            >
              <Plus size={16} /> Select values ({selected.length} selected)
            </button>
            <small>Click to open the multi-value selector dialog.</small>
          </label>
          <label>
            Or paste a comma-separated list
            <input value={rule.listValue || ""} placeholder="abc, cbd, 1234" onChange={handleListValueChange} className={hasInvalidOption ? "invalid-input" : ""} style={{ height: "40px" }} />
            <small
              style={{
                color: hasInvalidOption ? "#ef4444" : "var(--small-muted-color)",
                transition: "color 0.3s",
              }}
            >
              {hasInvalidOption ? "Warning: Some typed values do not match any available options." : "Typed values and selector choices are kept in sync."}
            </small>
          </label>

          <ValueSelectModal isOpen={isSelectModalOpen} onClose={() => setIsSelectModalOpen(false)} options={options} selected={selected} onSelect={handleModalSelect} fieldName={field[1]} />
        </div>
      )}
    </article>
  );
}
