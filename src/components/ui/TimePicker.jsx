/**
 * TimePicker Component
 * Simple time picker for HH:MM format (24-hour)
 * Used for settings like notification digest time
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../utils/cn';

const TimePicker = React.forwardRef(({
  className,
  value = '09:00',
  onChange,
  disabled = false,
  required = false,
  label,
  description,
  error,
  id,
  name,
  ...props
}, ref) => {
  // Parse the HH:MM string
  const [hours, minutes] = (value || '09:00').split(':').map(Number);
  const [localHours, setLocalHours] = useState(hours || 9);
  const [localMinutes, setLocalMinutes] = useState(minutes || 0);

  // Generate unique ID if not provided
  const pickerId = id || `timepicker-${Math.random().toString(36).substr(2, 9)}`;

  // Sync with parent value
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':').map(Number);
      setLocalHours(h || 0);
      setLocalMinutes(m || 0);
    }
  }, [value]);

  // Update parent when local state changes
  const updateValue = (newHours, newMinutes) => {
    const formattedTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
    onChange?.(formattedTime);
  };

  const handleHoursChange = (e) => {
    let newHours = parseInt(e.target.value, 10);

    // Validate hours (0-23)
    if (isNaN(newHours)) newHours = 0;
    if (newHours < 0) newHours = 0;
    if (newHours > 23) newHours = 23;

    setLocalHours(newHours);
    updateValue(newHours, localMinutes);
  };

  const handleMinutesChange = (e) => {
    let newMinutes = parseInt(e.target.value, 10);

    // Validate minutes (0-59)
    if (isNaN(newMinutes)) newMinutes = 0;
    if (newMinutes < 0) newMinutes = 0;
    if (newMinutes > 59) newMinutes = 59;

    setLocalMinutes(newMinutes);
    updateValue(localHours, newMinutes);
  };

  const handleHoursBlur = (e) => {
    // Ensure two digits on blur
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setLocalHours(value);
    }
  };

  const handleMinutesBlur = (e) => {
    // Ensure two digits on blur
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setLocalMinutes(value);
    }
  };

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label
          htmlFor={pickerId}
          className={cn(
            'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block',
            error ? 'text-destructive' : 'text-foreground'
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <div className="relative flex items-center gap-2">
        {/* Hours input */}
        <div className="relative flex-1">
          <input
            ref={ref}
            id={pickerId}
            type="number"
            min="0"
            max="23"
            value={localHours}
            onChange={handleHoursChange}
            onBlur={handleHoursBlur}
            disabled={disabled}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-white text-black px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-center',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
            placeholder="HH"
            {...props}
          />
          <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">H</span>
        </div>

        {/* Colon separator */}
        <span className="text-lg font-medium text-muted-foreground">:</span>

        {/* Minutes input */}
        <div className="relative flex-1">
          <input
            type="number"
            min="0"
            max="59"
            value={localMinutes}
            onChange={handleMinutesChange}
            onBlur={handleMinutesBlur}
            disabled={disabled}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-white text-black px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-center',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
            placeholder="MM"
          />
          <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">M</span>
        </div>

        {/* Clock icon */}
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-input rounded-md bg-muted/30">
          <FontAwesomeIcon icon={faClock} className="text-muted-foreground" style={{ width: '16px', height: '16px' }} />
        </div>

        {/* Hidden input for form submission */}
        <input
          type="hidden"
          name={name}
          value={`${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`}
        />
      </div>

      {description && !error && (
        <p className="text-sm text-muted-foreground mt-1">
          {description}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive mt-1">
          {error}
        </p>
      )}

      {/* Display current time */}
      <div className="mt-2 text-xs text-muted-foreground">
        Selected time: {String(localHours).padStart(2, '0')}:{String(localMinutes).padStart(2, '0')}
      </div>
    </div>
  );
});

TimePicker.displayName = 'TimePicker';

export default TimePicker;
