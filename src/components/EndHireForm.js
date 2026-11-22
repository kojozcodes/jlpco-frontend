import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import SignatureCanvas from './SignatureCanvas';
import ConfirmDialog from './ConfirmDialog';
import API_BASE_URL from '../config';
import './EndHireForm.css';

// 'a', 'a and b', 'a, b and c', starting with a capital.
const asSentence = (items) => {
  const text = items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
    : items[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * EndHireForm
 *
 * Collects what goes on the End of Hire page: the condition the vehicle came
 * back in, the deposit figures, and both signatures. The end date and time are
 * recorded by the server when this is submitted rather than typed here.
 */
const EndHireForm = ({ agreement, authToken, onCancel, onEnded, onSessionExpired }) => {
  const [returnNotes, setReturnNotes] = useState('');
  const [depositHeld, setDepositHeld] = useState('');
  const [depositWithheld, setDepositWithheld] = useState('');
  const [deductionReason, setDeductionReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // What closing would throw away, while the operator is asked about it.
  const [discarding, setDiscarding] = useState(null);

  // The deposit as read back from the agreement. Arriving with it filled in is
  // not something the operator did, so it does not count as an entry.
  const prefilledDepositRef = useRef('');

  const hirerSigRef = useRef(null);
  const lessorSigRef = useRef(null);

  // The deposit taken at the start lives on the original agreement, so it is
  // read back rather than retyped from memory.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/agreements/${agreement.id}/form`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          const prefilled = String((data.form_data || {}).deposit_amount || '');
          prefilledDepositRef.current = prefilled;
          setDepositHeld(prefilled);
        }
      } catch (e) {
        // Leaving it blank is recoverable; the operator can type it.
      }
    })();
    return () => { cancelled = true; };
  }, [agreement.id, authToken]);

  // Arithmetic rather than judgement, so it is worked out rather than typed.
  const held = parseFloat(depositHeld);
  const withheld = parseFloat(depositWithheld) || 0;
  const depositReturned = Number.isFinite(held)
    ? Math.max(held - withheld, 0).toFixed(2)
    : '';

  const handleSubmit = async () => {
    if (Number.isFinite(held) && withheld > held) {
      toast.error('Amount withheld cannot be more than the deposit held.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agreements/${agreement.id}/end`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            return_notes: returnNotes,
            deposit_amount: depositHeld,
            deposit_withheld: depositWithheld,
            deposit_returned: depositReturned,
            deduction_reason: deductionReason,
            hirer_signature: hirerSigRef.current?.toDataURL(),
            lessor_signature: lessorSigRef.current?.toDataURL(),
          }),
        }
      );

      if (response.status === 401) { onSessionExpired(); return; }
      if (!response.ok) throw new Error('Could not end the agreement');

      const data = await response.json();
      onEnded(data.ended_at);
      toast.success('Agreement ended');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Everything closing the form now would lose, named. This is filled in while
  // the car is being handed back, so a hirer whose signature is lost has often
  // already left, and it cannot simply be taken again.
  const describeEntries = () => {
    const entries = [];
    if (returnNotes.trim()) entries.push('the condition notes');
    if (depositWithheld.trim() || deductionReason.trim()
        || depositHeld !== prefilledDepositRef.current) {
      entries.push('the deposit figures');
    }
    const hirerSigned = !(hirerSigRef.current?.isEmpty() ?? true);
    const lessorSigned = !(lessorSigRef.current?.isEmpty() ?? true);
    if (hirerSigned && lessorSigned) entries.push('both signatures');
    else if (hirerSigned) entries.push("the hirer's signature");
    else if (lessorSigned) entries.push("the lessor's signature");
    return entries;
  };

  // The one way out, for the backdrop and the Cancel button alike. An empty
  // form just closes. One with anything in it asks first: a tap that misses
  // the panel, or lands on Cancel beside End hire, should not cost the lot.
  const requestClose = () => {
    if (isSaving) return;
    const entries = describeEntries();
    if (entries.length) {
      setDiscarding(entries);
      return;
    }
    onCancel();
  };

  // A sibling of the form rather than inside it, so taps on the question do not
  // bubble into the form's backdrop and ask it all over again.
  return (
    <>
    <div className="end-hire-backdrop" onClick={requestClose}>
      <div className="end-hire-panel" onClick={(e) => e.stopPropagation()}>
        <div className="end-hire-head">
          <h2>End hire</h2>
          <p>
            {agreement.hirer_name}
            {agreement.vehicle_reg ? ` · ${agreement.vehicle_reg}` : ''}
          </p>
        </div>

        <div className="end-hire-body">
          <div className="form-group">
            <label>Vehicle condition on return</label>
            <textarea
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="Any damage, or leave blank to write on the printed copy"
              rows="4"
            />
          </div>

          <div className="end-hire-money">
            <div className="form-group">
              <label>Deposit held (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={depositHeld}
                onChange={(e) => setDepositHeld(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Amount withheld (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={depositWithheld}
                onChange={(e) => setDepositWithheld(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Deposit returned (£)</label>
            <input type="text" value={depositReturned} readOnly tabIndex={-1} />
            <span className="end-hire-hint">Worked out from the two figures above</span>
          </div>

          {withheld > 0 && (
            <div className="form-group">
              <label>Reason for deduction</label>
              <input
                type="text"
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                placeholder="e.g. Alloy wheel refurbishment"
              />
            </div>
          )}

          <div className="form-group">
            <label>Hirer signature</label>
            <SignatureCanvas ref={hirerSigRef} />
          </div>

          <div className="form-group">
            <label>Lessor signature (JL PCO Limited)</label>
            <SignatureCanvas ref={lessorSigRef} />
          </div>

          <p className="end-hire-note">
            Signatures are optional. Left blank, the document prints with empty
            lines to sign by hand. Today's date and time are recorded
            automatically.
          </p>
        </div>

        <div className="end-hire-actions">
          <button
            type="button"
            className="end-hire-btn"
            onClick={requestClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="end-hire-btn primary"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? 'Ending…' : 'End hire'}
          </button>
        </div>
      </div>
    </div>

    {discarding && (
      <ConfirmDialog
        title="Discard this end of hire?"
        message={`${asSentence(discarding)} will be lost.`}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => { setDiscarding(null); onCancel(); }}
        onCancel={() => setDiscarding(null)}
      />
    )}
    </>
  );
};

export default EndHireForm;
