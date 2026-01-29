/**
 * MultiSelect Component
 * Enhanced multi-selection component that displays selected items as chips/badges
 * Built on top of the existing Select component
 */

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCheck, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../utils/cn';
import Icon from '../AppIcon';

const MultiSelect = React.forwardRef(({
  className,
  options = [],
  value = [],
  placeholder = 'Select options',
  disabled = false,
  required = false,
  label,
  description,
  error,
  searchable = true,
  maxSelections,
  id,
  name,
  onChange,
  ...props
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Generate unique ID if not provided
  const selectId = id || `multiselect-${Math.random().toString(36).substr(2, 9)}`;

  // Filter options based on search
  const filteredOptions = searchable && searchTerm
    ? options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (option.value && option.value.toString().toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : options;

  // Get selected options for chip display
  const selectedOptions = options.filter(opt => value.includes(opt.value));

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (isOpen) {
        setSearchTerm('');
      }
    }
  };

  const handleOptionSelect = (option) => {
    const isSelected = value.includes(option.value);

    if (isSelected) {
      // Deselect
      onChange(value.filter(v => v !== option.value));
    } else {
      // Select (check max selections)
      if (!maxSelections || value.length < maxSelections) {
        onChange([...value, option.value]);
      }
    }
  };

  const handleRemoveChip = (optionValue, e) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== optionValue));
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const isSelected = (optionValue) => value.includes(optionValue);

  const hasValue = value.length > 0;
  const isMaxReached = maxSelections && value.length >= maxSelections;

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
        {/* Trigger Button */}
        <button
          ref={ref}
          id={selectId}
          type="button"
          className={cn(
            'flex min-h-[40px] w-full items-center justify-between rounded-md border border-input bg-white text-black px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus:ring-destructive'
          )}
          onClick={handleToggle}
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          {...props}
        >
          <div className="flex flex-wrap gap-1 flex-1 mr-2">
            {hasValue ? (
              selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                >
                  {option.icon && (
                    <Icon name={option.icon} size={12} />
                  )}
                  <span>{option.label}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveChip(option.value, e)}
                    className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                  >
                    <FontAwesomeIcon icon={faTimes} style={{ width: '10px', height: '10px' }} />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {hasValue && (
              <button
                type="button"
                onClick={handleClearAll}
                className="hover:bg-accent rounded-full p-1 transition-colors"
                title="Clear all"
              >
                <FontAwesomeIcon icon={faTimes} style={{ width: '12px', height: '12px' }} />
              </button>
            )}

            <FontAwesomeIcon
              icon={faChevronDown}
              className={cn('transition-transform', isOpen && 'rotate-180')}
              style={{ width: '16px', height: '16px' }}
            />
          </div>
        </button>

        {/* Hidden native select for form submission */}
        <select
          name={name}
          value={value}
          onChange={() => {}} // Controlled by our custom logic
          className="sr-only"
          tabIndex={-1}
          multiple
          required={required}
        >
          <option value="">Select...</option>
          {options.map((option, index) => (
            <option key={option.value ?? `option-${index}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-[9999] w-full mt-1 bg-white text-black border border-border rounded-md shadow-md">
            {searchable && (
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <FontAwesomeIcon
                    icon={faSearch}
                    className="absolute left-2 top-2.5 text-muted-foreground"
                    style={{ width: '16px', height: '16px' }}
                  />
                  <input
                    type="text"
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}

            {isMaxReached && (
              <div className="px-3 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-200">
                Maximum {maxSelections} selections reached
              </div>
            )}

            <div className="py-1 max-h-60 overflow-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {searchTerm ? 'No options found' : 'No options available'}
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const selected = isSelected(option.value);
                  const canSelect = !isMaxReached || selected;

                  return (
                    <div
                      key={option.value ?? `dropdown-option-${index}`}
                      className={cn(
                        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none transition-colors',
                        selected
                          ? 'bg-primary/10 text-primary font-medium'
                          : canSelect
                          ? 'hover:bg-accent hover:text-accent-foreground'
                          : 'opacity-50 cursor-not-allowed',
                        option.disabled && 'pointer-events-none opacity-50'
                      )}
                      onClick={() => !option.disabled && canSelect && handleOptionSelect(option)}
                    >
                      {/* Checkbox indicator */}
                      <div
                        className={cn(
                          'w-4 h-4 border rounded flex items-center justify-center flex-shrink-0',
                          selected
                            ? 'bg-primary border-primary text-white'
                            : 'border-input bg-white'
                        )}
                      >
                        {selected && (
                          <FontAwesomeIcon icon={faCheck} style={{ width: '10px', height: '10px' }} />
                        )}
                      </div>

                      {/* Icon */}
                      {option.icon && (
                        <Icon name={option.icon} size={16} className="flex-shrink-0" />
                      )}

                      {/* Label */}
                      <span className="flex-1">{option.label}</span>

                      {/* Description */}
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Click outside to close */}
        {isOpen && (
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
        )}
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

MultiSelect.displayName = 'MultiSelect';

export default MultiSelect;
