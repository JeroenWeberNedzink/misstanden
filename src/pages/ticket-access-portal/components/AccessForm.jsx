import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';


const AccessForm = ({ onSubmit, isLoading }) => {
  const { t } = useTranslation();
  const [ticketNumber, setTicketNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [errors, setErrors] = useState({});

  // Pre-fill form if credentials are in sessionStorage (from confirmation page)
  useEffect(() => {
    const prefilledTicketId = sessionStorage.getItem('prefill_ticket_id');
    const prefilledAccessCode = sessionStorage.getItem('prefill_access_code');

    if (prefilledTicketId) {
      setTicketNumber(prefilledTicketId);
      sessionStorage.removeItem('prefill_ticket_id');
    }

    if (prefilledAccessCode) {
      setAccessCode(prefilledAccessCode);
      sessionStorage.removeItem('prefill_access_code');
    }
  }, []);

  const validateForm = () => {
    const newErrors = {};

    if (!ticketNumber?.trim()) {
      newErrors.ticketNumber = t('ticketAccess.requiredField', {
        field: t('ticketAccess.ticketId'),
        defaultValue: '{{field}} is required'
      });
    } else if (!/^[A-Z]{2,4}-\d{4}-\d{6}$/?.test(ticketNumber?.trim())) {
      newErrors.ticketNumber = t('ticketAccess.invalidFormat');
    }

    if (!accessCode?.trim()) {
      newErrors.accessCode = t('ticketAccess.requiredField', {
        field: t('ticketAccess.accessCode'),
        defaultValue: '{{field}} is required'
      });
    } else if (!/^\d{6}$/?.test(accessCode?.trim())) {
      newErrors.accessCode = t('ticketAccess.mustBeSixDigits');
    }

    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (validateForm()) {
      onSubmit({ ticketNumber: ticketNumber?.trim(), accessCode: accessCode?.trim() });
    }
  };

  const handleTicketNumberChange = (e) => {
    const value = e?.target?.value?.toUpperCase();
    setTicketNumber(value);
    if (errors?.ticketNumber) {
      setErrors(prev => ({ ...prev, ticketNumber: '' }));
    }
  };

  const handleAccessCodeChange = (e) => {
    const value = e?.target?.value?.replace(/\D/g, '')?.slice(0, 6);
    setAccessCode(value);
    if (errors?.accessCode) {
      setErrors(prev => ({ ...prev, accessCode: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
      <Input
        label={t('ticketAccess.ticketId')}
        type="text"
        placeholder={t('ticketAccess.ticketIdPlaceholder')}
        value={ticketNumber}
        onChange={handleTicketNumberChange}
        error={errors?.ticketNumber}
        required
        disabled={isLoading}
        description={t('ticketAccess.ticketIdDescription')}
        className="w-full"
      />
      <Input
        label={t('ticketAccess.accessCode')}
        type="password"
        placeholder="******"
        value={accessCode}
        onChange={handleAccessCodeChange}
        error={errors?.accessCode}
        required
        disabled={isLoading}
        description={t('ticketAccess.accessCodeDescription')}
        maxLength={6}
        className="w-full"
      />
      <Button
        type="submit"
        variant="default"
        fullWidth
        loading={isLoading}
        iconName="LogIn"
        iconPosition="right"
        className="mt-6 md:mt-8"
      >
        {t('ticketAccess.viewStatus')}
      </Button>
    </form>
  );
};

export default AccessForm;
