import React from 'react';
import './YesNoToggle.css';

const OPTIONS = ['Yes', 'No'];

/**
 * YesNoToggle
 *
 * Two buttons in place of a text box for a yes or no answer. One tap rather
 * than typing on a phone keyboard, and the agreement prints the same word
 * every time instead of whatever casing the keyboard produced.
 *
 * Tapping the chosen answer again clears it. Blank is a real answer here:
 * the agreement then prints nothing beside the label, to be filled in by hand.
 *
 * An answer typed before these were buttons that is not plainly a yes or no
 * is kept and shown underneath rather than hidden, so nothing goes onto the
 * agreement that the person producing it cannot see.
 */
const YesNoToggle = ({ name, labelId, value, onChange }) => {
  const current = value || '';
  const unrecognised = current !== '' && !OPTIONS.includes(current);

  return (
    <>
      <div className="yes-no" role="group" aria-labelledby={labelId}>
        {OPTIONS.map((option) => {
          const selected = current === option;
          return (
            <button
              key={option}
              type="button"
              className={`yes-no-option${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onChange(name, selected ? '' : option)}
            >
              {/* Not colour alone: the tick marks the choice for anyone who
                  cannot tell the green apart. */}
              {selected && <span className="yes-no-tick" aria-hidden="true">✓</span>}
              {option}
            </button>
          );
        })}
      </div>
      {unrecognised && (
        <p className="field-hint">
          Recorded as “{current}”. Tap Yes or No to replace it.
        </p>
      )}
    </>
  );
};

export default YesNoToggle;
