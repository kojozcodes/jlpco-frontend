import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from './ConfirmDialog';
import EndHireForm from './EndHireForm';
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
  const [endingAgreement, setEndingAgreement] = useState(null);
  const [confirming, setConfirming] = useState(null);

  // Whether older agreements exist beyond those on screen, and whether they
  // are being fetched. The server sends them a page at a time, newest first.
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Lets a slow response from an earlier keystroke be discarded rather than
  // overwriting results from a later one.
  const requestRef = useRef(0);

  // The search the list on screen was loaded for. The box can already hold
  // something newer that has not been searched yet, and the next page has to
  // continue the list being shown, not start that one.
  const loadedTermRef = useRef('');

  // Held in a ref rather than used directly. A parent that redefines this
  // handler on each render would otherwise change the identity of load, which
  // the search effect depends on, so the effect would re-run on every render
  // and each run fetches: a request loop that locks the page up.
  const sessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => {
    sessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${authToken}`,
  }), [authToken]);

  // One page. After the first, a page is asked for by position, as the ones
  // following the oldest agreement on screen, rather than by how many to skip:
  // an agreement deleted here, or added from another device, would otherwise
  // shift the count and show one twice or miss one out.
  const fetchPage = useCallback((term, after) => {
    const params = new URLSearchParams({ search: term });
    if (after) {
      params.set('before', after.created_at);
      params.set('before_id', after.id);
    }
    return fetch(`${API_BASE_URL}/api/agreements?${params}`, { headers: authHeaders() });
  }, [authHeaders]);

  const load = useCallback(async (term) => {
    const request = ++requestRef.current;
    setIsLoading(true);
    try {
      const response = await fetchPage(term);

      if (response.status === 401) { sessionExpiredRef.current(); return; }
      if (response.status === 503) {
        if (request === requestRef.current) setUnavailable(true);
        return;
      }
      if (!response.ok) throw new Error('Could not load history');

      const data = await response.json();
      if (request === requestRef.current) {
        setAgreements(data.agreements || []);
        setHasMore(Boolean(data.has_more));
        loadedTermRef.current = term;
        setUnavailable(false);
      }
    } catch (error) {
      if (request === requestRef.current) toast.error(error.message);
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [fetchPage]);

  // The next page of the list on screen, added to the end of it.
  const loadMore = async () => {
    if (isLoadingMore) return;
    const last = agreements[agreements.length - 1];
    if (!last) {
      // Everything shown has been deleted, so there is nothing to continue
      // from. Starting the list again brings in what was behind it.
      load(loadedTermRef.current);
      return;
    }

    // Not a new request number: a search started meanwhile replaces the list,
    // and this page belongs to the old one, so it is dropped when it arrives.
    const request = requestRef.current;
    setIsLoadingMore(true);
    try {
      const response = await fetchPage(loadedTermRef.current, last);
      if (response.status === 401) { sessionExpiredRef.current(); return; }
      if (!response.ok) throw new Error('Could not load older agreements');

      const data = await response.json();
      if (request !== requestRef.current) return;
      setAgreements((prev) => {
        const shown = new Set(prev.map((a) => a.id));
        return [...prev, ...(data.agreements || []).filter((a) => !shown.has(a.id))];
      });
      setHasMore(Boolean(data.has_more));
    } catch (error) {
      if (request === requestRef.current) toast.error(error.message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Debounced so typing a registration does not fire a request per character.
  useEffect(() => {
    const timer = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  const saveToDevice = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleView = async (agreement) => {
    // The tab has to be opened during the tap itself. Opening it once the
    // fetch resolves makes it a pop-up as far as Safari is concerned, and it
    // gets blocked.
    const viewer = window.open('', '_blank');

    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}/pdf`,
        { headers: authHeaders() }
      );
      if (response.status === 401) {
        if (viewer) viewer.close();
        sessionExpiredRef.current();
        return;
      }
      if (!response.ok) throw new Error('Could not open agreement');

      // Typed explicitly so the viewer renders it rather than offering to save
      // it, whatever the response headers said.
      const blob = new Blob([await response.arrayBuffer()],
                            { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      if (viewer && !viewer.closed) {
        viewer.location = url;
      } else {
        // Blocked. Saving the file is the only fallback that does not navigate
        // this tab away: there is no stored session, so leaving the page would
        // log the operator out and empty the form they were working on.
        saveToDevice(url, agreement.filename);
        toast('Your browser blocked the preview, so it was saved instead');
      }

      // Long enough for the viewer to have loaded it. The blob is released
      // when that tab closes in any case.
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (viewer) viewer.close();
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
      if (response.status === 401) { sessionExpiredRef.current(); return; }
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

  const applyEnded = (agreementId, endedAt) => {
    setAgreements((prev) => prev.map((a) => (
      a.id === agreementId ? { ...a, ended_at: endedAt } : a
    )));
  };

  // Ending needs the condition and deposit figures, so it opens a form.
  // Reopening only undoes it, so it does not.
  const handleEndOrReopen = async (agreement) => {
    if (!agreement.ended_at) {
      setEndingAgreement(agreement);
      return;
    }

    setConfirming({
      title: 'Reopen this agreement?',
      message: `The end details and the End of Hire page will be removed from `
        + `${agreement.hirer_name}'s agreement.`,
      confirmLabel: 'Reopen',
      onConfirm: () => reopen(agreement),
    });
  };

  const reopen = async (agreement) => {
    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}/end`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (response.status === 401) { sessionExpiredRef.current(); return; }
      if (!response.ok) throw new Error('Could not reopen agreement');

      applyEnded(agreement.id, null);
      toast.success('Agreement reopened');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (agreement) => {
    setConfirming({
      title: 'Delete this agreement?',
      message: `The saved PDF for ${agreement.hirer_name}`
        + `${agreement.vehicle_reg ? ` (${agreement.vehicle_reg})` : ''} and the `
        + `details on it will be erased. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => remove(agreement),
    });
  };

  const remove = async (agreement) => {
    setBusyId(agreement.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (response.status === 401) { sessionExpiredRef.current(); return; }
      if (!response.ok) throw new Error('Could not delete agreement');

      setAgreements((prev) => prev.filter((a) => a.id !== agreement.id));
      toast.success('Agreement deleted');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const formatEnded = (iso) => {
    const date = new Date(iso);
    // Pinned to UK time so this always agrees with the time printed on the
    // document, whatever the device happens to be set to.
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    });
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
      {confirming && (
        <ConfirmDialog
          {...confirming}
          onConfirm={() => { const run = confirming.onConfirm; setConfirming(null); run(); }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {endingAgreement && (
        <EndHireForm
          agreement={endingAgreement}
          authToken={authToken}
          onCancel={() => setEndingAgreement(null)}
          onSessionExpired={() => sessionExpiredRef.current()}
          onEnded={(endedAt) => {
            applyEnded(endingAgreement.id, endedAt);
            setEndingAgreement(null);
          }}
        />
      )}

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
          <div
            className={`history-card${agreement.ended_at ? ' ended' : ''}`}
            key={agreement.id}
          >
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

            {agreement.ended_at && (
              <div className="history-ended">
                Ended {formatEnded(agreement.ended_at)}
              </div>
            )}

            <div className="history-actions">
              <button
                type="button"
                className="history-btn primary"
                onClick={() => handleView(agreement)}
                disabled={busyId === agreement.id}
              >
                View
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
                className="history-btn"
                onClick={() => handleEndOrReopen(agreement)}
                disabled={busyId === agreement.id}
              >
                {agreement.ended_at ? 'Reopen' : 'End hire'}
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

      {hasMore && (
        <button
          type="button"
          className="history-more"
          onClick={loadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? 'Loading…' : 'Show older agreements'}
        </button>
      )}
    </div>
  );
};

export default History;
