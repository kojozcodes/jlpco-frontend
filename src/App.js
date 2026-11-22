import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import SignatureCanvas from './components/SignatureCanvas';
import DamageMarker from './components/DamageMarker';
import Login from './components/Login';
import History from './components/History';
import ConfirmDialog from './components/ConfirmDialog';
import YesNoToggle from './components/YesNoToggle';
import toast, { Toaster } from 'react-hot-toast';
import API_BASE_URL from './config';

// Preload car diagram
const preloadImg = new Image();
preloadImg.src = '/car_diagram.png';

const EMPTY_FORM = {
  // Hirer details
  full_name: '',
  dob: '',
  address: '',
  email: '',
  phone_number: '',
  pco_badge_number: '',
  licence_number: '',
  licence_expiry: '',
  ni_number: '',

  // Vehicle details
  vehicle_reg: '',
  make_model: '',
  vin_number: '',
  hire_start: '',

  // Insurance details
  insurance_provider: '',
  policy_start: '',
  policy_expiry: '',
  cover_level: '',

  // Deposit details
  deposit_amount: '',
  deposit_date: '',
  deposit_payment_type: '',
  weekly_rent_amount: '',
  payment_start_date: '',

  // Vehicle condition
  damage_notes: '',
  wheel_locking_nut: '',
  immobiliser_installed: '',
  dashcam_installed: '',
  dashcam_serial: '',
  puncture_repair_kit: '',

  // Signature dates
  hirer_sig_date: '',
  lessor_sig_date: '',
};

// Details carried over to the next agreement, so starting a new hire only
// means typing what actually changed.
//
// Anything identifying a hirer or a particular vehicle is deliberately left
// out - name, date of birth, address, contact details, licence, NI number,
// registration, VIN, dashcam serial, and every per-hire date. Carrying those
// over risks an agreement going out with the previous hirer's details still
// sitting in a field nobody scrolled back to, which on a signed contract is
// both a data protection problem and the wrong contract.
const REMEMBERED_FIELDS = [
  'insurance_provider',
  'policy_start',
  'policy_expiry',
  'cover_level',
  'deposit_amount',
  'deposit_payment_type',
  'weekly_rent_amount',
  'wheel_locking_nut',
  'immobiliser_installed',
  'dashcam_installed',
  'puncture_repair_kit',
];

const SAVED_DETAILS_KEY = 'jlpco_saved_details';

// localStorage throws in private browsing on iOS. Failing to remember should
// never be the reason an operator cannot produce an agreement, so both of
// these fail quietly.
const loadSavedDetails = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_DETAILS_KEY) || '{}');
    return REMEMBERED_FIELDS.reduce((details, field) => {
      if (typeof saved[field] === 'string') details[field] = saved[field];
      return details;
    }, {});
  } catch (e) {
    return {};
  }
};

const saveDetails = (values) => {
  try {
    const details = REMEMBERED_FIELDS.reduce((saved, field) => {
      saved[field] = values[field] || '';
      return saved;
    }, {});
    localStorage.setItem(SAVED_DETAILS_KEY, JSON.stringify(details));
  } catch (e) {
    // Nothing to do - the agreement itself was still generated.
  }
};

// Answered with Yes and No buttons rather than typed.
const YES_NO_FIELDS = [
  'wheel_locking_nut',
  'immobiliser_installed',
  'dashcam_installed',
  'puncture_repair_kit',
];

// Identifiers printed in capitals on official documents, upper-cased as typed.
const UPPERCASE_FIELDS = ['vehicle_reg', 'ni_number', 'licence_number', 'vin_number'];

// An answer typed before these fields became buttons, read as the button it
// meant. Anything that is not plainly a yes or no is left exactly as it was,
// for the toggle to show, rather than guessed at.
const asYesNo = (value) => {
  const answer = String(value ?? '').trim().toLowerCase();
  if (answer === 'yes' || answer === 'y') return 'Yes';
  if (answer === 'no' || answer === 'n') return 'No';
  return value ?? '';
};

