import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';

const ContactInfoPanel = ({ contactInfo, setContactInfo }) => {
  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Phone" size={20} color="var(--color-primary)" />
        <h2 className="text-xl font-semibold text-foreground">Contactinformatie</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Beheer uw contactgegevens voor SMS-notificaties (Twilio) en e-mailcommunicatie.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Telefoonnummer"
          type="tel"
          placeholder="+31612345678"
          value={contactInfo?.phone || ''}
          onChange={(e) => setContactInfo({ ...contactInfo, phone: e?.target?.value })}
          description="Internationaal formaat voor SMS-notificaties via Twilio"
        />
        <Input
          label="E-mailadres"
          type="email"
          placeholder="handler@example.com"
          value={contactInfo?.email || ''}
          onChange={(e) => setContactInfo({ ...contactInfo, email: e?.target?.value })}
          description="E-mailadres voor e-mail notificaties"
        />
      </div>
    </div>
  );
};

export default ContactInfoPanel;