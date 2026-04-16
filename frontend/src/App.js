import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = 'http://localhost:3001';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-UG', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function minDateTime() {
  const d = new Date(Date.now() + 60000); // at least 1 min from now
  return d.toISOString().slice(0, 16);
}

export default function App() {
  const [waStatus, setWaStatus] = useState({ ready: false, qr: null });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState('now'); // 'now' | 'schedule'
  const [scheduleTime, setScheduleTime] = useState('');
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState(null);
  const [done, setDone] = useState(null); // null | 'posted' | 'scheduled'
  const [jobs, setJobs] = useState([]);
  const fileRef = useRef();

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/wa-status`);
      setWaStatus(await res.json());
    } catch (_) {}
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/scheduled`);
      setJobs(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchWaStatus();
    fetchJobs();
    const t1 = setInterval(fetchWaStatus, 3000);
    const t2 = setInterval(fetchJobs, 5000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchWaStatus, fetchJobs]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) setPreview({ type: 'image', url: URL.createObjectURL(f) });
    else if (f.type.startsWith('video/')) setPreview({ type: 'video', url: URL.createObjectURL(f) });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange({ target: { files: [f] } });
  };

  const handleSubmit = async () => {
    if (!waStatus.ready) { showToast('Connect WhatsApp first!', 'error'); return; }
    if (!file && !caption.trim()) { showToast('Add a file or caption.', 'error'); return; }
    if (mode === 'schedule' && !scheduleTime) { showToast('Pick a date and time.', 'error'); return; }

    setPosting(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('caption', caption);

      const endpoint = mode === 'now' ? '/api/post-status' : '/api/schedule';
      if (mode === 'schedule') fd.append('scheduledTime', new Date(scheduleTime).toISOString());

      const res = await fetch(`${API}${endpoint}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDone(mode === 'now' ? 'posted' : 'scheduled');
      fetchJobs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  const cancelJob = async (id) => {
    try {
      await fetch(`${API}/api/scheduled/${id}`, { method: 'DELETE' });
      showToast('Scheduled post cancelled.');
      fetchJobs();
    } catch (_) {
      showToast('Failed to cancel.', 'error');
    }
  };

  const reset = () => {
    setFile(null); setPreview(null);
    setCaption(''); setScheduleTime('');
    setMode('now'); setDone(null);
  };

  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const pastJobs = jobs.filter(j => j.status !== 'pending');

  return (
    <div className="app">
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <header className="header">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">WA Status Studio</span>
        </div>
        <div className={`wa-badge ${waStatus.ready ? 'connected' : 'disconnected'}`}>
          <span className="wa-dot" />
          {waStatus.ready ? 'WhatsApp Connected' : 'Not Connected'}
        </div>
      </header>

      <main className="main">

        {/* QR Panel */}
        {!waStatus.ready && (
          <div className="qr-panel">
            <h2 className="qr-title">Connect WhatsApp Business</h2>
            <p className="qr-sub">Open WhatsApp Business → Linked Devices → Link a Device</p>
            {waStatus.qr
              ? <img src={waStatus.qr} alt="QR Code" className="qr-img" />
              : <div className="qr-loading"><div className="spinner" /><span>Generating QR...</span></div>}
          </div>
        )}

        {/* Compose card */}
        {!done ? (
          <div className="card">
            <h2 className="card-title">Compose Status</h2>

            {/* File drop */}
            <div
              className={`dropzone ${file ? 'has-file' : ''}`}
              onClick={() => fileRef.current.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleFileChange} />
              {preview ? (
                preview.type === 'image'
                  ? <img src={preview.url} alt="preview" className="preview-img" />
                  : <video src={preview.url} className="preview-img" controls />
              ) : (
                <div className="dropzone-placeholder">
                  <span className="upload-icon">⊕</span>
                  <p>Drop image or video here</p>
                  <span className="upload-sub">or click to browse · optional</span>
                </div>
              )}
            </div>

            {file && (
              <button className="remove-btn" onClick={() => { setFile(null); setPreview(null); }}>
                ✕ Remove file
              </button>
            )}

            {/* Caption */}
            <label className="field-label">
              Caption <span className="char-count">{caption.length}/700</span>
            </label>
            <textarea
              className="caption-input"
              placeholder="Write your status caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={700}
            />

            {/* Mode toggle */}
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === 'now' ? 'active' : ''}`}
                onClick={() => setMode('now')}
              >
                ⚡ Post Now
              </button>
              <button
                className={`mode-btn ${mode === 'schedule' ? 'active' : ''}`}
                onClick={() => setMode('schedule')}
              >
                🕐 Schedule
              </button>
            </div>

            {/* Date/time picker */}
            {mode === 'schedule' && (
              <div className="schedule-picker">
                <label className="field-label">Pick date & time</label>
                <input
                  type="datetime-local"
                  className="datetime-input"
                  value={scheduleTime}
                  min={minDateTime()}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            )}

            <button className="btn-primary" onClick={handleSubmit} disabled={posting || !waStatus.ready}>
              {posting
                ? <><div className="btn-spinner" /> {mode === 'now' ? 'Posting...' : 'Scheduling...'}</>
                : mode === 'now' ? 'Post to WhatsApp →' : 'Schedule Post →'}
            </button>

            {!waStatus.ready && <p className="warn-text">⚠️ Scan the QR code above to connect first.</p>}
          </div>
        ) : (
          <div className="card success-card">
            <div className="success-icon">{done === 'posted' ? '✦' : '🕐'}</div>
            <h2 className="card-title">{done === 'posted' ? 'Status Posted!' : 'Post Scheduled!'}</h2>
            <p className="success-sub">
              {done === 'posted'
                ? 'Your WhatsApp Business status is live.'
                : `Your status will be posted at ${scheduleTime ? formatDateTime(new Date(scheduleTime).toISOString()) : ''}.`}
            </p>
            <button className="btn-primary" onClick={reset}>Compose Another →</button>
          </div>
        )}

        {/* Scheduled Posts List */}
        {pendingJobs.length > 0 && (
          <div className="jobs-card">
            <h3 className="jobs-title">⏳ Scheduled Posts ({pendingJobs.length})</h3>
            <div className="jobs-list">
              {pendingJobs.map(job => (
                <div key={job.id} className="job-item">
                  <div className="job-info">
                    <span className="job-time">{formatDateTime(job.scheduledTime)}</span>
                    <span className="job-caption">{job.caption || (job.hasFile ? '📎 Media only' : '—')}</span>
                  </div>
                  <button className="cancel-btn" onClick={() => cancelJob(job.id)}>Cancel</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past/completed jobs */}
        {pastJobs.length > 0 && (
          <div className="jobs-card faded">
            <h3 className="jobs-title">📋 History</h3>
            <div className="jobs-list">
              {pastJobs.map(job => (
                <div key={job.id} className="job-item">
                  <div className="job-info">
                    <span className="job-time">{formatDateTime(job.scheduledTime)}</span>
                    <span className="job-caption">{job.caption || (job.hasFile ? '📎 Media only' : '—')}</span>
                  </div>
                  <span className={`job-status status-${job.status}`}>{job.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}