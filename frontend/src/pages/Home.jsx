import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from '../assets/Logoth.png';

const QUICK_SEARCHES = [
  { label: 'Remote roles', workMode: 'remote' },
  { label: 'Technology', search: 'software' },
  { label: 'Internships', employmentType: 'internship' },
  { label: 'Full-time jobs', employmentType: 'full-time' },
];

function dashboardPath(role) {
  if (role === 'jobseeker') return '/jobseeker-dashboard';
  if (role === 'superadmin') return '/superadmin';
  return '/dashboard';
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');

  function browseJobs(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (location.trim()) params.set('location', location.trim());
    if (experience) params.set('minExperienceYears', experience);
    const query = params.toString();
    navigate(`/careers${query ? `?${query}` : ''}`);
  }

  function browseQuickSearch(item) {
    const params = new URLSearchParams();
    if (item.search) params.set('search', item.search);
    if (item.workMode) params.set('workMode', item.workMode);
    if (item.employmentType) params.set('employmentType', item.employmentType);
    navigate(`/careers?${params.toString()}`);
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <Link to="/" className="home-brand" aria-label="True Hire home">
          <img src={Logo} alt="True Hire" />
        </Link>
        <nav className="home-nav" aria-label="Main navigation">
          <Link to="/careers">Browse jobs</Link>
          <a href="#jobseekers">For jobseekers</a>
          <a href="#employers">For employers</a>
        </nav>
        <div className="home-header-actions">
          {user ? (
            <Link className="home-dashboard-link" to={dashboardPath(user.role)}>Go to dashboard</Link>
          ) : (
            <>
              <Link className="home-login-link" to="/login">Sign in</Link>
              <Link className="home-register-link" to="/jobseeker-signup">Create account</Link>
            </>
          )}
        </div>
      </header>

      <section className="home-hero">
        <span className="home-eyebrow">A clearer path to your next move</span>
        <h1>Find work that moves you forward.</h1>
        <p>Explore open roles, make your profile stand out, and keep track of every application in one place.</p>

        <form className="home-job-search" onSubmit={browseJobs}>
          <label className="home-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search job title, skills, or keywords"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Job title, skills, or keywords"
            />
          </label>
          <label className="home-search-field">
            <span aria-hidden="true">⌖</span>
            <input
              aria-label="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="City or region"
            />
          </label>
          <label className="home-search-experience">
            <span className="home-visually-hidden">Experience</span>
            <select value={experience} onChange={(event) => setExperience(event.target.value)}>
              <option value="">Any experience</option>
              <option value="2">Entry level (up to 2 years)</option>
              <option value="5">Mid level (up to 5 years)</option>
              <option value="10">Senior (up to 10 years)</option>
            </select>
          </label>
          <button type="submit">Search jobs <span aria-hidden="true">→</span></button>
        </form>

        <div className="home-quick-searches" aria-label="Popular job searches">
          <span>Popular:</span>
          {QUICK_SEARCHES.map((item) => (
            <button type="button" key={item.label} onClick={() => browseQuickSearch(item)}>{item.label}</button>
          ))}
        </div>
      </section>

      <section className="home-pathways" aria-label="Choose your career path">
        <article className="home-pathway home-pathway-jobseeker" id="jobseekers">
          <span className="home-pathway-icon" aria-hidden="true">↗</span>
          <div>
            <p className="home-eyebrow">For jobseekers</p>
            <h2>Your next opportunity starts here.</h2>
            <p>Browse open jobs, build a resume, and manage your applications from your personal dashboard.</p>
          </div>
          <div className="home-pathway-actions">
            <Link className="home-primary-button" to={user?.role === 'jobseeker' ? '/jobseeker-dashboard' : '/jobseeker-signup'}>
              {user?.role === 'jobseeker' ? 'Open my dashboard' : 'Create a jobseeker account'}
            </Link>
            <Link className="home-text-link" to="/careers">Explore open jobs <span aria-hidden="true">→</span></Link>
          </div>
        </article>

        <article className="home-pathway home-pathway-employer" id="employers">
          <span className="home-pathway-icon" aria-hidden="true">✓</span>
          <div>
            <p className="home-eyebrow">For employers</p>
            <h2>Make confident hiring decisions.</h2>
            <p>Organize your roles and candidates with resume screening, job matching, and team tools.</p>
          </div>
          <div className="home-pathway-actions">
            <Link className="home-primary-button" to="/login">Employer sign in</Link>
            <Link className="home-text-link" to="/pricing">Explore employer plans <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      </section>

      <section className="home-how-it-works">
        <div className="home-section-heading">
          <p className="home-eyebrow">Built for both sides of hiring</p>
          <h2>A simpler way to move forward</h2>
        </div>
        <div className="home-feature-grid">
          <article>
            <span aria-hidden="true">01</span>
            <h3>Find relevant roles</h3>
            <p>Search by skills, location, and experience, then narrow the list with practical filters.</p>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h3>Show your strengths</h3>
            <p>Build your resume and keep your profile ready for the opportunities you want.</p>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h3>Keep applications organized</h3>
            <p>Apply to open jobs and check your application progress from one dashboard.</p>
          </article>
        </div>
      </section>

      <footer className="home-footer">
        <Link to="/" aria-label="True Hire home"><img src={Logo} alt="True Hire" /></Link>
        <span>Verify. Validate. Trust.</span>
        <div>
          <Link to="/careers">Browse jobs</Link>
          <Link to="/login">Employer sign in</Link>
          <Link to="/pricing">Employer plans</Link>
        </div>
      </footer>
    </main>
  );
}
