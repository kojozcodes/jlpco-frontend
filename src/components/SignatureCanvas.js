import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import './SignatureCanvas.css';

/**
 * SignatureCanvas Component
 * FIX #4: Proper touch support with NO scroll interference
 * - Prevents page scroll during signature drawing
 * - Works with both touch and mouse
 * - Full freedom of movement (horizontal AND vertical)
 */
const SignatureCanvas = forwardRef((props, ref) => {
  const canvasRef = useRef(null);
  const signaturePadRef = useRef(null);
  const containerRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      
      // Redraw if there was data
      if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
        const data = signaturePadRef.current.toData();
        signaturePadRef.current.fromData(data);
      }
    };

    resizeCanvas();

    // Initialize SignaturePad with custom options
    signaturePadRef.current = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 2,
      maxWidth: 3,
      throttle: 0, // No throttle for smooth drawing
      velocityFilterWeight: 0.7,
    });

    // Track when signature changes
    signaturePadRef.current.addEventListener('endStroke', () => {
      setIsEmpty(signaturePadRef.current.isEmpty());
    });

    // CRITICAL FIX: Prevent scroll during signature drawing
    const preventScroll = (e) => {
      // Only prevent if touch is on the canvas
      if (e.target === canvas || canvas.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Add touch event listeners to PREVENT SCROLL
    canvas.addEventListener('touchstart', preventScroll, { passive: false });
    canvas.addEventListener('touchmove', preventScroll, { passive: false });
    canvas.addEventListener('touchend', preventScroll, { passive: false });
    
    // Also prevent on container
    container.addEventListener('touchstart', preventScroll, { passive: false });
    container.addEventListener('touchmove', preventScroll, { passive: false });

    // Handle window resize
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('touchstart', preventScroll);
      canvas.removeEventListener('touchmove', preventScroll);
      canvas.removeEventListener('touchend', preventScroll);
      container.removeEventListener('touchstart', preventScroll);
      container.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    clear: () => {
      signaturePadRef.current?.clear();
      setIsEmpty(true);
    },
    isEmpty: () => {
      return signaturePadRef.current?.isEmpty() ?? true;
    },
    toDataURL: (type = 'image/png') => {
      if (signaturePadRef.current?.isEmpty()) {
        return null;
      }
      return signaturePadRef.current?.toDataURL(type);
    },
    fromDataURL: (dataURL) => {
      signaturePadRef.current?.fromDataURL(dataURL);
      setIsEmpty(false);
    },
  }));

  const handleClear = () => {
    signaturePadRef.current?.clear();
    setIsEmpty(true);
  };

  return (
    <div className="signature-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
      />
      {isEmpty && (
        <div className="signature-placeholder">
          Sign here...
        </div>
      )}
      <button
        type="button"
        className="signature-clear-btn"
        onClick={handleClear}
      >
        Clear Signature
      </button>
    </div>
  );
});

export default SignatureCanvas;