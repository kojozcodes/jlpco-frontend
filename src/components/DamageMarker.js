import React, { useRef, useState} from 'react';
import './DamageMarker.css';

/**
 * DamageMarker Component
 * FIX #3: Car diagram loads correctly and markers appear exactly where tapped
 * - Maintains exact PDF aspect ratio (420:250 = 1.68)
 * - Normalized coordinates (0-1) for accurate PDF placement
 * - Touch-optimized for mobile
 */
const DamageMarker = ({ markers, onMarkersChange }) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
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

  const handleClearMarkers = () => {
    if (window.confirm('Clear all damage markers?')) {
      onMarkersChange([]);
    }
  };

  return (
    <div className="damage-marker-widget">
      <div
        className="damage-canvas"
        ref={containerRef}
        onClick={handleCanvasClick}
        onTouchEnd={(e) => {
          e.preventDefault();
          handleCanvasClick(e);
        }}
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