import { useState } from "react";
import axios from "axios";

// Field definitions with render type:
//   "scalar"  – string / number / Yes/No enum
//   "list"    – array of strings
//   "medlist" – array of {name, dose, frequency, duration}
const FIELDS = [
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
        <tr style={{ background: "#f7f7f7" }}>
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

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Please select a file");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const res = await axios.post("/upload", formData);
      const data = res.data.result;
      console.log("API response:", data);
      if (data && typeof data === "object") {
        setResult(data);
        setRaw("");
      } else {
        setResult(null);
        setRaw(String(data));
      }
    } catch (err) {
      alert("Upload failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial", maxWidth: "900px", margin: "0" }}>
      <h2>Clinical Data Extractor</h2>

      <input
        type="file"
        accept=".txt,.json"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Processing..." : "Upload & Analyze"}
      </button>

      {result && (
        <>
          <hr />
          <h3>Extracted Data</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
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
          <pre style={{ whiteSpace: "pre-wrap", background: "#f8f8f8", padding: "12px" }}>{raw}</pre>
        </>
      )}
    </div>
  );
}

const thStyle      = { padding: "10px 12px", textAlign: "left", border: "1px solid #ccc" };
const tdStyle      = { padding: "8px 12px", verticalAlign: "top", border: "1px solid #ccc" };
const innerThStyle = { padding: "4px 8px", textAlign: "left", border: "1px solid #ddd", background: "#f7f7f7" };
const innerTdStyle = { padding: "4px 8px", verticalAlign: "top", border: "1px solid #ddd" };

export default App;
