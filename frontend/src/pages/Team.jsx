import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import api from '../api';

const ROLES = ['admin', 'recruiter', 'viewer'];

export default function Team() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadTeam() {
    setLoading(true);
    api
      .get('/team')
      .then((res) => setTeam(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(loadTeam, []);

  async function changeRole(userId, role) {
    await api.patch(`/team/${userId}/role`, { role });
    loadTeam();
  }

  return (
    <Layout>
      <div className="topbar">
        <h2>Team &amp; roles</h2>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member._id}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>
                    <select value={member.role} onChange={(e) => changeRole(member._id, e.target.value)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