// Applied wherever a whole form arrives at once, from the saved details, a
// past agreement or a draft, so values entered before these rules existed are
// brought into line and the screen shows what the agreement will print.
const tidyForm = (form) => {
  const tidy = { ...form };
  YES_NO_FIELDS.forEach((field) => {
    tidy[field] = asYesNo(tidy[field]);
  });
  UPPERCASE_FIELDS.forEach((field) => {
    if (typeof tidy[field] === 'string') tidy[field] = tidy[field].toUpperCase();
  });
  return tidy;
};

const newAgreementForm = () => tidyForm({ ...EMPTY_FORM, ...loadSavedDetails() });

// The agreement currently being filled in, kept so it survives the tab being
// lost: iOS discards background tabs when memory runs short, so switching to
// WhatsApp mid-handover could come back to an empty form, and with no stored
// session a reload means logging in again on top of that.
//
// This holds hirer details, which the saved details above deliberately never
// do. The difference is that this never outlives the agreement it belongs to.
// It is cleared once that agreement is produced, offered back rather than
// silently restored, and dropped after DRAFT_MAX_AGE_MS. What must not happen
// is one hirer's details quietly reappearing as the start of the next agreement.
//
// Signatures are left out, as they are from the archive. A detached copy of a
// signature has no use, and they take seconds to redo.
const DRAFT_KEY = 'jlpco_draft';

// Long enough to cover a discarded tab or a phone that died mid-handover,
// short enough that an abandoned agreement is not offered back days later.
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const loadDraft = () => {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!draft || typeof draft.savedAt !== 'number' || !draft.formData) {
      return null;
    }
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch (e) {
    return null;
  }
};

// Fail quietly, like the saved details: running out of storage or being in
// private browsing should cost the safety net, never the agreement.
const saveDraft = (formData, damageMarkers) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      savedAt: Date.now(),
      formData,
      damageMarkers,
    }));
  } catch (e) {
    // Nothing to do - the form on screen is unaffected.
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    // Nothing to do.
  }
};

// Whether anything has actually been done on this agreement. A form holding
// nothing but the details carried over from the last one has had no work put
// into it, and offering that back would only be noise.
const draftHasWork = (formData, damageMarkers) => (
  (Array.isArray(damageMarkers) && damageMarkers.length > 0)
  || Object.entries(formData || {}).some(([field, value]) => (
    !REMEMBERED_FIELDS.includes(field)
    && typeof value === 'string'
    && value.trim() !== ''
  ))
);

// Identifies one exact state of the form, to recognise an agreement that has
// already been produced.
const snapshotOf = (formData, damageMarkers) => JSON.stringify([formData, damageMarkers]);

// Dates from <input type="date"> arrive as YYYY-MM-DD, which compares
// correctly as plain text. Comparing them that way avoids new Date(), which
// reads a bare date as midnight UTC and can land on the wrong day in BST.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Today in UK time, as YYYY-MM-DD. The business runs on UK time, so a phone
// set to another timezone should not move what counts as today.
const todayInUK = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

// YYYY-MM-DD as DD/MM/YYYY, the way the agreement prints it.
const asUKDate = (iso) => iso.split('-').reverse().join('/');

