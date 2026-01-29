/**
 * TimezoneSelect Component
 * Searchable dropdown for timezone selection
 * Grouped by continent with UTC offset display
 */

import React from 'react';
import Select from './Select';

// Common timezones grouped by continent
const TIMEZONE_OPTIONS = [
  // Europe
  {
    label: 'Europe/Amsterdam (CET/CEST, UTC+1/+2)',
    value: 'Europe/Amsterdam',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/Brussels (CET/CEST, UTC+1/+2)',
    value: 'Europe/Brussels',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/London (GMT/BST, UTC+0/+1)',
    value: 'Europe/London',
    group: 'Europe',
    offset: '+0',
  },
  {
    label: 'Europe/Paris (CET/CEST, UTC+1/+2)',
    value: 'Europe/Paris',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/Berlin (CET/CEST, UTC+1/+2)',
    value: 'Europe/Berlin',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/Rome (CET/CEST, UTC+1/+2)',
    value: 'Europe/Rome',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/Madrid (CET/CEST, UTC+1/+2)',
    value: 'Europe/Madrid',
    group: 'Europe',
    offset: '+1',
  },
  {
    label: 'Europe/Lisbon (WET/WEST, UTC+0/+1)',
    value: 'Europe/Lisbon',
    group: 'Europe',
    offset: '+0',
  },
  {
    label: 'Europe/Moscow (MSK, UTC+3)',
    value: 'Europe/Moscow',
    group: 'Europe',
    offset: '+3',
  },
  {
    label: 'Europe/Athens (EET/EEST, UTC+2/+3)',
    value: 'Europe/Athens',
    group: 'Europe',
    offset: '+2',
  },

  // Americas
  {
    label: 'America/New_York (EST/EDT, UTC-5/-4)',
    value: 'America/New_York',
    group: 'Americas',
    offset: '-5',
  },
  {
    label: 'America/Chicago (CST/CDT, UTC-6/-5)',
    value: 'America/Chicago',
    group: 'Americas',
    offset: '-6',
  },
  {
    label: 'America/Denver (MST/MDT, UTC-7/-6)',
    value: 'America/Denver',
    group: 'Americas',
    offset: '-7',
  },
  {
    label: 'America/Los_Angeles (PST/PDT, UTC-8/-7)',
    value: 'America/Los_Angeles',
    group: 'Americas',
    offset: '-8',
  },
  {
    label: 'America/Toronto (EST/EDT, UTC-5/-4)',
    value: 'America/Toronto',
    group: 'Americas',
    offset: '-5',
  },
  {
    label: 'America/Mexico_City (CST/CDT, UTC-6/-5)',
    value: 'America/Mexico_City',
    group: 'Americas',
    offset: '-6',
  },
  {
    label: 'America/Sao_Paulo (BRT/BRST, UTC-3/-2)',
    value: 'America/Sao_Paulo',
    group: 'Americas',
    offset: '-3',
  },
  {
    label: 'America/Buenos_Aires (ART, UTC-3)',
    value: 'America/Buenos_Aires',
    group: 'Americas',
    offset: '-3',
  },

  // Asia
  {
    label: 'Asia/Tokyo (JST, UTC+9)',
    value: 'Asia/Tokyo',
    group: 'Asia',
    offset: '+9',
  },
  {
    label: 'Asia/Shanghai (CST, UTC+8)',
    value: 'Asia/Shanghai',
    group: 'Asia',
    offset: '+8',
  },
  {
    label: 'Asia/Hong_Kong (HKT, UTC+8)',
    value: 'Asia/Hong_Kong',
    group: 'Asia',
    offset: '+8',
  },
  {
    label: 'Asia/Singapore (SGT, UTC+8)',
    value: 'Asia/Singapore',
    group: 'Asia',
    offset: '+8',
  },
  {
    label: 'Asia/Dubai (GST, UTC+4)',
    value: 'Asia/Dubai',
    group: 'Asia',
    offset: '+4',
  },
  {
    label: 'Asia/Kolkata (IST, UTC+5:30)',
    value: 'Asia/Kolkata',
    group: 'Asia',
    offset: '+5:30',
  },
  {
    label: 'Asia/Bangkok (ICT, UTC+7)',
    value: 'Asia/Bangkok',
    group: 'Asia',
    offset: '+7',
  },

  // Pacific
  {
    label: 'Pacific/Auckland (NZST/NZDT, UTC+12/+13)',
    value: 'Pacific/Auckland',
    group: 'Pacific',
    offset: '+12',
  },
  {
    label: 'Pacific/Sydney (AEDT/AEST, UTC+10/+11)',
    value: 'Australia/Sydney',
    group: 'Pacific',
    offset: '+10',
  },
  {
    label: 'Pacific/Fiji (FJT, UTC+12)',
    value: 'Pacific/Fiji',
    group: 'Pacific',
    offset: '+12',
  },

  // Africa
  {
    label: 'Africa/Cairo (EET/EEST, UTC+2/+3)',
    value: 'Africa/Cairo',
    group: 'Africa',
    offset: '+2',
  },
  {
    label: 'Africa/Johannesburg (SAST, UTC+2)',
    value: 'Africa/Johannesburg',
    group: 'Africa',
    offset: '+2',
  },
  {
    label: 'Africa/Lagos (WAT, UTC+1)',
    value: 'Africa/Lagos',
    group: 'Africa',
    offset: '+1',
  },

  // UTC
  {
    label: 'UTC (Coordinated Universal Time)',
    value: 'UTC',
    group: 'UTC',
    offset: '+0',
  },
];

const TimezoneSelect = React.forwardRef(({
  value = 'Europe/Amsterdam',
  onChange,
  label = 'Timezone',
  description = 'Select your timezone for accurate timestamps',
  error,
  disabled = false,
  required = false,
  id,
  name,
  className,
  ...props
}, ref) => {
  return (
    <Select
      ref={ref}
      id={id}
      name={name}
      className={className}
      options={TIMEZONE_OPTIONS}
      value={value}
      onChange={onChange}
      label={label}
      description={description}
      error={error}
      disabled={disabled}
      required={required}
      searchable={true}
      clearable={false}
      placeholder="Select timezone"
      {...props}
    />
  );
});

TimezoneSelect.displayName = 'TimezoneSelect';

export default TimezoneSelect;
export { TIMEZONE_OPTIONS };
