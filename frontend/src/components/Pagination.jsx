import React from 'react';

// Simple prev/next + page indicator, shared by every paginated list page.
// Renders nothing when there's only one page, so it never shows up on
// small lists.
export default function Pagination({ page, totalPages, total, onChange }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
        {total} total
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          style={{ background: 'none', border: '1px solid var(--line)', color: page <= 1 ? 'var(--muted)' : 'var(--ink)', borderRadius: 6, padding: '4px 12px', cursor: page <= 1 ? 'default' : 'pointer', fontSize: '0.82rem' }}
        >
          ‹ Prev
        </button>
        <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          style={{ background: 'none', border: '1px solid var(--line)', color: page >= totalPages ? 'var(--muted)' : 'var(--ink)', borderRadius: 6, padding: '4px 12px', cursor: page >= totalPages ? 'default' : 'pointer', fontSize: '0.82rem' }}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
