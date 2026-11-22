import React, { useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import './DamageMarker.css';

/**
 * DamageMarker Component
 * FIX #3: Car diagram loads correctly and markers appear exactly where tapped
 * - Maintains exact PDF aspect ratio (420:250 = 1.68)
 * - Normalized coordinates (0-1) for accurate PDF placement
 * - Touch-optimized for mobile
 */
// How far a finger may drift between touching down and lifting off and still
// count as a tap, in on-screen pixels. Further than that, it was a scroll.
const TAP_SLOP = 10;

const DamageMarker = ({ markers, onMarkersChange }) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // How the current touch began, to tell a tap on the diagram from a scroll
  // or a pinch that happens to pass over it. Without this, every finger lifted
  // over the diagram placed a marker: scrolling the page with a swipe that
  // ended on the car put damage on the agreement that was never there.
  const touchRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length > 1) {
      // A second finger: a pinch, whatever the first one was doing.
      touchRef.current = { pinch: true };
      return;
    }
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, pinch: false };
  };

  const handleTouchEnd = (e) => {
    // Always, so the browser does not follow the touch with a click that would
    // land here as a second tap.
    e.preventDefault();
    if (e.touches.length > 0) return;          // fingers still down: wait for the last
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || start.pinch) return;
    const touch = e.changedTouches[0];
    // Touch positions are in page pixels, which shrink on screen-terms as the
    // page is zoomed in: at 2x a finger moving 10px on the glass moves 5px
    // across the page. Converted back to the screen, so that a small pan while
    // zoomed in is still a pan and not a tap.
    const scale = window.visualViewport?.scale || 1;
    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y) * scale;
    if (moved > TAP_SLOP) return;
    handleCanvasClick(e);
  };
  // const [imageRect, setImageRect] = useState(null);

  // // EXACT PDF dimensions from your template
  // const PDF_ASPECT_RATIO = 420 / 250; // 1.68

  // useEffect(() => {
  //   const updateImageRect = () => {
  //     if (imageRef.current && imageLoaded) {
  //       const rect = imageRef.current.getBoundingClientRect();
  //       setImageRect({
  //         x: rect.left,
  //         y: rect.top,
  //         width: rect.width,
  //         height: rect.height,
  //       });
  //     }
  //   };

  //   updateImageRect();
  //   window.addEventListener('resize', updateImageRect);
  //   window.addEventListener('scroll', updateImageRect);

  //   return () => {
  //     window.removeEventListener('resize', updateImageRect);
  //     window.removeEventListener('scroll', updateImageRect);
  //   };
  // }, [imageLoaded]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleCanvasClick = (e) => {
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();

    // Get click/touch position
    const touch = e.changedTouches?.[0] || e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    // Convert to normalized coordinates (0-1) relative to image
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    // Check if click is within image bounds
    if (
      relativeX < 0 ||
      relativeX > rect.width ||
      relativeY < 0 ||
      relativeY > rect.height
    ) {
      return;
    }

    const normalizedX = relativeX / rect.width;
    const normalizedY = relativeY / rect.height;

    // Check if clicking on existing marker to remove it
    const markerRadius = 12; // Match desktop app
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const markerScreenX = rect.left + marker.x * rect.width;
      const markerScreenY = rect.top + marker.y * rect.height;

      const distance = Math.sqrt(
        Math.pow(clientX - markerScreenX, 2) +
        Math.pow(clientY - markerScreenY, 2)
      );

      if (distance <= markerRadius + 5) {
        // Remove marker
        const newMarkers = markers.filter((_, index) => index !== i);
        onMarkersChange(newMarkers);
        return;
      }
    }

    // Add new marker
    const newMarkers = [
      ...markers,
      { x: normalizedX, y: normalizedY },
    ];
    onMarkersChange(newMarkers);
  };

  const [isClearing, setIsClearing] = useState(false);

  const handleClearMarkers = () => setIsClearing(true);

  return (
    <div className="damage-marker-widget">
      {isClearing && (
        <ConfirmDialog
          title="Clear all damage markers?"
          message={`All ${markers.length} marker${markers.length === 1 ? '' : 's'} `
            + 'will be removed from the diagram.'}
          confirmLabel="Clear all"
          danger
          onConfirm={() => { onMarkersChange([]); setIsClearing(false); }}
          onCancel={() => setIsClearing(false)}
        />
      )}
      <div
        className="damage-canvas"
        ref={containerRef}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchRef.current = null; }}
      >
        {/* Car diagram image with EXACT aspect ratio */}
        <div style={{ position: 'relative', width: '100%' }}>
          <img
            ref={imageRef}
            src="/car_diagram.png"
            alt="Vehicle Diagram"
            className="car-diagram"
            onLoad={handleImageLoad}
            draggable={false}
          />

          {/* Render damage markers */}
          {imageLoaded && markers.map((marker, index) => {
            return (
              <div
                key={index}
                className="damage-marker"
                style={{
                  left: `${marker.x * 100}%`,
                  top: `${marker.y * 100}%`,
                }}
              >
                <div className="marker-circle">
                  {index + 1}
                </div>
              </div>
            );
          })}
        </div>

        {!imageLoaded && (
          <div className="loading-placeholder">
            Loading car diagram...
          </div>
        )}
      </div>

      <div className="damage-controls">
        <span className="marker-count">Damage markers: {markers.length}</span>
        <button
          type="button"
          className="clear-markers-btn"
          onClick={handleClearMarkers}
          disabled={markers.length === 0}
        >
          Clear All Markers
        </button>
      </div>
    </div>
  );
};

export default DamageMarker;