// Dates that would leave the hire uncovered: a driving licence or insurance
// policy that has lapsed, or a policy not yet started, by the time it matters.
// Each comes with a short hint for under its field and a full sentence for the
// warning at Generate, in the order the fields appear on the form.
//
// Measured against the hire start, or today when that is later or not set. A
// hire that started in the past is still running, so a licence that has
// expired since then matters as much as one that expired before it.
//
// Grounds to look again, not to refuse: a renewed licence may simply not have
// been typed in yet.
const findDateProblems = (form, today = todayInUK()) => {
  const valid = (value) => (ISO_DATE.test(value || '') ? value : '');
  const hireStart = valid(form.hire_start);
  const startsLater = hireStart > today;
  const reference = startsLater ? hireStart : today;
  const beforeStart = startsLater ? `, before the hire starts on ${asUKDate(hireStart)}` : '';
  const problems = [];

  const checkExpiry = (field, noun, shortNoun) => {
    const expiry = valid(form[field]);
    if (!expiry || expiry >= reference) return;
    const expired = expiry < today;
    problems.push({
      field,
      title: expired ? `${noun} expired` : `${noun} expires before the hire`,
      hint: expired
        ? `This ${shortNoun} has expired.`
        : `This ${shortNoun} expires before the hire starts.`,
      warning: `The ${noun.toLowerCase()} ${expired ? 'expired' : 'expires'} `
        + `on ${asUKDate(expiry)}${beforeStart}.`,
    });
  };

  checkExpiry('licence_expiry', 'Driving licence', 'licence');

  const policyStart = valid(form.policy_start);
  if (policyStart && policyStart > reference) {
    problems.push({
      field: 'policy_start',
      title: 'Insurance not started',
      hint: startsLater
        ? 'This policy starts after the hire does.'
        : 'This policy has not started yet.',
      warning: `The insurance policy does not start until ${asUKDate(policyStart)}`
        + `${startsLater ? `, after the hire starts on ${asUKDate(hireStart)}` : ''}.`,
    });
  }

  checkExpiry('policy_expiry', 'Insurance policy', 'policy');

  return problems;
};

