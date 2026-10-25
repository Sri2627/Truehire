import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Layout from '../components/Layout.jsx';
import api from '../api';
import Logo from '../assets/Logoth.png';

const WORK_MODES = [
  { value: '', label: 'Any work mode' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];
const EMPLOYMENT_TYPES = [
  { value: '', label: 'Any job type' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];
const SALARY_FILTERS = [
  { value: '', label: 'Any salary' },
  { value: '3', label: '₹3 LPA and above' },
  { value: '5', label: '₹5 LPA and above' },
  { value: '8', label: '₹8 LPA and above' },
  { value: '12', label: '₹12 LPA and above' },
];

function salaryLabel(job) {
  if (job.salaryMinLpa == null && job.salaryMaxLpa == null) return 'Salary not specified';
  if (job.salaryMinLpa != null && job.salaryMaxLpa != null) return `₹${job.salaryMinLpa}–${job.salaryMaxLpa} LPA`;
  return job.salaryMinLpa != null ? `From ₹${job.salaryMinLpa} LPA` : `Up to ₹${job.salaryMaxLpa} LPA`;
}

function titleCase(value = '') {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PublicJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [location, setLocation] = useState(() => searchParams.get('location') || '');
  const [workMode, setWorkMode] = useState(() => searchParams.get('workMode') || '');
  const [employmentType, setEmploymentType] = useState(() => searchParams.get('employmentType') || '');
  const [minSalaryLpa, setMinSalaryLpa] = useState('');
  const [maxExperienceYears, setMaxExperienceYears] = useState(() => searchParams.get('minExperienceYears') || '');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resume, setResume] = useState(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      api.get('/jobs/public', {
        params: {
          search: search || undefined,
          location: location || undefined,
          workMode: workMode || undefined,
          employmentType: employmentType || undefined,
          minSalaryLpa: minSalaryLpa || undefined,
          minExperienceYears: maxExperienceYears || undefined,
          limit: 50,
        },
      })
        .then(({ data }) => {
          if (active) {
            setJobs(data.items || []);
            setTotal(data.total || 0);
          }
        })
        .catch((err) => { if (active) setError(err.response?.data?.error || 'Could not load open jobs'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, location, workMode, employmentType, minSalaryLpa, maxExperienceYears]);

  const selectedId = searchParams.get('apply');
  const selectedJob = jobs.find((job) => job._id === selectedId);
  const isJobseeker = user?.role === 'jobseeker';
  const hasFilters = !!(search || location || workMode || employmentType || minSalaryLpa || maxExperienceYears);

  function clearFilters() {
    setSearch('');
    setLocation('');
    setWorkMode('');
    setEmploymentType('');
    setMinSalaryLpa('');
    setMaxExperienceYears('');
    setSearchParams({});
  }

  function openApply(jobId) {
    if (!isJobseeker) {
      if (user) {
        navigate(`/jobseeker-signup?job=${encodeURIComponent(jobId)}`);
        return;
      }
      navigate('/login', { state: { from: { pathname: '/careers', search: `?apply=${jobId}` } } });
      return;
    }
    setNotice('');
    setResume(null);
    const nextParams = Object.fromEntries(searchParams.entries());
    nextParams.apply = jobId;
    setSearchParams(nextParams);
  }

  async function submitApplication(event) {
    event.preventDefault();
    if (!resume || !selectedJob) return;
    const form = new FormData();
    form.append('jobId', selectedJob._id);
    form.append('resume', resume);
    form.append('phone', phone);
    setSubmitting(true);
    setNotice('');
    try {
      await api.post('/applications', form);
      setNotice(`Application submitted for ${selectedJob.title}. Track it in My applications.`);
      setResume(null);
      setSearchParams({});
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not submit your application');
    } finally {
      setSubmitting(false);
    }
  }

  const content = (
    <div className="jobs-board">
      {!isJobseeker && (
        <header className="jobs-board-header">
          <Link to="/careers" aria-label="True Hire home">
            <img src={Logo} alt="True Hire" />
          </Link>
          <nav>
            {user ? (
              <Link to={user.role === 'superadmin' ? '/superadmin' : '/dashboard'}>Back to dashboard</Link>
            ) : (
              <>
                <Link to="/login">Employer sign in</Link>
                <Link className="jobs-board-signup" to="/jobseeker-signup">Create jobseeker account</Link>
              </>
            )}
          </nav>
        </header>
      )}

      <section className="jobs-hero">
        <span className="jobs-eyebrow">CAREER OPPORTUNITIES</span>
        <h1>Find your next opportunity</h1>
        <p>Explore open roles from employers and apply with your resume.</p>
        <div className="jobs-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search jobs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job title, skills, or keywords"
          />
        </div>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="jobs-notice" role="status">{notice}</p>}

      <div className="jobs-board-layout">
        <aside className="jobs-filters">
          <div className="jobs-filter-heading">
            <h2>Filters</h2>
            {hasFilters && <button type="button" onClick={clearFilters}>Clear all</button>}
          </div>

          <div className="jobs-filter-controls">
            <div className="jobs-filter-control">
              <label htmlFor="filter-location">Location</label>
              <input
                id="filter-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City or region"
              />
            </div>

            <div className="jobs-filter-control">
              <label htmlFor="filter-work-mode">Work arrangement</label>
              <select id="filter-work-mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
                {WORK_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="jobs-filter-control">
              <label htmlFor="filter-job-type">Job type</label>
              <select id="filter-job-type" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
                {EMPLOYMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="jobs-filter-control">
              <label htmlFor="filter-experience">Experience</label>
              <select id="filter-experience" value={maxExperienceYears} onChange={(event) => setMaxExperienceYears(event.target.value)}>
                <option value="">Any experience</option>
                <option value="2">Entry level (up to 2 years)</option>
                <option value="5">Mid level (up to 5 years)</option>
                <option value="10">Senior (up to 10 years)</option>
              </select>
            </div>

            <fieldset>
              <legend>Minimum pay</legend>
              <div className="jobs-salary-options">
                {SALARY_FILTERS.map((option) => (
                  <label className="jobs-radio-option" key={option.value}>
                    <input
                      type="radio"
                      name="salary-filter"
                      value={option.value}
                      checked={minSalaryLpa === option.value}
                      onChange={(event) => setMinSalaryLpa(event.target.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <span className="jobs-filter-hint">Annual salary in Indian rupees (LPA)</span>
            </fieldset>
          </div>
        </aside>

        <section className="jobs-results">
          <div className="jobs-results-heading">
            <div>
              <h2>Open jobs</h2>
              <p>{loading ? 'Finding opportunities…' : `${total} position${total === 1 ? '' : 's'} found`}</p>
            </div>
            <span className="jobs-sort-label">Newest first</span>
          </div>

          {selectedJob && isJobseeker && (
            <form className="card jobs-apply-card" onSubmit={submitApplication}>
              <h3>Apply for {selectedJob.title}</h3>
              <label htmlFor="phone">Phone (optional)</label>
              <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <label htmlFor="resume">Resume (PDF or DOCX, up to 10 MB)</label>
              <input id="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResume(event.target.files?.[0] || null)} required />
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-primary" disabled={submitting || !resume}>{submitting ? 'Submitting…' : 'Submit application'}</button>
                <button type="button" onClick={() => setSearchParams({})} disabled={submitting}>Cancel</button>
              </div>
            </form>
          )}

          {loading ? <div className="jobs-empty-state">Loading jobs…</div> : jobs.length === 0 ? (
            <div className="jobs-empty-state">
              <span className="jobs-empty-icon" aria-hidden="true">⌕</span>
              <h3>No matching jobs found</h3>
              <p>Try a different keyword or clear some filters to see more opportunities.</p>
              {hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}
            </div>
          ) : jobs.map((job) => (
            <article className="job-listing-card" key={job._id}>
              <div className="job-listing-top">
                <div className="job-company-mark" aria-hidden="true">{(job.companyId?.name || 'T').slice(0, 1).toUpperCase()}</div>
                <div className="job-listing-title">
                  <h3>{job.title}</h3>
                  <p>{job.companyId?.name || 'Employer'}</p>
                </div>
                <span className="job-posted-date">{new Date(job.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="job-listing-meta">
                <span><span aria-hidden="true">⌖</span> {job.location || 'Location not specified'}</span>
                {job.workMode && <span>{titleCase(job.workMode)}</span>}
                {job.employmentType && <span>{titleCase(job.employmentType)}</span>}
                <span className={job.salaryMinLpa != null || job.salaryMaxLpa != null ? 'job-salary' : ''}>
                  {salaryLabel(job)}
                </span>
                {job.minExperienceYears != null && <span>{job.minExperienceYears}+ years experience</span>}
              </div>
              <p className="job-listing-description">{job.description}</p>
              {job.requiredSkills?.length > 0 && (
                <div className="job-skill-tags">
                  {job.requiredSkills.slice(0, 5).map((skill) => <span key={skill.name}>{skill.name}</span>)}
                </div>
              )}
              <div className="job-listing-footer">
                <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
                <button className="jobs-apply-button" onClick={() => openApply(job._id)}>Apply now <span aria-hidden="true">→</span></button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );

  return isJobseeker ? <Layout>{content}</Layout> : <main className="main">{content}</main>;
}
