import React, { useRef, useState, useEffect } from 'react';
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
  const [imageRect, setImageRect] = useState(null);

  // EXACT PDF dimensions from your template
  const PDF_ASPECT_RATIO = 420 / 250; // 1.68

  useEffect(() => {
    const updateImageRect = () => {
      if (imageRef.current && imageLoaded) {
        const rect = imageRef.current.getBoundingClientRect();
        setImageRect({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateImageRect();
    window.addEventListener('resize', updateImageRect);
    window.addEventListener('scroll', updateImageRect);

    return () => {
      window.removeEventListener('resize', updateImageRect);
      window.removeEventListener('scroll', updateImageRect);
    };
  }, [imageLoaded]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleCanvasClick = (e) => {
    if (!imageRect) return;

    // Get click/touch position
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Convert to normalized coordinates (0-1) relative to image
    const relativeX = clientX - imageRect.x;
    const relativeY = clientY - imageRect.y;

    // Check if click is within image bounds
    if (
      relativeX < 0 ||
      relativeX > imageRect.width ||
      relativeY < 0 ||
      relativeY > imageRect.height
    ) {
      return;
    }

    const normalizedX = relativeX / imageRect.width;
    const normalizedY = relativeY / imageRect.height;

    // Check if clicking on existing marker to remove it
    const markerRadius = 12; // Match desktop app
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const markerScreenX = imageRect.x + marker.x * imageRect.width;
      const markerScreenY = imageRect.y + marker.y * imageRect.height;

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
        onTouchStart={handleCanvasClick}
      >
        {/* Car diagram image with EXACT aspect ratio */}
        <img
          ref={imageRef}
          src="/car_diagram.png"
          alt="Vehicle Diagram"
          className="car-diagram"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Render damage markers */}
        {imageLoaded && imageRect && markers.map((marker, index) => {
          const screenX = imageRect.x + marker.x * imageRect.width;
          const screenY = imageRect.y + marker.y * imageRect.height;

          return (
            <div
              key={index}
              className="damage-marker"
              style={{
                left: `${screenX}px`,
                top: `${screenY}px`,
              }}
            >
              <div className="marker-circle">
                {index + 1}
              </div>
            </div>
          );
        })}

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