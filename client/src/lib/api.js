// REST helpers + WebSocket URL for the transcription API.
async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

export const listTranscripts = (q) =>
  fetch(`/api/transcripts${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(handle);

export const createTranscript = (text) =>
  fetch('/api/transcripts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(handle);

export const updateTranscript = (id, text) =>
  fetch(`/api/transcripts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(handle);

export const deleteTranscript = (id) =>
  fetch(`/api/transcripts/${id}`, { method: 'DELETE' }).then(handle);

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
