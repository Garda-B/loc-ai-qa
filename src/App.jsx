import { useState } from "react";
import { xliffToSegments } from "./xliff";

export default function App() {
  const [segments, setSegments] = useState([]);
  const [results, setResults] = useState([]);
  const [dominant, setDominant] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setSegments(xliffToSegments(reader.result));
        setResults([]);        // clear any previous QA run
        setDominant("");
        setError("");
      } catch (err) {
        setError(err.message);
        setSegments([]);
      }
    };
    reader.readAsText(file);
  }

  async function runQA() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "QA request failed");
      setResults(data.results);
      setDominant(data.dominantRegister);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Look up a segment's QA result by id (so we can show it next to the row).
  const resultFor = (id) => results.find((r) => r.id === id);

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Localization AI QA</h1>
      <p>Upload an XLIFF file, then run an AI register-consistency check.</p>

      <input type="file" accept=".xlf,.xliff,.xml" onChange={handleFile} />

      {segments.length > 0 && (
        <button onClick={runQA} disabled={loading} style={{ marginLeft: "1rem" }}>
          {loading ? "Analyzing…" : "Run QA"}
        </button>
      )}

      {dominant && (
        <p style={{ marginTop: "1rem" }}>
          Dominant register: <strong>{dominant}</strong> ·{" "}
          {results.filter((r) => r.isDeviation).length} deviation(s) flagged
        </p>
      )}

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {segments.length > 0 && (
        <table border="1" cellPadding="6" style={{ marginTop: "1rem", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Source (EN)</th>
              <th>Target</th>
              <th>Register</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg) => {
              const r = resultFor(seg.id);
              return (
                <tr key={seg.id} style={{ background: r?.isDeviation ? "#ffe0e0" : "transparent" }}>
                  <td>{seg.id}</td>
                  <td>{seg.source}</td>
                  <td>{seg.target}</td>
                  <td>{r ? r.register : "—"}</td>
                  <td style={{ fontSize: "0.85em", color: "#555" }}>{r ? r.note : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}