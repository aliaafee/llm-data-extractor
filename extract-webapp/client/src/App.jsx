import { useState, useEffect, useCallback } from "react";

// Field definitions with render type:
//   "scalar"  – string / number / Yes/No enum
//   "list"    – array of strings
//   "medlist" – array of {name, dose, frequency, duration}
const FIELDS = [
  { key: "patient_id",                    label: "Patient ID",                       type: "scalar"  },
  { key: "delirium",                      label: "Delirium",                         type: "scalar"  },
  { key: "age",                           label: "Age (years)",                      type: "scalar"  },
  { key: "sex",                           label: "Sex",                              type: "scalar"  },
  { key: "comorbidities",                 label: "Comorbidities",                    type: "list"    },
  { key: "baseline_cognitive_impairment", label: "Baseline Cognitive Impairment (GCS)", type: "scalar" },
  { key: "site_of_pathology",             label: "Site of Pathology",                type: "scalar"  },
  { key: "neurosurgical_diagnosis",       label: "Neurosurgical Diagnosis",          type: "scalar"  },
  { key: "diagnosis_group",               label: "Diagnosis Group",                  type: "scalar"  },
  { key: "list_of_opioids_used",          label: "Opioids Used",                     type: "medlist" },
  { key: "list_of_benzodiazepines_used",  label: "Benzodiazepines Used",             type: "medlist" },
  { key: "list_of_all_medications_used",  label: "All Medications Used",             type: "medlist" },
  { key: "sodium_imbalance",              label: "Sodium Imbalance",                 type: "scalar"  },
  { key: "infection",                     label: "Infection",                        type: "scalar"  },
];

const NULL_CELL = <span style={{ color: "#aaa", fontStyle: "italic" }}>—</span>;

function ScalarValue({ val }) {
  if (val === null || val === undefined) return NULL_CELL;
  const s = String(val);
  const color = s === "Yes" ? "#c0392b" : s === "No" ? "#27ae60" : "inherit";
  return <span style={{ color }}>{s}</span>;
}

function ListValue({ val }) {
  if (!Array.isArray(val) || val.length === 0) return NULL_CELL;
  return (
    <ul style={{ margin: 0, paddingLeft: "18px" }}>
      {val.map((item, i) => <li key={i}>{String(item)}</li>)}
    </ul>
  );
}

