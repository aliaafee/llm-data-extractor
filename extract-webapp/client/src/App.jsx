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
  const [tab, setTab]           = useState("extractor");
  const [queue, setQueue]       = useState([]); // [{id,name,status,patientId,progress,result,errorMsg}]
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null); // queue item id for detail view

  const updateItem = (id, patch) =>
    setQueue((q) => q.map((item) => item.id === id ? { ...item, ...patch } : item));

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files);
    setQueue(picked.map((f, i) => ({
      id: i, name: f.name, file: f,
      status: "pending", patientId: null, progress: null, result: null, errorMsg: null,
    })));
    setSelected(null);
  };

  const processFile = async (item) => {
    updateItem(item.id, { status: "processing" });
    const formData = new FormData();
    formData.append("file", item.file);
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

        const events = buffer.split("\n\n");
        buffer = events.pop();

        for (const block of events) {
          if (!block.trim()) continue;
          let eventType = null, eventData = null;
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            if (eventType === "progress") {
              updateItem(item.id, {
                progress: { chunk: parsed.chunk, total: parsed.total },
                ...(parsed.result?.patient_id ? { patientId: parsed.result.patient_id } : {}),
              });
            } else if (eventType === "done") {
              const data = parsed.result;
              updateItem(item.id, {
                status: "done",
                progress: null,
                result: data,
                patientId: data?.patient_id ?? null,
              });
            } else if (eventType === "error") {
              updateItem(item.id, { status: "error", progress: null, errorMsg: parsed.error ?? "Unknown error" });
            }
          } catch { /* ignore malformed event */ }
        }
      }
    } catch (err) {
      updateItem(item.id, { status: "error", progress: null, errorMsg: err.message });
    }
  };

  const handleUpload = async () => {
    if (queue.length === 0) return alert("Please select one or more files");
    setLoading(true);
    setSelected(null);
    // Reset all to pending before starting
    setQueue((q) => q.map((item) => ({ ...item, status: "pending", progress: null, result: null, errorMsg: null })));

    // Process sequentially — read fresh queue each iteration via closure workaround
    const snapshot = queue.map((item) => ({ ...item, status: "pending", progress: null, result: null, errorMsg: null }));
    for (const item of snapshot) {
      await processFile(item);
    }
    setLoading(false);
  };

  const doneCount    = queue.filter((i) => i.status === "done").length;
  const errorCount   = queue.filter((i) => i.status === "error").length;
  const selectedItem = queue.find((i) => i.id === selected);

  const statusBadge = (item) => {
    if (item.status === "pending")    return <span style={badge("gray")}>Pending</span>;
    if (item.status === "processing") return <span style={badge("blue")}>Chunk {item.progress?.chunk ?? "…"}/{item.progress?.total ?? "…"}</span>;
    if (item.status === "done")       return <span style={badge("green")}>Done</span>;
    if (item.status === "error")      return <span style={badge("red")} title={item.errorMsg}>Error</span>;
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial", maxWidth: "960px", margin: "0" }}>
      <h2>Clinical Data Extractor</h2>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #ddd" }}>
        {[["extractor", "Extractor"], ["browse", "Browse Results"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "8px 20px", border: "none",
            borderBottom: tab === id ? "3px solid #2563eb" : "3px solid transparent",
            background: "none", fontWeight: tab === id ? "bold" : "normal",
            color: tab === id ? "#2563eb" : "#555", cursor: "pointer", fontSize: "1em", marginBottom: "-2px",
          }}>{label}</button>
        ))}
      </div>

      {tab === "extractor" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <input type="file" accept=".txt,.json" multiple onChange={handleFilesChange} />
            <button onClick={handleUpload} disabled={loading || queue.length === 0}>
              {loading ? `Processing… (${doneCount + errorCount}/${queue.length})` : `Upload & Analyze${queue.length > 1 ? ` (${queue.length} files)` : ""}`}
            </button>
          </div>

          {queue.length > 0 && (
            <>
              <hr style={{ margin: "20px 0" }} />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>File</th>
                    <th style={thStyle}>Patient ID</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, width: "70px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id} style={{
                      borderBottom: "1px solid #ddd",
                      background: selected === item.id ? "#165ce7" : "transparent",
                    }}>
                      <td style={tdStyle}>{item.name}</td>
                      <td style={tdStyle}>{item.patientId ?? NULL_CELL}</td>
                      <td style={tdStyle}>{statusBadge(item)}</td>
                      <td style={tdStyle}>
                        {item.status === "done" && (
                          <button
                            onClick={() => setSelected(selected === item.id ? null : item.id)}
                            style={viewBtnStyle}
                          >
                            {selected === item.id ? "Hide" : "View"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedItem?.result && (
                <div style={{ marginTop: "16px" }}>
                  <h3 style={{ marginBottom: "8px" }}>
                    Extracted Data — Patient {selectedItem.patientId ?? selectedItem.name}
                  </h3>
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
                          <td style={tdStyle}><FieldValue type={type} val={selectedItem.result[key]} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

const BADGE_COLORS = {
  gray:  { background: "#e5e7eb", color: "#374151" },
  blue:  { background: "#dbeafe", color: "#1d4ed8" },
  green: { background: "#dcfce7", color: "#15803d" },
  red:   { background: "#fee2e2", color: "#b91c1c" },
};
const badge = (color) => ({
  display: "inline-block", padding: "2px 8px", borderRadius: "10px",
  fontSize: "0.82em", fontWeight: "600", whiteSpace: "nowrap",
  ...BADGE_COLORS[color],
});

export default App;
