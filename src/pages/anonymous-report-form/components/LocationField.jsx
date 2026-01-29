import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';
import { locationService } from '../../../services/locationService';

const LocationField = ({ value, onChange, error, rulesByCountry = null }) => {
  const { t } = useTranslation();

  // ---- helpers ----
  const parseLocation = (locationString) => {
    if (!locationString) return { country: '', specificLocation: '' };

    // split only on first ":"
    const idx = String(locationString).indexOf(':');
    if (idx === -1) {
      // if no colon, we treat it as "specific location" unless it matches a country code
      const v = String(locationString).trim();
      if (/^[A-Z]{2}$/.test(v)) return { country: v, specificLocation: '' };
      return { country: '', specificLocation: v };
    }

    const c = String(locationString.slice(0, idx)).trim();
    const rest = String(locationString.slice(idx + 1)).trim(); // after ':'
    return { country: c, specificLocation: rest };
  };

  const buildLocationString = (country, specific) => {
    const c = String(country || '').trim();
    const s = String(specific || '').trim();

    if (c && s) return `${c}: ${s}`;
    if (c) return c;
    return s; // allow “custom only”
  };

  // Select components differ: sometimes we get event, value string, or option object
  const coerceSelectValue = (v) => {
    if (!v) return '';
    // DOM event
    if (v?.target?.value !== undefined) return v.target.value;
    // react-select style option
    if (typeof v === 'object' && v?.value !== undefined) return v.value;
    // direct value
    return String(v);
  };

  // ---- state ----
  const [country, setCountry] = useState('');
  const [specificLocation, setSpecificLocation] = useState('');
  const [countries, setCountries] = useState([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);

  // Load countries from database
  useEffect(() => {
    const loadCountries = async () => {
      try {
        setIsLoadingCountries(true);
        const locations = await locationService.getLocations({ activeOnly: true });
        // Transform to match expected format
        const formatted = locations.map(loc => ({
          code: loc.country_code,
          name: loc.country_name
        }));
        setCountries(formatted);
      } catch (error) {
        console.error('Error loading countries:', error);
        // Fallback to default countries if database fails
        setCountries([
          { code: 'NL', name: 'Nederland' },
          { code: 'BE', name: 'België' },
          { code: 'FR', name: 'Frankrijk' },
          { code: 'DE', name: 'Duitsland' },
        ]);
      } finally {
        setIsLoadingCountries(false);
      }
    };

    loadCountries();
  }, []);

  // keep local state in sync with parent value
  useEffect(() => {
    const parsed = parseLocation(value);
    setCountry(parsed.country || '');
    setSpecificLocation(parsed.specificLocation || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // optional: show rule hint when country is chosen (for whistleblower rules)
  const countryRuleHint = useMemo(() => {
    const c = String(country || '').trim();
    if (!c) return '';
    if (!rulesByCountry) return '';
    return rulesByCountry?.[c] || '';
  }, [country, rulesByCountry]);

  // ---- handlers ----
  const handleCountryChange = (incoming) => {
    const newCountry = coerceSelectValue(incoming);
    setCountry(newCountry);

    // do NOT wipe custom info; keep it
    onChange?.(buildLocationString(newCountry, specificLocation));
  };

  const handleSpecificLocationChange = (incoming) => {
    const newSpecific = typeof incoming?.target?.value === 'string' ? incoming.target.value : String(incoming ?? '');
    setSpecificLocation(newSpecific);

    // keep country selection
    onChange?.(buildLocationString(country, newSpecific));
  };

  const isCountryMissing = !!error && !String(country || '').trim();
  const isSpecificMissing = !!error && !String(specificLocation || '').trim();

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <Select
          label={t('reportForm.country')}
          value={country}
          // IMPORTANT: pass value directly, not e.target.value only
          onChange={handleCountryChange}
          options={[
            { value: '', label: isLoadingCountries ? t('reportForm.loadingCountries') : t('reportForm.selectCountry') },
            ...countries.map((c) => ({ value: c.code, label: c.name })),
          ]}
          required
          disabled={isLoadingCountries}
          error={isCountryMissing ? t('reportForm.countryRequired') : ''}
        />

        <Input
          type="text"
          label={t('reportForm.specificLocation')}
          placeholder={t('reportForm.locationPlaceholder')}
          value={specificLocation}
          onChange={handleSpecificLocationChange}
          // Keep it editable always, even if country is selected
          description={
            countryRuleHint
              ? `${t('reportForm.locationDescription')} • ${countryRuleHint}`
              : t('reportForm.locationDescription')
          }
          required
          error={isSpecificMissing ? t('reportForm.specificLocationRequired') : ''}
        />

        {/* Small preview of stored value (optional, can remove) */}
        <div className="text-[11px] text-muted-foreground">
          {t('reportForm.savedAs')}: <span className="font-mono">{buildLocationString(country, specificLocation) || '—'}</span>
        </div>
      </div>
    </div>
  );
};

export default LocationField;