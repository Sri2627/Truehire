import React from 'react';

// Turns a job's stored requiredSkills (as returned by the API) into the
// row shape RequiredSkillsEditor edits. Used when opening the edit form
// pre-filled with an existing job's skills.
export function skillRowsFromJob(job) {
  return (job?.requiredSkills || []).map((s) => ({ name: s.name, weight: s.weight, minYears: s.minYears }));
}

// Turns a job's stored interviewPanel (array of emails) into the
// comma-separated string the panel input field edits.
export function panelStringFromJob(job) {
  return (job?.interviewPanel || []).join(', ');
}

// Required-skill rows, shared by the "create job" and "edit job" forms.
// This is the only place requiredSkills/minYears/weight get set - the
// matches ranking endpoint (GET /jobs/:id/matches) refuses to rank
// anything until a job has at least one of these, so without this editor
// there'd be no way to ever populate data for the matches table short of
// hitting the API directly.
export function RequiredSkillsEditor({ skills, onChange }) {
  function updateRow(i, field, value) {
    const next = skills.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }

  function addRow() {
    onChange([...skills, { name: '', weight: 10, minYears: 0 }]);
  }

  function removeRow(i) {
    onChange(skills.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ margin: '14px 0 6px' }}>
        Required skills (optional — needed to rank candidates against this job later)
      </label>
      {skills.length > 0 && (
        <div style={{ display: 'flex', gap: 8, fontSize: '0.74rem', color: 'var(--muted)', padding: '0 2px 4px' }}>
          <span style={{ flex: 2 }}>Skill</span>
          <span style={{ width: 90 }}>Weight</span>
          <span style={{ width: 90 }}>Min years</span>
          <span style={{ width: 28 }} />
        </div>
      )}
      {skills.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            style={{ flex: 2 }}
            value={s.name}
            onChange={(e) => updateRow(i, 'name', e.target.value)}
            placeholder="e.g. React"
            required
          />
          <input
            style={{ width: 90 }}
            type="number"
            min="0"
            value={s.weight}
            onChange={(e) => updateRow(i, 'weight', e.target.value)}
          />
          <input
            style={{ width: 90 }}
            type="number"
            min="0"
            value={s.minYears}
            onChange={(e) => updateRow(i, 'minYears', e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove skill"
            style={{ width: 28, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.8rem' }}
      >
        + Add skill
      </button>
    </div>
  );
}

// Title / description / min-experience / required-skills fields, shared
// by NewJobModal (Jobs.jsx) and the edit form on the job details page.
// Deliberately just the <label>/<input> fields with no <form> or footer
// buttons around them, since the two callers wrap them differently
// (a popup vs an inline card).
export default function JobFormFields({ form, setForm, skills, setSkills, autoFocusTitle }) {
  return (
    <>
      <label>Job title</label>
      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
        autoFocus={autoFocusTitle}
      />

      <label style={{ marginTop: 10 }}>Job description</label>
      <textarea
        rows={8}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        required
        placeholder="Responsibilities, requirements, etc."
      />

      <label style={{ marginTop: 10 }}>Minimum overall experience (years, optional)</label>
      <input
        type="number"
        min="0"
        value={form.minExperienceYears}
        onChange={(e) => setForm({ ...form, minExperienceYears: e.target.value })}
        placeholder="e.g. 3"
      />

      <RequiredSkillsEditor skills={skills} onChange={setSkills} />

      <label style={{ marginTop: 14 }}>Interview panel emails (optional — CC'd on every interview invitation sent for matches against this job)</label>
      <input
        value={form.interviewPanel}
        onChange={(e) => setForm({ ...form, interviewPanel: e.target.value })}
        placeholder="panel1@company.com, panel2@company.com"
      />
    </>
  );
}
