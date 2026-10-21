import { useEffect, useRef, useState } from 'react';
import { startCapture } from '../lib/recorder.js';
import { wsUrl } from '../lib/api.js';

const STATUS_TEXT = {
  idle: 'Ready',
  connecting: 'Connecting…',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
};

export default function Live() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('idle');
  const [partial, setPartial] = useState('');
  const [finals, setFinals] = useState([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [providerName, setProviderName] = useState('');

  const wsRef = useRef(null);
  const stopCaptureRef = useRef(null);

  // Tear the mic down if the page unloads while recording.
  useEffect(() => () => stop(), []);

  async function start() {
    setError('');
    setPartial('');
    setStatus('connecting');
    try {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('Could not connect to the server — is it running on :8080?'));
      });

      ws.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === 'ready') setProviderName(ev.provider);
        else if (ev.type === 'partial') setPartial(ev.text);
        else if (ev.type === 'final') {
          if (ev.transcript) setFinals((prev) => [ev.transcript, ...prev]);
          setPartial('');
        } else if (ev.type === 'status') setStatus(ev.state);
        else if (ev.type === 'error') setError(ev.message);
      };
      ws.onclose = () => {
        wsRef.current = null;
        stopLocal();
        setError((prev) => prev || 'Connection closed.');
      };

      stopCaptureRef.current = await startCapture({
        onPcm16: (pcm) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        },
        onLevel: setLevel,
      });
      setRecording(true);
    } catch (err) {
      wsRef.current = null;
      setError(err.message);
      setStatus('idle');
    }
  }

  function stopLocal() {
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    setRecording(false);
    setStatus('idle');
    setLevel(0);
  }

  function stop() {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null; // user-initiated: don't surface the close as an error
      ws.close();
    }
    stopLocal();
  }

  // Bonus: read a transcription aloud with the browser's built-in TTS.
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="live">
      <div className="live-controls">
        <button
          className={`mic ${recording ? 'mic--on' : ''}`}
          onClick={recording ? stop : start}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording ? '⏹' : '🎤'}
        </button>
        <div className="live-status">
          <span className={`dot dot--${status}`} />
          {STATUS_TEXT[status] || status}
          {providerName && <span className="badge badge--dim">STT: {providerName}</span>}
        </div>
      </div>

      <div className="meter">
        <div className="meter-fill" style={{ width: `${Math.min(100, level * 400)}%` }} />
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {partial && <p className="partial">{partial} …</p>}

      {finals.length === 0 && !partial && !recording && (
        <p className="empty">
          Click the mic and speak — Hindi, English or a mix of both.
          Sentences appear here as you pause.
        </p>
      )}

      <ul className="finals">
        {finals.map((t) => (
          <li key={t.id} className="card final">
            <p className="final-text">{t.text}</p>
            <div className="final-meta">
              <span>{new Date(t.createdAt).toLocaleTimeString()}</span>
              {t.language && <span className="badge">{t.language}</span>}
              {t.durationMs != null && <span>{(t.durationMs / 1000).toFixed(1)}s</span>}
              <button className="ghost" onClick={() => speak(t.text)} title="Read aloud">🔊</button>
              <span className="spacer" />
              <span className="saved">✓ saved</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
