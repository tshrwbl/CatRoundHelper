import { Search, X } from "lucide-react";
import { useState } from "react";

export function ValueSelectModal({ isOpen, onClose, options, selected, onSelect, fieldName }) {
  const [search, setSearch] = useState("");
  if (!isOpen) return null;

  const filteredOptions = options.filter((option) => String(option).toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (option) => {
    const isSelected = selected.includes(option);
    const nextSelected = isSelected ? selected.filter((item) => item !== option) : [...selected, option];
    onSelect(nextSelected);
  };

  return (
    <div className="modal-backdrop sub-modal-backdrop" style={{ zIndex: 30 }} onClick={(e) => e.stopPropagation()}>
      <section
        className="filter-modal value-select-modal"
        style={{
          maxWidth: "600px",
          maxHeight: "85vh",
          height: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ padding: "20px 24px 14px" }}>
          <div>
            <p className="eyebrow">Multi-value selector</p>
            <h2 style={{ fontSize: "20px", margin: "4px 0" }}>Select {fieldName}</h2>
            <p style={{ margin: 0 }}>Choose values to include/exclude ({selected.length} selected)</p>
          </div>
          <button className="close-modal" type="button" onClick={onClose} style={{ padding: "6px 10px", fontSize: "12px" }}>
            <X size={16} /> Close
          </button>
        </header>

        {selected.length > 0 && (
          <div className="selected-preview-bar">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {selected.map((item) => (
                <span
                  key={item}
                  className="tag"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    margin: "0",
                  }}
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => toggleOption(item)}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      display: "inline-flex",
                      color: "var(--remove-rule-color)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="search-box" style={{ padding: "14px 24px 8px" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              value={search}
              placeholder={`Search ${filteredOptions.length} of ${options.length} options...`}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "36px", height: "38px", borderRadius: "8px" }}
            />
          </div>
        </div>

        <div
          className="modal-rules"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minHeight: "200px",
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className="empty" style={{ minHeight: "120px" }}>
              No options match your search.
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <div key={option} className={`value-option-row ${isSelected ? "selected" : ""}`}>
                  <span>{option}</span>
                  <button
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={isSelected ? "remove-rule" : "add-rule"}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      alignSelf: "center",
                      width: "auto",
                      minWidth: "70px",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {isSelected ? "-" : "+"} {isSelected ? "Remove" : "Select"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <footer
          style={{
            padding: "14px 24px",
            background: "var(--modal-footer-bg)",
            borderTop: "1px solid var(--modal-footer-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button className="primary" type="button" onClick={onClose} style={{ padding: "8px 16px", fontSize: "13px" }}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