function App() {
  // ========================================
  // ALL HOOKS MUST BE AT THE TOP - BEFORE ANY RETURNS
  // ========================================
  
  // AUTHENTICATION STATE
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // FORM STATE - starts from the details carried over from the last agreement
  const [formData, setFormData] = useState(newAgreementForm);

  const [activeTab, setActiveTab] = useState('form');
  const [damageMarkers, setDamageMarkers] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Each is { strokes, dataUrl } or null. Kept here rather than inside the
  // pads themselves, which are unmounted the moment the operator leaves the
  // Signatures tab to check a field.
  const [hirerSignature, setHirerSignature] = useState(null);
  const [lessorSignature, setLessorSignature] = useState(null);
  // What is worth a second look before generating: dates that leave the hire
  // uncovered and missing signatures, asked about together.
  const [pendingWarnings, setPendingWarnings] = useState(null);

  // A field to bring into view once the Details tab has rendered.
  const [scrollTarget, setScrollTarget] = useState(null);

  // An unfinished agreement found in storage at sign-in, waiting for the
  // operator to say whether to carry on with it.
  const [pendingDraft, setPendingDraft] = useState(null);

  // The exact form that was last turned into an agreement. A draft of that is
  // a copy of finished work, so it is cleared rather than kept.
  const [producedSnapshot, setProducedSnapshot] = useState(null);

  const hirerSigRef = useRef(null);
  const lessorSigRef = useRef(null);

  // NO persistent sessions - always require login on app open
  useEffect(() => {
    localStorage.removeItem('jlpco_auth_token');
    localStorage.removeItem('jlpco_token_expires');
    setIsCheckingAuth(false);
  }, []);

  // Keep the draft in step with the form. Debounced, as localStorage writes
  // block the page and this would otherwise run on every keystroke.
  //
  // Paused until signed in and while a found draft is waiting for an answer.
  // Both are moments when the form on screen is a fresh one, and saving it
  // would overwrite the very draft that is about to be offered back.
  useEffect(() => {
    if (!isAuthenticated || pendingDraft) return undefined;

    const timer = setTimeout(() => {
      const alreadyProduced =
        snapshotOf(formData, damageMarkers) === producedSnapshot;
      if (!alreadyProduced && draftHasWork(formData, damageMarkers)) {
        saveDraft(formData, damageMarkers);
      } else {
        clearDraft();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, damageMarkers, isAuthenticated, pendingDraft, producedSnapshot]);

  // After Go back from the warning, bring the date that needs fixing into
  // view. The Details tab is long, and may not have been showing when the
  // warning was answered, so this waits for it to render.
  useEffect(() => {
    if (!scrollTarget || activeTab !== 'form') return;
    document.querySelector(`[name="${scrollTarget}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollTarget(null);
  }, [scrollTarget, activeTab]);

  // Worked out on every render, so a hint appears under a date as soon as it
  // is entered and goes as soon as it is corrected. Insurance dates are carried
  // over from the last agreement, so a lapsed fleet policy shows up the moment
  // a new agreement is started rather than at the end.
  const dateProblems = findDateProblems(formData);
  const dateProblemFor = (field) => dateProblems.find((p) => p.field === field);

  const dateWarningProps = (field) => (dateProblemFor(field)
    ? { className: 'input-warning', 'aria-describedby': `${field}-warning` }
    : {});

  const renderDateWarning = (field) => {
    const problem = dateProblemFor(field);
    return problem && (
      <p id={`${field}-warning`} className="field-hint field-warning">{problem.hint}</p>
    );
  };

  // ========================================
  // EVENT HANDLERS
  // ========================================
  
  const handleLoginSuccess = (token) => {
    setAuthToken(token);
    setIsAuthenticated(true);

    // Looked for only once signed in, since it holds a hirer's details.
    //
    // Skipped when the form already has work on it. That happens when a
    // session expires mid-agreement: the form never left the screen, so it is
    // the newer copy, and offering the draft back would only offer itself.
    if (!draftHasWork(formData, damageMarkers)) {
      const draft = loadDraft();
      if (draft && draftHasWork(draft.formData, draft.damageMarkers)) {
        setPendingDraft(draft);
      }
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // The keyboard stays up because these inputs are rendered in place and keep
  // the same element from one keystroke to the next, so focus is never lost.
  // An earlier version also called focus() on every keystroke to the same
  // end; it could not have helped (were the element ever replaced, focusing
  // the old one would do nothing) and has been dropped.
  const handleInputChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;

    if (UPPERCASE_FIELDS.includes(name) && value !== value.toUpperCase()) {
      // Written back to the field before React sees it, and the caret put back
      // where it was. Left to React, a value that differs from what is in the
      // field moves the caret to the end, so correcting one character in the
      // middle of a registration would send the next keystroke to the end.
      const { selectionStart, selectionEnd } = e.target;
      value = value.toUpperCase();
      e.target.value = value;
      e.target.setSelectionRange(selectionStart, selectionEnd);
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // For controls that are not text inputs, such as the Yes and No buttons.
  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // For single-line fields, where Enter has nothing to do. The Address and
  // Damage Notes boxes deliberately do without it: there Enter starts a new
  // line, which the agreement prints as ", " within the address and as a new
  // printed line in the notes.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const validateForm = () => {
    const errors = [];
    if (!formData.full_name.trim()) errors.push('Full Name is required');
    if (!formData.vehicle_reg.trim()) errors.push('Vehicle Registration is required');
    if (!formData.make_model.trim()) errors.push('Vehicle Make/Model is required');
    return errors;
  };

  const generatePDF = async () => {
    setIsGenerating(true);

    // Taken now, not on success. Anything typed while the request is in
    // flight is not on this agreement, so it must not count as produced.
    const sentSnapshot = snapshotOf(formData, damageMarkers);

    try {
      const pdfData = {
        ...formData,
        damage_markers: damageMarkers,
        hirer_signature: hirerSignature?.dataUrl || null,
        lessor_signature: lessorSignature?.dataUrl || null,
      };

      const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(pdfData),
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Session expired. Please login again.');
          handleLogout();
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JL_PCO_Hire_${formData.vehicle_reg}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Only once the agreement has actually been produced - a failed attempt
      // should not change what the next one starts with.
      saveDetails(formData);

      // Produced and archived, so the draft has done its job. Recording what
      // was sent lets the autosave tell this agreement apart from any edit
      // made after it, which is new work and is saved again as normal.
      setProducedSnapshot(sentSnapshot);
      clearDraft();

      toast.success('PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error(`Failed to generate PDF: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Which signature is still missing, as something worth reading.
  const unsignedDescription = () => {
    if (!hirerSignature && !lessorSignature) {
      return 'Neither signature has been added yet.';
    }
    return !hirerSignature
      ? 'The hirer has not signed yet.'
      : 'The lessor has not signed yet.';
  };

  const handleGeneratePDF = () => {
    const errors = validateForm();
    if (errors.length > 0) {
      toast.error('Please fix the following errors:\n\n• ' + errors.join('\n• '));
      return;
    }

    // Worth a second look rather than reasons to refuse. An agreement is
    // sometimes printed and signed by hand, and a renewed licence may not have
    // been typed in yet. Each should be a decision, though, rather than
    // something noticed after the hirer has driven off.
    const unsigned = !hirerSignature || !lessorSignature;
    if (dateProblems.length || unsigned) {
      setPendingWarnings({ dates: dateProblems, unsigned });
      return;
    }

    generatePDF();
  };

  // Everything worth checking in one question, rather than one after another.
  const warningDialog = ({ dates, unsigned }) => {
    if (!dates.length) {
      return {
        title: 'Generate without a signature?',
        message: `${unsignedDescription()} The agreement will print with `
          + 'blank signature lines to be signed by hand.',
        cancelLabel: 'Go and sign',
      };
    }
    const lines = [
      ...dates.map((problem) => problem.warning),
      ...(unsigned ? [unsignedDescription()] : []),
    ];
    return {
      title: lines.length === 1 ? dates[0].title : `${lines.length} things to check`,
      message: lines.length === 1 ? lines[0] : lines.map((line) => `• ${line}`).join('\n'),
      cancelLabel: 'Go back',
    };
  };

  const confirmWarnings = () => {
    setPendingWarnings(null);
    generatePDF();
  };

  // Back to the first thing to fix: a date, brought into view on the Details
  // tab, or failing that the signatures.
  const dismissWarnings = () => {
    const { dates } = pendingWarnings;
    setPendingWarnings(null);
    if (dates.length) {
      setActiveTab('form');
      setScrollTarget(dates[0].field);
    } else {
      setActiveTab('signatures');
    }
  };

  const handleSessionExpired = () => {
    toast.error('Session expired. Please login again.');
    handleLogout();
  };

  // Both the state and the pads. The state is the signature now and the pads
  // are only displaying it, so whichever of the two is forgotten is the one
  // that leaves the previous hirer's signature attached to the next
  // agreement. The pads may not be mounted, which is exactly why the state
  // cannot be left to them.
  const clearSignatures = () => {
    setHirerSignature(null);
    setLessorSignature(null);
    hirerSigRef.current?.clear();
    lessorSigRef.current?.clear();
  };

  // Start a fresh agreement from a past one. Everything specific to the
  // previous hire is dropped: the signatures were never stored, and carrying
  // the old damage marks or signing dates forward would describe the wrong
  // handover.
  const handleReuseAgreement = (previous) => {
    const {
      damage_notes, hirer_sig_date, lessor_sig_date,
      hire_start, deposit_date, payment_start_date,
      ...details
    } = previous;
    setFormData(tidyForm({ ...EMPTY_FORM, ...details }));
    setDamageMarkers([]);
    clearSignatures();
    setActiveTab('form');
  };

  // Clearing starts the next agreement rather than emptying everything: hirer,
  // vehicle, damage and signatures go, the saved details stay.
  const handleClearForm = () => {
    setIsClearing(true);
  };

  const startNewAgreement = () => {
    setFormData(newAgreementForm());
    setDamageMarkers([]);
    clearSignatures();
    clearDraft();
    setIsClearing(false);
  };

  // Enough to recognise the draft by, so nobody is guessing whose details they
  // are about to bring back onto the screen.
  const draftSummary = (draft) => {
    const form = draft.formData || {};
    const name = (form.full_name || '').trim();
    const reg = (form.vehicle_reg || '').trim();
    const who = name && reg ? `${name} (${reg})` : name || reg;

    const savedAt = new Date(draft.savedAt);
    const zone = { timeZone: 'Europe/London' };
    const day = savedAt.toLocaleDateString('en-GB', { ...zone, day: 'numeric', month: 'short' });
    const time = savedAt.toLocaleTimeString('en-GB', { ...zone, hour: '2-digit', minute: '2-digit' });

    return `You were part way through an agreement${who ? ` for ${who}` : ''}, `
      + `last changed ${day} at ${time}.\n`
      + 'Its details can be brought back. The signatures will need doing again.';
  };

  const restoreDraft = () => {
    const draft = pendingDraft;
    setPendingDraft(null);
    if (!draft) return;
    setFormData(tidyForm({ ...EMPTY_FORM, ...draft.formData }));
    setDamageMarkers(Array.isArray(draft.damageMarkers) ? draft.damageMarkers : []);
    clearSignatures();
    setActiveTab('form');
  };

  const discardDraft = () => {
    setPendingDraft(null);
    clearDraft();
  };

  // ========================================
  // CONDITIONAL RENDERING (AFTER ALL HOOKS)
  // ========================================
  
  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // ========================================
  // MAIN AUTHENTICATED UI
  // ========================================
  
  return (
    <div className="app">
      {isClearing && (
        <ConfirmDialog
          title="Start a new agreement?"
          message={'Hirer, vehicle, damage and signature details will be cleared.\n'
            + 'Insurance, deposit and equipment details will be kept.'}
          confirmLabel="Start new"
          onConfirm={startNewAgreement}
          onCancel={() => setIsClearing(false)}
        />
      )}
      {pendingDraft && (
        <ConfirmDialog
          title="Carry on where you left off?"
          message={draftSummary(pendingDraft)}
          confirmLabel="Carry on"
          cancelLabel="Start fresh"
          dismissible={false}
          onConfirm={restoreDraft}
          onCancel={discardDraft}
        />
      )}
      {pendingWarnings && (
        <ConfirmDialog
          {...warningDialog(pendingWarnings)}
          confirmLabel="Generate anyway"
          onConfirm={confirmWarnings}
          onCancel={dismissWarnings}
        />
      )}
      {/* Started below the status bar, which the page now extends behind on an
          iPhone running the app from the home screen. 16px is the library's own
          default; elsewhere the inset is zero and nothing moves. */}
      <Toaster position="top-center" containerStyle={{ top: 'calc(16px + env(safe-area-inset-top))' }} toastOptions={{ duration: 3000, style: { background: '#333', color: '#fff', borderRadius: '8px' }, success: { duration: 3000, iconTheme: { primary: '#52C41A', secondary: '#fff' } }, error: { duration: 4000 } }} />
      {/* Header and tabs stick together as one block, so the tabs sit directly
          under the header whatever height it ends up. Pinning the tabs at a
          fixed offset broke whenever the title wrapped, as it does on a narrow
          phone or with a larger text size, and the tabs slid under it. */}
      <div className="top-bar">
      {/* Header with Logout Button */}
      <header className="header">
        <img src="/logo.png" alt="JL PCO" className="logo" />
        <h1>Hire Agreement Generator</h1>
        <button
          className="logout-button"
          onClick={handleLogout}
          title="Logout"
        >
          Logout
        </button>
      </header>

      {/* Tabs. The two long labels have short forms for phones, where all
          four at full length do not fit and History was pushed off screen. */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          <span className="tab-label-long">Form Details</span>
          <span className="tab-label-short">Details</span>
        </button>
        <button
          className={`tab ${activeTab === 'damage' ? 'active' : ''}`}
          onClick={() => setActiveTab('damage')}
        >
          <span className="tab-label-long">Vehicle Condition</span>
          <span className="tab-label-short">Condition</span>
        </button>
        <button
          className={`tab ${activeTab === 'signatures' ? 'active' : ''}`}
          onClick={() => setActiveTab('signatures')}
        >
          Signatures
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>
      </div>

      {/* Main Content */}
      <div className="content">
        {activeTab === 'form' && (
          <div className="form-container">
            {/* Hirer Details Card */}
            <div className="card">
              <h2 className="card-title">Hirer Details</h2>
              
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter full name"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Date of Birth</label>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="form-group">
                <label>Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Enter full address"
                  rows="3"
                />
              </div>

              {/* ✅ NEW FIELD: Email */}
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter email address"
                  autoComplete="off"
                />
              </div>

              {/* ✅ NEW FIELD: Phone Number */}
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter phone number"
                  autoComplete="off"
                />
              </div>

              {/* ✅ NEW FIELD: PCO Badge Number */}
              <div className="form-group">
                <label>PCO Badge Number</label>
                <input
                  type="text"
                  name="pco_badge_number"
                  value={formData.pco_badge_number}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter PCO badge number"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Driving Licence Number</label>
                <input
                  type="text"
                  name="licence_number"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={formData.licence_number}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter licence number"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Licence Expiry Date</label>
                <input
                  type="date"
                  name="licence_expiry"
                  value={formData.licence_expiry}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  {...dateWarningProps('licence_expiry')}
                />
                {renderDateWarning('licence_expiry')}
              </div>

              <div className="form-group">
                <label>National Insurance Number</label>
                <input
                  type="text"
                  name="ni_number"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={formData.ni_number}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter NI number"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Vehicle Details Card */}
            <div className="card">
              <h2 className="card-title">Vehicle Details</h2>
              
              <div className="form-group">
                <label>Vehicle Registration</label>
                <input
                  type="text"
                  name="vehicle_reg"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={formData.vehicle_reg}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. AB12 CDE"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Make / Model</label>
                <input
                  type="text"
                  name="make_model"
                  value={formData.make_model}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Toyota Prius"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Vehicle VIN Number</label>
                <input
                  type="text"
                  name="vin_number"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={formData.vin_number}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter VIN"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Hire Start Date</label>
                <input
                  type="date"
                  name="hire_start"
                  value={formData.hire_start}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            {/* Insurance Details Card */}
            <div className="card">
              <h2 className="card-title">Insurance Details</h2>
              
              <div className="form-group">
                <label>Insurance Provider</label>
                <input
                  type="text"
                  name="insurance_provider"
                  value={formData.insurance_provider}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter provider name"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Policy Valid From</label>
                <input
                  type="date"
                  name="policy_start"
                  value={formData.policy_start}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  {...dateWarningProps('policy_start')}
                />
                {renderDateWarning('policy_start')}
              </div>

              <div className="form-group">
                <label>Policy Expiry Date</label>
                <input
                  type="date"
                  name="policy_expiry"
                  value={formData.policy_expiry}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  {...dateWarningProps('policy_expiry')}
                />
                {renderDateWarning('policy_expiry')}
              </div>

              <div className="form-group">
                <label>Level of Cover</label>
                <input
                  type="text"
                  name="cover_level"
                  value={formData.cover_level}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Comprehensive"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Deposit Details Card */}
            <div className="card">
              <h2 className="card-title">Deposit Details</h2>
              
              <div className="form-group">
                <label>Deposit Amount (£)</label>
                <input
                  type="number"
                  name="deposit_amount"
                  value={formData.deposit_amount}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Deposit Paid Date</label>
                <input
                  type="date"
                  name="deposit_date"
                  value={formData.deposit_date}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="form-group">
                <label>Deposit Payment Type</label>
                <input
                  type="text"
                  name="deposit_payment_type"
                  value={formData.deposit_payment_type}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Bank Transfer"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Weekly Rent Amount (£)</label>
                <input
                  type="number"
                  name="weekly_rent_amount"
                  value={formData.weekly_rent_amount}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Payment Start Date</label>
                <input
                  type="date"
                  name="payment_start_date"
                  value={formData.payment_start_date}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            {/* Equipment Section */}
            <div className="card">
              <h2 className="card-title">Vehicle Equipment</h2>
              
              <div className="form-group">
                <label id="wheel_locking_nut-label">Wheel Locking Nut</label>
                <YesNoToggle
                  name="wheel_locking_nut"
                  labelId="wheel_locking_nut-label"
                  value={formData.wheel_locking_nut}
                  onChange={setField}
                />
              </div>

              <div className="form-group">
                <label id="immobiliser_installed-label">Immobiliser Installed</label>
                <YesNoToggle
                  name="immobiliser_installed"
                  labelId="immobiliser_installed-label"
                  value={formData.immobiliser_installed}
                  onChange={setField}
                />
              </div>

              <div className="form-group">
                <label id="dashcam_installed-label">Dashcam Installed</label>
                <YesNoToggle
                  name="dashcam_installed"
                  labelId="dashcam_installed-label"
                  value={formData.dashcam_installed}
                  onChange={setField}
                />
              </div>

              <div className="form-group">
                <label>Dashcam Serial Number</label>
                <input
                  type="text"
                  name="dashcam_serial"
                  value={formData.dashcam_serial}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter serial number"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label id="puncture_repair_kit-label">Puncture Repair Kit</label>
                <YesNoToggle
                  name="puncture_repair_kit"
                  labelId="puncture_repair_kit-label"
                  value={formData.puncture_repair_kit}
                  onChange={setField}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'damage' && (
          <div className="damage-container">
            <h2 className="section-title">Vehicle Condition & Damage Record</h2>
            <p className="info-text">
              Tap on the car diagram to mark existing damage. Tap a marker to remove it.
            </p>
            
            <DamageMarker 
              markers={damageMarkers}
              onMarkersChange={setDamageMarkers}
            />

            <div className="form-group">
              <label>Damage Notes</label>
              <textarea
                name="damage_notes"
                value={formData.damage_notes}
                onChange={handleInputChange}
                placeholder="Describe any damage in detail..."
                rows="4"
              />
              <p className="field-hint">
                The agreement has room for 3 printed lines. Anything longer is
                shortened, so keep each point brief.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'signatures' && (
          <div className="signatures-container">
            <div className="card">
              <h2 className="card-title">Hirer Signature</h2>
              <SignatureCanvas
                ref={hirerSigRef}
                value={hirerSignature}
                onChange={setHirerSignature}
              />
              <div className="form-group" style={{ marginTop: '15px' }}>
                <label>Date</label>
                <input
                  type="date"
                  name="hirer_sig_date"
                  value={formData.hirer_sig_date}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">Lessor Signature (JL PCO Limited)</h2>
              <SignatureCanvas
                ref={lessorSigRef}
                value={lessorSignature}
                onChange={setLessorSignature}
              />
              <div className="form-group" style={{ marginTop: '15px' }}>
                <label>Date</label>
                <input
                  type="date"
                  name="lessor_sig_date"
                  value={formData.lessor_sig_date}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <History
            authToken={authToken}
            onSessionExpired={handleSessionExpired}
            onReuse={handleReuseAgreement}
          />
        )}
      </div>

      {/* Footer */}
      {activeTab !== 'history' && (
      <footer className="footer">
        <button
          className="btn btn-secondary"
          onClick={handleClearForm}
          disabled={isGenerating}
        >
          Clear Form
        </button>
        <button
          className="btn btn-primary"
          onClick={handleGeneratePDF}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate PDF'}
        </button>
      </footer>
      )}
    </div>
  );
}

export default App;