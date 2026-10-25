import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api';

const EMPTY_PROFILE = {
  name: '',
  email: '',
  mobile: '',
  profile: {
    headline: '',
    location: '',
    summary: '',
    skills: [],
    experience: [],
    education: [],
    resume: null,
    linkedin: '',
    portfolio: '',
  },
};

function completionPercent(user) {
  const profile = user.profile || {};
  const checks = [
    user.name,
    user.email || user.mobile,
    profile.headline,
    profile.location,
    profile.summary,
    profile.skills?.length,
    profile.experience?.length,
    profile.education?.length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function JobseekerProfile() {
  const { updateUserProfile } = useAuth();
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeBusy, setResumeBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (!active) return;
        setForm({
          ...EMPTY_PROFILE,
          name: data.name || '',
          email: data.email || '',
          mobile: data.mobile || '',
          profile: { ...EMPTY_PROFILE.profile, ...(data.profile || {}) },
        });
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error || 'Could not load your profile');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const completion = useMemo(() => completionPercent(form), [form]);

  function updateProfileField(field, value) {
    setForm((current) => ({ ...current, profile: { ...current.profile, [field]: value } }));
  }

  function addSkill(event) {
    event.preventDefault();
    const skill = skillInput.trim();
    if (!skill || form.profile.skills.some((current) => current.toLowerCase() === skill.toLowerCase())) return;
    updateProfileField('skills', [...form.profile.skills, skill]);
    setSkillInput('');
  }

  function removeSkill(skillToRemove) {
    updateProfileField('skills', form.profile.skills.filter((skill) => skill !== skillToRemove));
  }

  function updateEntry(section, index, field, value) {
    const entries = form.profile[section].map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [field]: value } : entry
    ));
    updateProfileField(section, entries);
  }

  function addEntry(section) {
    const emptyEntry = section === 'experience'
      ? { title: '', company: '', startDate: '', endDate: '', description: '' }
      : { degree: '', institution: '', graduationYear: '' };
    updateProfileField(section, [...form.profile[section], emptyEntry]);
  }

  function removeEntry(section, index) {
    updateProfileField(section, form.profile[section].filter((_, entryIndex) => entryIndex !== index));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.put('/auth/profile', form);
      setForm((current) => ({ ...current, ...data, profile: { ...current.profile, ...(data.profile || {}) } }));
      updateUserProfile(data);
      setNotice('Your profile was saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  }

  async function uploadResume() {
    if (!resumeFile) {
      setError('Choose a PDF or DOCX resume first.');
      return;
    }
    const payload = new FormData();
    payload.append('resume', resumeFile);
    setResumeBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/auth/profile/resume', payload);
      setForm((current) => ({
        ...current,
        profile: { ...current.profile, resume: data.resume },
      }));
      setResumeFile(null);
      setNotice('Your resume was uploaded.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload your resume');
    } finally {
      setResumeBusy(false);
    }
  }

  async function downloadResume() {
    setError('');
    try {
      const { data } = await api.get('/auth/profile/resume', { responseType: 'blob' });
      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = form.profile.resume?.originalName || 'resume';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download your resume');
    }
  }

  async function removeResume() {
    setResumeBusy(true);
    setError('');
    setNotice('');
    try {
      await api.delete('/auth/profile/resume');
      setForm((current) => ({
        ...current,
        profile: { ...current.profile, resume: null },
      }));
      setNotice('Your resume was removed.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove your resume');
    } finally {
      setResumeBusy(false);
    }
  }

  if (loading) {
    return <Layout><p>Loading your profile…</p></Layout>;
  }

  return (
    <Layout>
      <div className="profile-page-header">
        <div>
          <p className="profile-eyebrow">YOUR CAREER PROFILE</p>
          <h2>Profile</h2>
          <p className="profile-header-sub">Keep your details up to date so employers can learn more about you.</p>
        </div>
        <div className="profile-completion">
          <div className="profile-avatar" aria-hidden="true">{form.name.trim().charAt(0).toUpperCase() || 'J'}</div>
          <div>
            <strong>{completion}% complete</strong>
            <div className="profile-progress"><span style={{ width: `${completion}%` }} /></div>
            <span>Complete more sections to strengthen your profile.</span>
          </div>
        </div>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="profile-success" role="status">{notice}</p>}

      <form onSubmit={saveProfile}>
        <div className="profile-page-grid">
          <aside className="profile-quick-links">
            <strong>Quick links</strong>
            <a href="#profile-personal">Personal details</a>
            <a href="#profile-summary">Profile summary</a>
            <a href="#profile-skills">Key skills</a>
            <a href="#profile-experience">Employment</a>
            <a href="#profile-education">Education</a>
            <a href="#profile-links">Career links</a>
            <a href="#profile-resume">Resume</a>
            <div className="profile-quick-resume">
              <span>Want a formatted resume?</span>
              <Link to="/resume-builder">Open resume builder →</Link>
            </div>
          </aside>

          <div className="profile-sections">
            <section className="card profile-section" id="profile-personal">
              <div className="profile-section-title"><span>01</span><div><h3>Personal details</h3><p>Your basic contact and role information.</p></div></div>
              <div className="profile-fields">
                <div>
                  <label htmlFor="profile-name">Full name</label>
                  <input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                </div>
                <div>
                  <label htmlFor="profile-headline">Professional headline</label>
                  <input id="profile-headline" value={form.profile.headline} onChange={(event) => updateProfileField('headline', event.target.value)} placeholder="e.g. Product designer | UX research" />
                </div>
                <div>
                  <label htmlFor="profile-email">Email</label>
                  <input id="profile-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="profile-mobile">Mobile</label>
                  <input id="profile-mobile" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} />
                </div>
                <div className="profile-field-wide">
                  <label htmlFor="profile-location">Location</label>
                  <input id="profile-location" value={form.profile.location} onChange={(event) => updateProfileField('location', event.target.value)} placeholder="City, state, country" />
                </div>
              </div>
            </section>

            <section className="card profile-section" id="profile-summary">
              <div className="profile-section-title"><span>02</span><div><h3>Profile summary</h3><p>Briefly describe your experience, strengths, and career goals.</p></div></div>
              <label htmlFor="profile-summary-input">About you</label>
              <textarea id="profile-summary-input" rows="5" maxLength="2000" value={form.profile.summary} onChange={(event) => updateProfileField('summary', event.target.value)} placeholder="Write a concise introduction for employers." />
              <div className="profile-character-count">{form.profile.summary.length}/2000</div>
            </section>

            <section className="card profile-section" id="profile-skills">
              <div className="profile-section-title"><span>03</span><div><h3>Key skills</h3><p>Add skills you use and can discuss confidently.</p></div></div>
              <div className="profile-skill-list">
                {form.profile.skills.map((skill) => (
                  <span className="profile-skill-chip" key={skill}>
                    {skill}
                    <button type="button" aria-label={`Remove ${skill}`} onClick={() => removeSkill(skill)}>×</button>
                  </span>
                ))}
                {form.profile.skills.length === 0 && <span className="profile-empty-hint">No skills added yet.</span>}
              </div>
              <div className="profile-add-skill">
                <input aria-label="Add a skill" value={skillInput} onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addSkill(event); }} placeholder="Type a skill and press Add" />
                <button type="button" onClick={addSkill}>Add skill</button>
              </div>
            </section>

            <section className="card profile-section" id="profile-experience">
              <div className="profile-section-title"><span>04</span><div><h3>Employment</h3><p>Share relevant roles and accomplishments.</p></div></div>
              {form.profile.experience.map((item, index) => (
                <div className="profile-entry" key={`profile-experience-${index}`}>
                  <div className="profile-fields">
                    <div><label htmlFor={`profile-job-title-${index}`}>Job title</label><input id={`profile-job-title-${index}`} value={item.title} onChange={(event) => updateEntry('experience', index, 'title', event.target.value)} /></div>
                    <div><label htmlFor={`profile-job-company-${index}`}>Company</label><input id={`profile-job-company-${index}`} value={item.company} onChange={(event) => updateEntry('experience', index, 'company', event.target.value)} /></div>
                    <div><label htmlFor={`profile-job-start-${index}`}>Start date</label><input id={`profile-job-start-${index}`} value={item.startDate} onChange={(event) => updateEntry('experience', index, 'startDate', event.target.value)} placeholder="MM/YYYY" /></div>
                    <div><label htmlFor={`profile-job-end-${index}`}>End date</label><input id={`profile-job-end-${index}`} value={item.endDate} onChange={(event) => updateEntry('experience', index, 'endDate', event.target.value)} placeholder="Present or MM/YYYY" /></div>
                    <div className="profile-field-wide"><label htmlFor={`profile-job-description-${index}`}>Responsibilities and achievements</label><textarea id={`profile-job-description-${index}`} rows="3" maxLength="1500" value={item.description} onChange={(event) => updateEntry('experience', index, 'description', event.target.value)} /></div>
                  </div>
                  <button type="button" className="profile-remove-entry" onClick={() => removeEntry('experience', index)}>Remove experience</button>
                </div>
              ))}
              <button type="button" className="profile-add-entry" onClick={() => addEntry('experience')}>+ Add employment</button>
            </section>

            <section className="card profile-section" id="profile-education">
              <div className="profile-section-title"><span>05</span><div><h3>Education</h3><p>Add your education and relevant qualifications.</p></div></div>
              {form.profile.education.map((item, index) => (
                <div className="profile-entry" key={`profile-education-${index}`}>
                  <div className="profile-fields">
                    <div><label htmlFor={`profile-degree-${index}`}>Degree / qualification</label><input id={`profile-degree-${index}`} value={item.degree} onChange={(event) => updateEntry('education', index, 'degree', event.target.value)} /></div>
                    <div><label htmlFor={`profile-school-${index}`}>Institution</label><input id={`profile-school-${index}`} value={item.institution} onChange={(event) => updateEntry('education', index, 'institution', event.target.value)} /></div>
                    <div><label htmlFor={`profile-grad-year-${index}`}>Graduation year</label><input id={`profile-grad-year-${index}`} value={item.graduationYear} onChange={(event) => updateEntry('education', index, 'graduationYear', event.target.value)} placeholder="e.g. 2024" /></div>
                  </div>
                  <button type="button" className="profile-remove-entry" onClick={() => removeEntry('education', index)}>Remove education</button>
                </div>
              ))}
              <button type="button" className="profile-add-entry" onClick={() => addEntry('education')}>+ Add education</button>
            </section>

            <section className="card profile-section" id="profile-links">
              <div className="profile-section-title"><span>06</span><div><h3>Career links</h3><p>Optional links to your professional work.</p></div></div>
              <div className="profile-fields">
                <div><label htmlFor="profile-linkedin">LinkedIn URL</label><input id="profile-linkedin" type="url" value={form.profile.linkedin} onChange={(event) => updateProfileField('linkedin', event.target.value)} placeholder="https://linkedin.com/in/your-profile" /></div>
                <div><label htmlFor="profile-portfolio">Portfolio / website</label><input id="profile-portfolio" type="url" value={form.profile.portfolio} onChange={(event) => updateProfileField('portfolio', event.target.value)} placeholder="https://example.com" /></div>
              </div>
            </section>

            <section className="card profile-section" id="profile-resume">
              <div className="profile-section-title"><span>07</span><div><h3>Resume</h3><p>Upload a PDF or DOCX resume (up to 10 MB). It stays private to your account.</p></div></div>
              {form.profile.resume?.originalName ? (
                <div className="profile-resume-current">
                  <div><strong>{form.profile.resume.originalName}</strong><span>Uploaded {new Date(form.profile.resume.uploadedAt).toLocaleDateString()}</span></div>
                  <div className="profile-resume-actions">
                    <button type="button" className="profile-add-entry" onClick={downloadResume}>Download</button>
                    <button type="button" className="profile-remove-entry" disabled={resumeBusy} onClick={removeResume}>Remove</button>
                  </div>
                </div>
              ) : <p className="profile-empty-hint">No resume uploaded yet.</p>}
              <div className="profile-resume-upload">
                <label htmlFor="profile-resume-file">Choose resume file</label>
                <input id="profile-resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} />
                <button type="button" className="profile-add-entry" disabled={!resumeFile || resumeBusy} onClick={uploadResume}>{resumeBusy ? 'Please wait…' : form.profile.resume ? 'Replace resume' : 'Upload resume'}</button>
              </div>
            </section>

            <div className="profile-save-bar">
              <span>Profile details are not added to applications automatically.</span>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
          </div>
        </div>
      </form>
    </Layout>
  );
}
