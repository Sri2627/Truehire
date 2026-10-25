import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';

const STORAGE_KEY = 'th_jobseeker_resume_draft';
const EMPTY_RESUME = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  headline: '',
  summary: '',
  skills: '',
  experience: [{ role: '', company: '', dates: '', notes: '' }],
  education: [{ degree: '', school: '', dates: '' }],
};

const ACTION_VERBS = [
  'Built', 'Delivered', 'Improved', 'Led', 'Launched', 'Automated',
  'Designed', 'Reduced', 'Increased', 'Managed', 'Created', 'Streamlined',
];

function readSavedResume() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return EMPTY_RESUME;
  const parsed = JSON.parse(saved);
  return {
    ...EMPTY_RESUME,
    ...parsed,
    experience: Array.isArray(parsed.experience) && parsed.experience.length
      ? parsed.experience
      : EMPTY_RESUME.experience,
    education: Array.isArray(parsed.education) && parsed.education.length
      ? parsed.education
      : EMPTY_RESUME.education,
  };
}

function splitLines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function makeSummarySuggestion(resume) {
  const role = resume.headline.trim() || 'professional';
  const skills = resume.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
  const experience = resume.experience.find((item) => item.role.trim() || item.company.trim());
  const years = resume.experience
    .map((item) => item.dates.match(/\b(\d{1,2})\s*\+?\s*years?\b/i)?.[1])
    .find(Boolean);
  const background = years ? `with ${years}+ years of experience` : 'with practical experience';
  const skillText = skills.length
    ? ` Skilled in ${skills.slice(0, 5).join(', ')}${skills.length > 5 ? ', and related tools' : ''}.`
    : '';
  const recentRole = experience?.role ? ` Recent experience includes working as ${experience.role}.` : '';
  return `${role} ${background}${skillText}${recentRole} Focused on delivering reliable work, solving practical problems, and contributing to team goals.`;
}