function MedListValue({ val }) {
  if (!Array.isArray(val) || val.length === 0) return NULL_CELL;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
      <thead>
        <tr style={{}}>
          {["Name", "Dose", "Frequency", "Duration"].map((h) => (
            <th key={h} style={innerThStyle}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {val.map((med, i) => (
          <tr key={i}>
            <td style={innerTdStyle}>{med.name ?? NULL_CELL}</td>
            <td style={innerTdStyle}>{med.dose ?? NULL_CELL}</td>
            <td style={innerTdStyle}>{med.frequency ?? NULL_CELL}</td>
            <td style={innerTdStyle}>{med.duration ?? NULL_CELL}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldValue({ type, val }) {
  if (type === "list")    return <ListValue val={val} />;
  if (type === "medlist") return <MedListValue val={val} />;
  return <ScalarValue val={val} />;
}

function ResultsBrowser() {
  const [list, setList]           = useState(null);   // [{patient_id, updated_at}]
  const [selected, setSelected]   = useState(null);   // patient_id
  const [detail, setDetail]       = useState(null);   // result object
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError]         = useState(null);

  const fetchList = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/results");
      if (!res.ok) throw new Error("Failed to load results");
      setList(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSelect = async (patientId) => {
    setSelected(patientId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/results/${encodeURIComponent(patientId)}`);
      if (!res.ok) throw new Error("Failed to load patient result");
      setDetail(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setDetailLoading(false);
  };

  const handleBack = () => { setSelected(null); setDetail(null); };

  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!list)  return <p style={{ color: "#555" }}>Loading…</p>;

  if (selected) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <button onClick={handleBack} style={backBtnStyle}>← Back</button>
          <h3 style={{ margin: 0 }}>Patient {selected}</h3>
        </div>
        {detailLoading && <p style={{ color: "#555" }}>Loading…</p>}
        {detail && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Value</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(({ key, label, type }) => (
                <tr key={key} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ ...tdStyle, fontWeight: "bold", whiteSpace: "nowrap" }}>{label}</td>
                  <td style={tdStyle}><FieldValue type={type} val={detail[key]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  if (list.length === 0)
    return <p style={{ color: "#777", fontStyle: "italic" }}>No processed results yet.</p>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <h3 style={{ margin: 0 }}>Processed Patients</h3>
        <button onClick={fetchList} style={refreshBtnStyle}>⟳ Refresh</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Patient ID</th>
            <th style={thStyle}>Processed At</th>
            <th style={{ ...thStyle, width: "80px" }}></th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ patient_id, updated_at }) => (
            <tr key={patient_id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={tdStyle}>{patient_id}</td>
              <td style={tdStyle}>{new Date(updated_at).toLocaleString()}</td>
              <td style={tdStyle}>
                <button onClick={() => handleSelect(patient_id)} style={viewBtnStyle}>View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function App() {
  const [tab, setTab]             = useState("extractor"); // "extractor" | "browse"
  const [file, setFile]           = useState(null);
  const [result, setResult]       = useState(null);
  const [raw, setRaw]             = useState("");
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState(null); // { chunk, total }

  const handleUpload = async () => {
    if (!file) return alert("Please select a file");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setResult(null);
    setRaw("");
    setProgress(null);

    try {
      const response = await fetch("/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep last incomplete block

        for (const block of events) {
          if (!block.trim()) continue;
          let eventType = null;
          let eventData = null;
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            if (eventType === "progress") {
              setProgress({ chunk: parsed.chunk, total: parsed.total });
              if (parsed.result && typeof parsed.result === "object") {
                setResult(parsed.result);
              }
            } else if (eventType === "done") {
              setProgress(null);
              const data = parsed.result;
              if (data && typeof data === "object") {
                setResult(data);
                setRaw("");
              } else {
                setResult(null);
                setRaw(String(data));
              }
            } else if (eventType === "error") {
              alert("Processing failed: " + (parsed.error ?? "Unknown error"));
            }
          } catch { /* ignore malformed event */ }
        }
      }
    } catch (err) {
      alert("Upload failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial", maxWidth: "900px", margin: "0" }}>
      <h2>Clinical Data Extractor</h2>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #ddd" }}>
        {[["extractor", "Extractor"], ["browse", "Browse Results"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "8px 20px",
              border: "none",
              borderBottom: tab === id ? "3px solid #2563eb" : "3px solid transparent",
              background: "none",
              fontWeight: tab === id ? "bold" : "normal",
              color: tab === id ? "#2563eb" : "#555",
              cursor: "pointer",
              fontSize: "1em",
              marginBottom: "-2px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "extractor" && (
        <>
          <input
            type="file"
            accept=".txt,.json"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <br /><br />

          <button onClick={handleUpload} disabled={loading}>
            {loading ? "Processing..." : "Upload & Analyze"}
          </button>

          {progress && (
            <p style={{ color: "#555", marginTop: "8px" }}>
              Processing chunk {progress.chunk} of {progress.total}…
            </p>
          )}

          {result && (
            <>
              <hr />
              <h3>Extracted Data</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Field</th>
                    <th style={thStyle}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(({ key, label, type }) => (
                    <tr key={key} style={{ borderBottom: "1px solid #ddd" }}>
                      <td style={{ ...tdStyle, fontWeight: "bold", whiteSpace: "nowrap" }}>{label}</td>
                      <td style={tdStyle}><FieldValue type={type} val={result[key]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {raw && (
            <>
              <hr />
              <h3>Raw Response</h3>
              <pre style={{ whiteSpace: "pre-wrap", padding: "12px" }}>{raw}</pre>
            </>
          )}
        </>
      )}

      {tab === "browse" && <ResultsBrowser />}
    </div>
  );
}

const thStyle        = { padding: "10px 12px", textAlign: "left", border: "1px solid #ccc" };
const tdStyle        = { padding: "8px 12px", verticalAlign: "top", border: "1px solid #ccc" };
const innerThStyle   = { padding: "4px 8px", textAlign: "left", border: "1px solid #ddd" };
const innerTdStyle   = { padding: "4px 8px", verticalAlign: "top", border: "1px solid #ddd" };
const viewBtnStyle   = { padding: "4px 12px", cursor: "pointer", fontSize: "0.9em" };
const backBtnStyle   = { padding: "5px 14px", cursor: "pointer" };
const refreshBtnStyle = { padding: "4px 12px", cursor: "pointer", fontSize: "0.9em" };

export default App;
