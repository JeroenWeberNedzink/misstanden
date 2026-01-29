/**
 * LanguageSelect Component
 * Dropdown for language selection with flag icons
 * Supports: Dutch, English, French, German
 */

import React from 'react';
import { cn } from '../../utils/cn';

const LANGUAGE_OPTIONS = [
  {
    value: 'nl',
    label: 'Nederlands',
    nativeLabel: 'Nederlands',
    englishLabel: 'Dutch',
    flag: '🇳🇱',
  },
  {
    value: 'en',
    label: 'English',
    nativeLabel: 'English',
    englishLabel: 'English',
    flag: '🇬🇧',
  },
  {
    value: 'fr',
    label: 'Français',
    nativeLabel: 'Français',
    englishLabel: 'French',
    flag: '🇫🇷',
  },
  {
    value: 'de',
    label: 'Deutsch',
    nativeLabel: 'Deutsch',
    englishLabel: 'German',
    flag: '🇩🇪',
  },
];

const LanguageSelect = React.forwardRef(({
  value = 'nl',
  onChange,
  label = 'Language',
  description = 'Select your preferred language',
  error,
  disabled = false,
  required = false,
  id,
  name,
  className,
  showNativeAndEnglish = true,
  ...props
}, ref) => {
  const selectId = id || `language-select-${Math.random().toString(36).substr(2, 9)}`;

  const selectedOption = LANGUAGE_OPTIONS.find(opt => opt.value === value) || LANGUAGE_OPTIONS[0];

  const handleChange = (e) => {
    onChange?.(e.target.value);
  };

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className={cn(
            'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block',
            error ? 'text-destructive' : 'text-foreground'
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          name={name}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-white text-black px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none',
            error && 'border-destructive focus:ring-destructive'
          )}
          {...props}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.flag} {option.nativeLabel}
              {showNativeAndEnglish && option.value !== 'en' && ` (${option.englishLabel})`}
            </option>
          ))}
        </select>

        {/* Custom styled display overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center px-3">
          <span className="text-2xl mr-2">{selectedOption.flag}</span>
          <span className="text-sm">
            {selectedOption.nativeLabel}
            {showNativeAndEnglish && selectedOption.value !== 'en' && (
              <span className="text-muted-foreground ml-1">({selectedOption.englishLabel})</span>
            )}
          </span>
        </div>

        {/* Dropdown chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
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
    </div>
  );
});

LanguageSelect.displayName = 'LanguageSelect';

export default LanguageSelect;
export { LANGUAGE_OPTIONS };