function makeBulletSuggestion(notes) {
  const clean = notes.trim().replace(/^[\s\-*•]+/, '').replace(/[.!?]+$/, '');
  if (!clean) return '';
  if (ACTION_VERBS.some((verb) => clean.toLowerCase().startsWith(`${verb.toLowerCase()} `))) {
    return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  }
  const lower = clean.toLowerCase();
  const verb = lower.includes('customer') || lower.includes('client')
    ? 'Supported'
    : lower.includes('team') || lower.includes('manage')
      ? 'Coordinated'
      : lower.includes('report') || lower.includes('data')
        ? 'Analyzed'
        : lower.includes('test') || lower.includes('quality')
          ? 'Improved'
          : 'Delivered';
  return `${verb} ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
}

function updateListItem(setResume, listName, index, field, value) {
  setResume((current) => ({
    ...current,
    [listName]: current[listName].map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )),
  }));
}

export default function ResumeBuilder() {
  const [resume, setResume] = useState(() => {
    try {
      return readSavedResume();
    } catch {
      return EMPTY_RESUME;
    }
  });
  const [saveMessage, setSaveMessage] = useState('Saved only in this browser');
  const [storageError, setStorageError] = useState('');
  const [copied, setCopied] = useState(false);
  const [coachMessage, setCoachMessage] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
      setStorageError('');
      setSaveMessage('Draft saved in this browser');
    } catch {
      setStorageError('Your browser could not save this draft. Check available storage and try again.');
      setSaveMessage('');
    }
  }, [resume]);

  const skills = useMemo(
    () => resume.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
    [resume.skills]
  );

  function addExperience() {
    setResume((current) => ({
      ...current,
      experience: [...current.experience, { role: '', company: '', dates: '', notes: '' }],
    }));
  }

  function addEducation() {
    setResume((current) => ({
      ...current,
      education: [...current.education, { degree: '', school: '', dates: '' }],
    }));
  }

  function removeItem(listName, index) {
    setResume((current) => ({
      ...current,
      [listName]: current[listName].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function useSummarySuggestion() {
    setResume((current) => ({ ...current, summary: makeSummarySuggestion(current) }));
    setCoachMessage('Added a starting summary. Review it and edit it to reflect your real experience.');
  }

  function rewriteExperience(index) {
    const item = resume.experience[index];
    const suggestions = splitLines(item.notes);
    if (!suggestions.length) {
      setCoachMessage('Add a rough responsibility or achievement first, then choose “Improve bullet points.”');
      return;
    }
    updateListItem(setResume, 'experience', index, 'notes', suggestions.map(makeBulletSuggestion).join('\n'));
    setCoachMessage('Rephrased your notes with action-led wording. Verify every statement is accurate.');
  }

  function handlePrint() {
    window.print();
  }

  async function copyResume() {
    const text = [
      resume.fullName,
      resume.headline,
      [resume.email, resume.phone, resume.location].filter(Boolean).join(' | '),
      '',
      'PROFESSIONAL SUMMARY',
      resume.summary,
      '',
      'EXPERIENCE',
      ...resume.experience.flatMap((item) => [
        [item.role, item.company].filter(Boolean).join(' — '),
        item.dates,
        ...splitLines(item.notes).map((line) => `• ${line}`),
      ]),
      '',
      'EDUCATION',
      ...resume.education.map((item) => [item.degree, item.school, item.dates].filter(Boolean).join(' — ')),
      '',
      'SKILLS',
      skills.join(', '),
    ].filter((line) => line !== undefined).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCoachMessage('Clipboard access was blocked. Use Print / Save PDF to export your resume.');
    }
  }

  function clearDraft() {
    if (!window.confirm('Clear your resume draft saved in this browser? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setResume(EMPTY_RESUME);
    setCoachMessage('');
  }

  return (
    <Layout>
      <div className="topbar resume-builder-topbar">
        <div>
          <h2>Resume builder</h2>
          <p className="sub">Build a clear, professional resume and save it as a PDF.</p>
        </div>
        <div className="resume-builder-actions">
          <button type="button" onClick={copyResume}>{copied ? 'Copied!' : 'Copy resume'}</button>
          <button type="button" className="btn-primary resume-print-button" onClick={handlePrint}>Print / Save PDF</button>
        </div>
      </div>

      <div className="resume-privacy-note">
        <strong>Private by design</strong>
        <span>Your draft is saved in this browser only. The writing coach works offline; your resume details are not sent to an AI service.</span>
      </div>

      {storageError && <p className="error-text" role="alert">{storageError}</p>}
      {coachMessage && <p className="resume-coach-message" role="status">{coachMessage}</p>}

      <div className="resume-builder-grid">
        <div className="resume-editor">
          <section className="card resume-section">
            <div className="resume-section-heading">
              <span className="resume-section-number">01</span>
              <div><h3>Contact details</h3><p>How employers can reach you.</p></div>
            </div>
            <div className="resume-form-grid">
              <div className="resume-field resume-field-wide">
                <label htmlFor="resume-name">Full name</label>
                <input id="resume-name" value={resume.fullName} onChange={(event) => setResume({ ...resume, fullName: event.target.value })} placeholder="e.g. Asha Kumar" />
              </div>
              <div className="resume-field">
                <label htmlFor="resume-email">Email</label>
                <input id="resume-email" type="email" value={resume.email} onChange={(event) => setResume({ ...resume, email: event.target.value })} placeholder="you@example.com" />
              </div>
              <div className="resume-field">
                <label htmlFor="resume-phone">Phone</label>
                <input id="resume-phone" value={resume.phone} onChange={(event) => setResume({ ...resume, phone: event.target.value })} placeholder="+91 98765 43210" />
              </div>
              <div className="resume-field">
                <label htmlFor="resume-location">Location</label>
                <input id="resume-location" value={resume.location} onChange={(event) => setResume({ ...resume, location: event.target.value })} placeholder="City, state" />
              </div>
              <div className="resume-field">
                <label htmlFor="resume-headline">Target role / headline</label>
                <input id="resume-headline" value={resume.headline} onChange={(event) => setResume({ ...resume, headline: event.target.value })} placeholder="e.g. Frontend Developer" />
              </div>
            </div>
          </section>

          <section className="card resume-section">
            <div className="resume-section-heading">
              <span className="resume-section-number">02</span>
              <div><h3>Professional summary</h3><p>A short introduction tailored to your target role.</p></div>
            </div>
            <div className="resume-coach-card">
              <div><strong>Offline writing coach</strong><p>Creates a starter using your role, skills, and experience entries.</p></div>
              <button type="button" onClick={useSummarySuggestion}>Suggest summary</button>
            </div>
            <label htmlFor="resume-summary">Summary</label>
            <textarea id="resume-summary" rows="5" value={resume.summary} onChange={(event) => setResume({ ...resume, summary: event.target.value })} placeholder="Describe your strengths, experience, and the role you are targeting." />
            <p className="resume-field-hint">Keep it honest and specific. Add details you can support in an interview.</p>
          </section>

          <section className="card resume-section">
            <div className="resume-section-heading">
              <span className="resume-section-number">03</span>
              <div><h3>Work experience</h3><p>Focus on outcomes and measurable contributions.</p></div>
            </div>
            {resume.experience.map((item, index) => (
              <div className="resume-entry" key={`experience-${index}`}>
                <div className="resume-form-grid">
                  <div className="resume-field">
                    <label htmlFor={`experience-role-${index}`}>Job title</label>
                    <input id={`experience-role-${index}`} value={item.role} onChange={(event) => updateListItem(setResume, 'experience', index, 'role', event.target.value)} placeholder="e.g. Software Engineer" />
                  </div>
                  <div className="resume-field">
                    <label htmlFor={`experience-company-${index}`}>Company</label>
                    <input id={`experience-company-${index}`} value={item.company} onChange={(event) => updateListItem(setResume, 'experience', index, 'company', event.target.value)} placeholder="Company name" />
                  </div>
                  <div className="resume-field resume-field-wide">
                    <label htmlFor={`experience-dates-${index}`}>Dates</label>
                    <input id={`experience-dates-${index}`} value={item.dates} onChange={(event) => updateListItem(setResume, 'experience', index, 'dates', event.target.value)} placeholder="Jan 2023 – Present" />
                  </div>
                  <div className="resume-field resume-field-wide">
                    <label htmlFor={`experience-notes-${index}`}>Responsibilities and achievements</label>
                    <textarea id={`experience-notes-${index}`} rows="4" value={item.notes} onChange={(event) => updateListItem(setResume, 'experience', index, 'notes', event.target.value)} placeholder={'Write rough notes, one per line.\nExample: helped improve checkout speed by 20%'} />
                    <p className="resume-field-hint">For stronger bullets, include action + task + result. Add real numbers when you have them.</p>
                    <button type="button" className="resume-text-button" onClick={() => rewriteExperience(index)}>Improve bullet points</button>
                  </div>
                </div>
                {resume.experience.length > 1 && <button type="button" className="resume-remove-button" onClick={() => removeItem('experience', index)}>Remove experience</button>}
              </div>
            ))}
            <button type="button" className="resume-add-button" onClick={addExperience}>+ Add experience</button>
          </section>

          <section className="card resume-section">
            <div className="resume-section-heading">
              <span className="resume-section-number">04</span>
              <div><h3>Education</h3><p>Add relevant degrees, courses, or certifications.</p></div>
            </div>
            {resume.education.map((item, index) => (
              <div className="resume-entry" key={`education-${index}`}>
                <div className="resume-form-grid">
                  <div className="resume-field">
                    <label htmlFor={`education-degree-${index}`}>Degree / qualification</label>
                    <input id={`education-degree-${index}`} value={item.degree} onChange={(event) => updateListItem(setResume, 'education', index, 'degree', event.target.value)} placeholder="e.g. B.Tech, Computer Science" />
                  </div>
                  <div className="resume-field">
                    <label htmlFor={`education-school-${index}`}>School / institution</label>
                    <input id={`education-school-${index}`} value={item.school} onChange={(event) => updateListItem(setResume, 'education', index, 'school', event.target.value)} placeholder="Institution name" />
                  </div>
                  <div className="resume-field resume-field-wide">
                    <label htmlFor={`education-dates-${index}`}>Dates</label>
                    <input id={`education-dates-${index}`} value={item.dates} onChange={(event) => updateListItem(setResume, 'education', index, 'dates', event.target.value)} placeholder="2020 – 2024" />
                  </div>
                </div>
                {resume.education.length > 1 && <button type="button" className="resume-remove-button" onClick={() => removeItem('education', index)}>Remove education</button>}
              </div>
            ))}
            <button type="button" className="resume-add-button" onClick={addEducation}>+ Add education</button>
          </section>

          <section className="card resume-section">
            <div className="resume-section-heading">
              <span className="resume-section-number">05</span>
              <div><h3>Skills</h3><p>Separate each skill with a comma.</p></div>
            </div>
            <label htmlFor="resume-skills">Skills</label>
            <input id="resume-skills" value={resume.skills} onChange={(event) => setResume({ ...resume, skills: event.target.value })} placeholder="React, JavaScript, Accessibility, Testing" />
          </section>

          <div className="resume-bottom-actions">
            <span>{saveMessage}</span>
            <button type="button" className="resume-text-button resume-clear-button" onClick={clearDraft}>Clear draft</button>
          </div>
        </div>

        <aside className="resume-preview-panel">
          <div className="resume-preview-heading"><strong>Live preview</strong><span>Updates as you type</span></div>
          <article className="resume-paper">
            <header className="resume-paper-header">
              <h1>{resume.fullName || 'Your Name'}</h1>
              {resume.headline && <p className="resume-paper-headline">{resume.headline}</p>}
              <p>{[resume.email, resume.phone, resume.location].filter(Boolean).join(' · ') || 'Email · Phone · Location'}</p>
            </header>

            {resume.summary && <section><h2>Professional Summary</h2><p>{resume.summary}</p></section>}

            {resume.experience.some((item) => item.role || item.company || item.notes) && (
              <section>
                <h2>Experience</h2>
                {resume.experience.filter((item) => item.role || item.company || item.notes).map((item, index) => (
                  <div className="resume-paper-entry" key={`preview-experience-${index}`}>
                    <div className="resume-paper-entry-heading">
                      <strong>{[item.role, item.company].filter(Boolean).join(' — ') || 'Role — Company'}</strong>
                      {item.dates && <span>{item.dates}</span>}
                    </div>
                    <ul>{splitLines(item.notes).map((line, lineIndex) => <li key={`${index}-${lineIndex}`}>{line}</li>)}</ul>
                  </div>
                ))}
              </section>
            )}

            {resume.education.some((item) => item.degree || item.school) && (
              <section>
                <h2>Education</h2>
                {resume.education.filter((item) => item.degree || item.school).map((item, index) => (
                  <div className="resume-paper-entry" key={`preview-education-${index}`}>
                    <div className="resume-paper-entry-heading">
                      <strong>{[item.degree, item.school].filter(Boolean).join(' — ')}</strong>
                      {item.dates && <span>{item.dates}</span>}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {skills.length > 0 && <section><h2>Skills</h2><p>{skills.join(' · ')}</p></section>}
          </article>
        </aside>
      </div>
    </Layout>
  );
}
