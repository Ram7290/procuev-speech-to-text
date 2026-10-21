import { useEffect, useRef, useState } from 'react';
import { createTranscript, deleteTranscript, listTranscripts, updateTranscript } from '../lib/api.js';

// Dashboard: full CRUD over everything stored in Postgres.
export default function History() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [newText, setNewText] = useState('');
  const debounce = useRef(0);

  async function refresh(query = '') {
    setLoading(true);
    setError('');
    try {
      setRows(await listTranscripts(query));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function onSearch(value) {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => refresh(value), 300);
  }

  async function saveEdit(row) {
    try {
      await updateTranscript(row.id, draft);
      setEditingId(null);
      refresh(q);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(row) {
    if (!window.confirm('Delete this transcription?')) return;
    try {
      await deleteTranscript(row.id);
      refresh(q);
    } catch (err) {
      setError(err.message);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      await createTranscript(newText.trim());
      setNewText('');
      refresh(q);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search transcriptions…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
        <form className="add" onSubmit={add}>
          <input
            placeholder="Add a note manually…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">{q ? `No matches for “${q}”.` : 'Nothing yet — record something on the Live page.'}</p>
      ) : (
        <ul className="rows">
          {rows.map((row) => (
            <li key={row.id} className="card row">
              {editingId === row.id ? (
                <>
                  <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                  <div className="row-actions">
                    <button onClick={() => saveEdit(row)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="row-text">{row.text}</p>
                  <div className="row-meta">
                    <span title={new Date(row.createdAt).toLocaleString()}>
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                    {row.language && <span className="badge">{row.language}</span>}
                    <span className="badge badge--dim">{row.source}</span>
                    {row.durationMs != null && <span>{(row.durationMs / 1000).toFixed(1)}s</span>}
                    <span className="spacer" />
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditingId(row.id);
                        setDraft(row.text);
                      }}
                    >
                      Edit
                    </button>
                    <button className="ghost danger" onClick={() => remove(row)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
