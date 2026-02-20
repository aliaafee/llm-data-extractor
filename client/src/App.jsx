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

const NULL_CELL = <span className="text-gray-300 italic">—</span>;

function ScalarValue({ val }) {
  if (val === null || val === undefined) return NULL_CELL;
  const s = String(val);
  const color = s === "Yes" ? "text-red-600" : s === "No" ? "text-green-600" : "text-gray-800";
  return <span className={color}>{s}</span>;
}

function ListValue({ val }) {
  if (!Array.isArray(val) || val.length === 0) return NULL_CELL;
  return (
    <ul className="list-disc list-inside space-y-0.5 text-gray-800">
      {val.map((item, i) => <li key={i}>{String(item)}</li>)}
    </ul>
  );
}

function MedListValue({ val }) {
  if (!Array.isArray(val) || val.length === 0) return NULL_CELL;
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {["Name", "Dose", "Frequency", "Duration"].map((h) => (
            <th key={h} className="px-2 py-1 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-600">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {val.map((med, i) => (
          <tr key={i} className="even:bg-gray-50">
            <td className="px-2 py-1 border border-gray-200 align-top">{med.name ?? NULL_CELL}</td>
            <td className="px-2 py-1 border border-gray-200 align-top">{med.dose ?? NULL_CELL}</td>
            <td className="px-2 py-1 border border-gray-200 align-top">{med.frequency ?? NULL_CELL}</td>
            <td className="px-2 py-1 border border-gray-200 align-top">{med.duration ?? NULL_CELL}</td>
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

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!list)  return <p className="text-gray-500 text-sm">Loading…</p>;

  if (selected) {
    return (
      <>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 cursor-pointer">← Back</button>
          <h3 className="text-lg font-semibold text-gray-800 m-0">Patient {selected}</h3>
        </div>
        {detailLoading && <p className="text-gray-500 text-sm">Loading…</p>}
        {detail && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700 w-56">Field</th>
                <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Value</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(({ key, label, type }) => (
                <tr key={key} className="even:bg-gray-50">
                  <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700 whitespace-nowrap">{label}</td>
                  <td className="px-3 py-2 border border-gray-200 align-top"><FieldValue type={type} val={detail[key]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  if (list.length === 0)
    return <p className="text-gray-500 italic text-sm">No processed results yet.</p>;

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-semibold text-gray-800 m-0">Processed Patients</h3>
        <button onClick={fetchList} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer">⟳ Refresh</button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Patient ID</th>
            <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Processed At</th>
            <th className="px-3 py-2 bg-gray-50 border border-gray-200 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ patient_id, updated_at }) => (
            <tr key={patient_id} className="even:bg-gray-50 hover:bg-blue-50">
              <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{patient_id}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{new Date(updated_at).toLocaleString()}</td>
              <td className="px-3 py-2 border border-gray-200 text-center">
                <button onClick={() => handleSelect(patient_id)} className="px-3 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 cursor-pointer">View</button>
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
    const base = "inline-block px-2 py-0.5 rounded-full text-xs font-semibold";
    if (item.status === "pending")    return <span className={`${base} bg-gray-100 text-gray-600`}>Pending</span>;
    if (item.status === "processing") return <span className={`${base} bg-blue-100 text-blue-700`}>Chunk {item.progress?.chunk ?? "…"}/{item.progress?.total ?? "…"}</span>;
    if (item.status === "done")       return <span className={`${base} bg-green-100 text-green-700`}>Done</span>;
    if (item.status === "error")      return <span className={`${base} bg-red-100 text-red-700`} title={item.errorMsg}>Error</span>;
  };

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 font-sans">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Clinical Data Extractor</h2>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {[["extractor", "Extractor"], ["browse", "Browse Results"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
              tab === id
                ? "border-blue-600 text-blue-600 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >{label}</button>
        ))}
      </div>

      {tab === "extractor" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="file" accept=".txt,.json" multiple onChange={handleFilesChange}
              className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-300 file:rounded file:text-sm file:bg-white file:cursor-pointer hover:file:bg-gray-50" />
            <button
              onClick={handleUpload}
              disabled={loading || queue.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? `Processing… (${doneCount + errorCount}/${queue.length})` : `Upload & Analyze${queue.length > 1 ? ` (${queue.length} files)` : ""}`}
            </button>
          </div>

          {queue.length > 0 && (
            <>
              <hr className="my-5 border-gray-200" />
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">File</th>
                    <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Patient ID</th>
                    <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Status</th>
                    <th className="px-3 py-2 bg-gray-50 border border-gray-200 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id} className={`even:bg-gray-50 ${
                      selected === item.id ? "bg-blue-50" : ""
                    }`}>
                      <td className="px-3 py-2 border border-gray-200 text-gray-800">{item.name}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-700">{item.patientId ?? NULL_CELL}</td>
                      <td className="px-3 py-2 border border-gray-200">{statusBadge(item)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-center">
                        {item.status === "done" && (
                          <button
                            onClick={() => setSelected(selected === item.id ? null : item.id)}
                            className="px-3 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 cursor-pointer"
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
                <div className="mt-5">
                  <h3 className="text-base font-semibold text-gray-800 mb-3">
                    Extracted Data — Patient {selectedItem.patientId ?? selectedItem.name}
                  </h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700 w-56">Field</th>
                        <th className="px-3 py-2 text-left bg-gray-50 border border-gray-200 font-semibold text-gray-700">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map(({ key, label, type }) => (
                        <tr key={key} className="even:bg-gray-50">
                          <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700 whitespace-nowrap">{label}</td>
                          <td className="px-3 py-2 border border-gray-200 align-top"><FieldValue type={type} val={selectedItem.result[key]} /></td>
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

export default App;
