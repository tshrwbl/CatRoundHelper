import { Search } from "lucide-react";
import { useState } from "react";

export function CollegePicker({ options, college, onSelect }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery ? options.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 8) : [];
  const choose = (item) => {
    onSelect({ collegeCode: Number(item.code), collegeName: item.name });
    setQuery("");
  };
  return (
    <div className="college-picker">
      <label htmlFor="college-search">Find a college</label>
      <div className="college-search">
        <Search size={16} />
        <input id="college-search" value={query} placeholder={college ? college.collegeName : "Type a college name…"} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        {matches.length > 0 && (
          <ul className="college-suggestions" role="listbox">
            {matches.map((item) => (
              <li key={item.code}>
                <button type="button" onClick={() => choose(item)}>
                  <strong>{item.name}</strong>
                  <span>Code {item.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
