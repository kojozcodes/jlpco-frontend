import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import './SignatureCanvas.css';

/**
 * SignatureCanvas Component
 * FIX #4: Proper touch support with NO scroll interference
 * - Prevents page scroll during signature drawing
 * - Works with both touch and mouse
 * - Full freedom of movement (horizontal AND vertical)
 *
 * The signature itself belongs to the parent, passed in as value and reported
 * back through onChange. A pad that owned its own signature lost it whenever
 * this component was unmounted, which is what switching tabs does, so going
 * back to correct one field silently cleared both signatures.
 *
 * Both props are optional: a caller that keeps this mounted for as long as it
 * needs the signature can read it off the ref instead.
 */
const SignatureCanvas = forwardRef(({ value, onChange }, ref) => {
  const canvasRef = useRef(null);
  const signaturePadRef = useRef(null);
  const containerRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Held in a ref rather than used directly, so a parent that redefines the
  // handler on each render does not change what the effect below depends on.
  // That effect builds the pad, and rebuilding it mid-signature would wipe it.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Read once, on mount. value changes with every stroke, so reading it in the
  // effect would make the pad rebuild itself as the operator signs.
  const initialValue = useRef(value);

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
      // Transparent, not white: the exported PNG is stamped straight onto the
      // agreement, and an opaque background punches a white rectangle through
      // whatever the template prints underneath it. The container behind the
      // canvas is white, so this looks no different on screen.
      backgroundColor: 'rgba(0, 0, 0, 0)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 2,
      maxWidth: 3,
      throttle: 0, // No throttle for smooth drawing
      velocityFilterWeight: 0.7,
    });

    // A signature drawn before this component was last unmounted. Replayed
    // from the stored strokes rather than the stored PNG, so it is redrawn at
    // full fidelity instead of being resampled from a bitmap. Like the resize
    // above, the strokes carry their original coordinates, so a signature
    // survives a tab switch rather than a change of orientation.
    const saved = initialValue.current;
    if (saved?.strokes?.length) {
      signaturePadRef.current.fromData(saved.strokes);
      setIsEmpty(false);
    }

    // Track when signature changes
    signaturePadRef.current.addEventListener('endStroke', () => {
      const pad = signaturePadRef.current;
      const empty = pad.isEmpty();
      setIsEmpty(empty);
      // Captured in both forms while the pad is still alive: the strokes to
      // redraw it after a remount, and the PNG because that is what gets sent
      // and this component may be gone by the time Generate is pressed.
      onChangeRef.current?.(empty ? null : {
        strokes: pad.toData(),
        dataUrl: pad.toDataURL(),
      });
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

  // Clearing has to be reported too. The parent holds the signature now, so a
  // pad cleared on screen while the parent still held the old one would put
  // the previous hirer's signature on this agreement.
  const clearPad = useCallback(() => {
    signaturePadRef.current?.clear();
    setIsEmpty(true);
    onChangeRef.current?.(null);
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    clear: clearPad,
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
        onClick={clearPad}
      >
        Clear Signature
      </button>
    </div>
  );
});

export default SignatureCanvas;