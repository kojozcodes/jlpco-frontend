import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import API_BASE_URL from '../config';
import './History.css';

/**
 * History
 *
 * Past agreements, searchable by hirer name or registration. Each one can be
 * re-downloaded exactly as it was produced, used as the starting point for a
 * repeat hire, or deleted for a data protection request.
 */
const History = ({ authToken, onSessionExpired, onReuse }) => {
  const [agreements, setAgreements] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Lets a slow response from an earlier keystroke be discarded rather than
  // overwriting results from a later one.
  const requestRef = useRef(0);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${authToken}`,
  }), [authToken]);

  const load = useCallback(async (term) => {
    const request = ++requestRef.current;
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements?search=${encodeURIComponent(term)}`,
        { headers: authHeaders() }
      );

      if (response.status === 401) { onSessionExpired(); return; }
      if (response.status === 503) {
        if (request === requestRef.current) setUnavailable(true);
        return;
      }
      if (!response.ok) throw new Error('Could not load history');

      const data = await response.json();
      if (request === requestRef.current) {
        setAgreements(data.agreements || []);
        setUnavailable(false);
      }
    } catch (error) {
      if (request === requestRef.current) toast.error(error.message);
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [authHeaders, onSessionExpired]);

  // Debounced so typing a registration does not fire a request per character.
  useEffect(() => {
    const timer = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const handleDownload = async (agreement) => {
    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}/pdf`,
        { headers: authHeaders() }
      );
      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) throw new Error('Could not download agreement');

      const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = agreement.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReuse = async (agreement) => {
    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}/form`,
        { headers: authHeaders() }
      );
      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) throw new Error('Could not load those details');

      const data = await response.json();
      onReuse(data.form_data || {});
      toast.success(`Started a new agreement for ${agreement.hirer_name}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (agreement) => {
    const confirmed = window.confirm(
      `Permanently delete the agreement for ${agreement.hirer_name}` +
      `${agreement.vehicle_reg ? ` (${agreement.vehicle_reg})` : ''}?\n\n` +
      'The saved PDF and the details on it will be erased. This cannot be undone.'
    );
    if (!confirmed) return;

    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) throw new Error('Could not delete agreement');

      setAgreements((prev) => prev.filter((a) => a.id !== agreement.id));
      toast.success('Agreement deleted');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  if (unavailable) {
    return (
      <div className="history-container">
        <div className="history-empty">
          <h3>History is not set up yet</h3>
          <p>
            Saved agreements need a database connected to the app. Everything
            else works as normal in the meantime.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-search">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or registration"
          autoComplete="off"
        />
      </div>

      {isLoading && agreements.length === 0 && (
        <div className="history-empty"><p>Loading…</p></div>
      )}

      {!isLoading && agreements.length === 0 && (
        <div className="history-empty">
          <h3>{search ? 'Nothing matches that' : 'No agreements yet'}</h3>
          <p>
            {search
              ? 'Try part of a name or a registration.'
              : 'Agreements you generate will be saved here automatically.'}
          </p>
        </div>
      )}

      <div className="history-list">
        {agreements.map((agreement) => (
          <div className="history-card" key={agreement.id}>
            <div className="history-card-head">
              <span className="history-name">
                {agreement.hirer_name || 'Unnamed hirer'}
              </span>
              <span className="history-date">
                {formatDate(agreement.created_at)}
              </span>
            </div>

            <div className="history-meta">
              {agreement.vehicle_reg && (
                <span className="history-reg">{agreement.vehicle_reg}</span>
              )}
              {agreement.make_model && <span>{agreement.make_model}</span>}
            </div>

            <div className="history-actions">
              <button
                type="button"
                className="history-btn primary"
                onClick={() => handleDownload(agreement)}
                disabled={busyId === agreement.id}
              >
                Download
              </button>
              <button
                type="button"
                className="history-btn"
                onClick={() => handleReuse(agreement)}
                disabled={busyId === agreement.id}
              >
                New hire
              </button>
              <button
                type="button"
                className="history-btn danger"
                onClick={() => handleDelete(agreement)}
                disabled={busyId === agreement.id}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default History;
