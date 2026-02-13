import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import SignatureCanvas from './components/SignatureCanvas';
import DamageMarker from './components/DamageMarker';
import Login from './components/Login';

function App() {
  // ========================================
  // ALL HOOKS MUST BE AT THE TOP - BEFORE ANY RETURNS
  // ========================================
  
  // AUTHENTICATION STATE
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // FORM STATE (WITH 3 NEW FIELDS)
  const [formData, setFormData] = useState({
    // Hirer details
    full_name: '',
    dob: '',
    address: '',
    email: '',              // ✅ NEW FIELD
    phone_number: '',       // ✅ NEW FIELD
    pco_badge_number: '',   // ✅ NEW FIELD
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
  });

  const [activeTab, setActiveTab] = useState('form');
  const [damageMarkers, setDamageMarkers] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const hirerSigRef = useRef(null);
  const lessorSigRef = useRef(null);

  // NO persistent sessions - always require login on app open
  useEffect(() => {
    localStorage.removeItem('jlpco_auth_token');
    localStorage.removeItem('jlpco_token_expires');
    setIsCheckingAuth(false);
  }, []);

  // ========================================
  // EVENT HANDLERS
  // ========================================
  
  const handleLoginSuccess = (token) => {
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // Handle input changes WITHOUT dismissing keyboard
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    e.target.focus();
  };

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

  const handleGeneratePDF = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n• ' + errors.join('\n• '));
      return;
    }

    setIsGenerating(true);

    try {
      const hirerSigData = hirerSigRef.current?.toDataURL();
      const lessorSigData = lessorSigRef.current?.toDataURL();

      const pdfData = {
        ...formData,
        damage_markers: damageMarkers,
        hirer_signature: hirerSigData,
        lessor_signature: lessorSigData,
      };

      const response = await fetch('https://jlpco-backend-production.up.railway.app/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(pdfData),
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert('Session expired. Please login again.');
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

      alert('PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Failed to generate PDF: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearForm = () => {
    if (window.confirm('Are you sure you want to clear all form fields?')) {
      setFormData({
        full_name: '',
        dob: '',
        address: '',
        email: '',
        phone_number: '',
        pco_badge_number: '',
        licence_number: '',
        licence_expiry: '',
        ni_number: '',
        vehicle_reg: '',
        make_model: '',
        vin_number: '',
        hire_start: '',
        insurance_provider: '',
        policy_start: '',
        policy_expiry: '',
        cover_level: '',
        deposit_amount: '',
        deposit_date: '',
        deposit_payment_type: '',
        damage_notes: '',
        wheel_locking_nut: '',
        immobiliser_installed: '',
        dashcam_installed: '',
        dashcam_serial: '',
        puncture_repair_kit: '',
        hirer_sig_date: '',
        lessor_sig_date: '',
      });
      setDamageMarkers([]);
      hirerSigRef.current?.clear();
      lessorSigRef.current?.clear();
    }
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

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          Form Details
        </button>
        <button
          className={`tab ${activeTab === 'damage' ? 'active' : ''}`}
          onClick={() => setActiveTab('damage')}
        >
          Vehicle Condition
        </button>
        <button
          className={`tab ${activeTab === 'signatures' ? 'active' : ''}`}
          onClick={() => setActiveTab('signatures')}
        >
          Signatures
        </button>
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
                  onKeyDown={handleKeyDown}
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
                />
              </div>

              <div className="form-group">
                <label>National Insurance Number</label>
                <input
                  type="text"
                  name="ni_number"
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
                />
              </div>

              <div className="form-group">
                <label>Policy Expiry Date</label>
                <input
                  type="date"
                  name="policy_expiry"
                  value={formData.policy_expiry}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
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
            </div>

            {/* Equipment Section */}
            <div className="card">
              <h2 className="card-title">Vehicle Equipment</h2>
              
              <div className="form-group">
                <label>Wheel Locking Nut</label>
                <input
                  type="text"
                  name="wheel_locking_nut"
                  value={formData.wheel_locking_nut}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Yes/No"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Immobiliser Installed</label>
                <input
                  type="text"
                  name="immobiliser_installed"
                  value={formData.immobiliser_installed}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Yes/No"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>Dashcam Installed</label>
                <input
                  type="text"
                  name="dashcam_installed"
                  value={formData.dashcam_installed}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Yes/No"
                  autoComplete="off"
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
                <label>Puncture Repair Kit</label>
                <input
                  type="text"
                  name="puncture_repair_kit"
                  value={formData.puncture_repair_kit}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Yes/No"
                  autoComplete="off"
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
                onKeyDown={handleKeyDown}
                placeholder="Describe any damage in detail..."
                rows="4"
              />
            </div>
          </div>
        )}

        {activeTab === 'signatures' && (
          <div className="signatures-container">
            <div className="card">
              <h2 className="card-title">Hirer Signature</h2>
              <SignatureCanvas ref={hirerSigRef} />
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
              <SignatureCanvas ref={lessorSigRef} />
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
      </div>

      {/* Footer */}
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
    </div>
  );
}

export default App;