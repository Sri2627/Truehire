import React, { useState } from 'react';
import api from '../api';

// "View resume" button + its preview modal, shared by Candidates.jsx and
// JobMatches.jsx (both used to just open the raw file in a new tab - this
// renders it inline instead, with download/open-in-new-tab still offered
// as a fallback).
//
// PDFs are rendered directly in an <iframe> from the blob fetched off
// GET /candidates/:id/resume (already served with Content-Type:
// application/pdf) - browsers handle that natively, no conversion needed.
// DOCX can't be rendered by a browser at all, so for those we also call
// GET /candidates/:id/resume-preview, which converts the file to HTML
// server-side (via mammoth) and we render that instead.
export default function ResumePreviewButton({ candidateId, candidateName, label = 'View resume' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState(null); // 'pdf' | 'docx'
  const [blobUrl, setBlobUrl] = useState(null);
  const [downloadName, setDownloadName] = useState('resume');
  const [docxHtml, setDocxHtml] = useState('');

  function cleanup() {
    if (blobUrl) window.URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setDocxHtml('');
    setKind(null);
    setError('');
  }

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/candidates/${candidateId}/resume`, { responseType: 'blob' });
      const contentType = res.headers['content-type'] || '';
      const disposition = res.headers['content-disposition'] || '';
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      if (nameMatch) setDownloadName(nameMatch[1]);

      const url = window.URL.createObjectURL(res.data);
      setBlobUrl(url);

      if (contentType.includes('pdf')) {
        setKind('pdf');
      } else {
        // DOCX (or anything else the browser can't render inline) - fetch
        // the server-converted HTML preview.
        setKind('docx');
        const { data } = await api.get(`/candidates/${candidateId}/resume-preview`);
        setDocxHtml(data.html);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load resume preview');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    cleanup();
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
      >
        {label}
      </button>

      {open && (
        <div className="scanning-overlay" onClick={handleClose}>
          <div
            className="scanning-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 820,
              maxWidth: '94vw',
              height: '86vh',
              textAlign: 'left',
              alignItems: 'stretch',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                {candidateName ? `${candidateName}'s resume` : 'Resume preview'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {blobUrl && (
                  <>
                    <a
                      href={blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--purple)' }}
                    >
                      Open in new tab
                    </a>
                    <a
                      href={blobUrl}
                      download={downloadName}
                      style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--purple)' }}
                    >
                      Download
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', background: 'var(--panel-2)' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, flexDirection: 'column' }}>
                  <div className="spinner" />
                  <span style={{ color: 'var(--muted)', fontSize: '0.86rem' }}>Loading resume…</span>
                </div>
              ) : error ? (
                <p className="error-text" style={{ padding: 18 }}>{error}</p>
              ) : kind === 'pdf' ? (
                <iframe src={blobUrl} title="Resume preview" style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : kind === 'docx' ? (
                <div
                  style={{
                    background: '#fff',
                    maxWidth: 760,
                    margin: '20px auto',
                    padding: '40px 48px',
                    borderRadius: 6,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    fontSize: '0.92rem',
                    lineHeight: 1.55,
                  }}
                  // Sanitized server-side (see sanitizeResumeHtml in
                  // candidateRoutes.js) before it ever reaches this page.
                  dangerouslySetInnerHTML={{ __html: docxHtml }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
