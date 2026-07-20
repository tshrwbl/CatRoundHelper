import { Plus, X, Save, Download, Upload, Check } from "lucide-react";
import { useState, useRef } from "react";
import { DEFAULT_PRESETS, ruleFields } from "./App";
import { FilterRule } from "./FilterRule";

export function FilterModal({
  rules,
  metadata,
  templates,
  defaultPresets = DEFAULT_PRESETS,
  fields = ruleFields,
  title = "Build your exact shortlist",
  description = "Each filter can include or exclude matching records. Filters run left to right with AND/OR.",
  onApply,
  onClose,
  onSaveTemplate,
}) {
  const [draft, setDraft] = useState(rules);
  const [name, setName] = useState("");
  const fileInputRef = useRef(null);
  const [exportStatus, setExportStatus] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const handleExport = () => {
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cap-compass-filters.json";
    a.click();
    URL.revokeObjectURL(url);

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(json)
        .then(() => {
          setExportStatus("Copied & Downloaded!");
          setTimeout(() => setExportStatus(""), 2000);
        })
        .catch(() => {
          setExportStatus("Downloaded!");
          setTimeout(() => setExportStatus(""), 2000);
        });
    } else {
      setExportStatus("Downloaded!");
      setTimeout(() => setExportStatus(""), 2000);
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const rulesArray = Array.isArray(imported) ? imported : imported.rules || [];
        if (!Array.isArray(rulesArray)) {
          alert("Invalid format: filters must be a JSON array of rules, or an object containing a rules array.");
          return;
        }
        const validated = rulesArray.filter((r) => r && typeof r === "object" && r.field);
        if (validated.length === 0 && rulesArray.length > 0) {
          alert("Could not find any valid filter rules in the file.");
          return;
        }
        const filtered = validated.filter((r) => fields.some(([val]) => val === r.field));
        setDraft(filtered);
      } catch (err) {
        alert("Failed to parse JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const update = (index, next) => setDraft((current) => current.map((rule, ruleIndex) => (ruleIndex === index ? next : rule)));
  const add = () =>
    setDraft((current) => [
      ...current,
      {
        field: fields[0][0],
        matcher: "in",
        mode: "include",
        value: [],
        listValue: "",
        join: "AND",
      },
    ]);
  const remove = (index) => setDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="filter-modal" role="dialog" aria-modal="true" aria-label="Advanced filter builder">
        <header>
          <div>
            <p className="eyebrow">Advanced query builder</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="close-modal" onClick={onClose}>
            <X /> Close
          </button>
        </header>
        <button className="template-toggle-btn" onClick={() => setTemplatesOpen(!templatesOpen)}>
          {templatesOpen ? "Hide templates & sharing" : "Show templates & sharing"}
        </button>
        <div className={`template-strip ${templatesOpen ? "open" : ""}`}>
          <label className="template-field">
            <span>Saved templates & presets</span>
            <select
              defaultValue=""
              onChange={(event) => {
                const allOptions = [...defaultPresets, ...templates];
                const template = allOptions.find((item) => item.id === event.target.value);
                if (template) setDraft(template.rules.filter((rule) => fields.some(([value]) => value === rule.field)));
              }}
            >
              <option value="">Load a saved template or preset…</option>
              {defaultPresets.length > 0 && (
                <optgroup label="Default Presets">
                  {defaultPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {templates.length > 0 && (
                <optgroup label="Saved Templates">
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="template-field">
            <span>Save template</span>
            <div className="template-input-group">
              <input value={name} placeholder="Template name" onChange={(event) => setName(event.target.value)} />
              <button
                className="template-btn"
                disabled={!name.trim()}
                onClick={() => {
                  onSaveTemplate(name.trim(), draft);
                  setName("");
                }}
                title="Save template"
                aria-label="Save template"
              >
                <Save size={16} />
              </button>
            </div>
          </label>
          <label className="template-field template-share-column">
            <span>Share</span>
            <div className="template-input-group">
              <button className="template-btn" type="button" onClick={handleExport} title={exportStatus || "Export templates"} aria-label={exportStatus || "Export templates"}>
                {exportStatus ? <Check size={16} style={{ color: "var(--diff-positive)" }} /> : <Download size={16} />}
              </button>
              <button className="template-btn" type="button" onClick={() => fileInputRef.current?.click()} title="Import templates" aria-label="Import templates">
                <Upload size={16} />
              </button>
              <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportFile} style={{ display: "none" }} />
            </div>
          </label>
        </div>
        <div className="modal-rules">
          {draft.length ? (
            draft.map((rule, index) => <FilterRule key={index} rule={rule} index={index} metadata={metadata} fields={fields} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />)
          ) : (
            <div className="empty compact">No filters yet. Add one to narrow or exclude results.</div>
          )}
        </div>
        <footer>
          <button className="add-rule" onClick={add}>
            <Plus size={16} /> Add filter
          </button>
          <div>
            <button className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              Apply filters
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
