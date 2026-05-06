import React from 'react';
import Icon from '../../../components/AppIcon';
import { Checkbox } from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';

const NotificationPreferencesPanel = ({ notifications, setNotifications, contactInfo }) => {
  const severityOptions = [
    { value: 'critical', label: 'Kritiek', color: 'destructive' },
    { value: 'high', label: 'Hoog', color: 'warning' },
    { value: 'medium', label: 'Gemiddeld', color: 'primary' },
    { value: 'low', label: 'Laag', color: 'muted' }
  ];

  const hasPhone = contactInfo?.phone && contactInfo?.phone?.length > 0;
  const hasEmail = contactInfo?.email && contactInfo?.email?.length > 0;

  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Bell" size={20} color="var(--color-primary)" />
        <h2 className="text-xl font-semibold text-foreground">Notificatie-instellingen</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Configureer welke meldingen u wilt ontvangen en via welke kanalen (SMS/Email).
      </p>

      <div className="space-y-6">
        {/* Alert Types */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-3">Meldingstypen</h3>
          <div className="space-y-3">
            <Checkbox
              label="Nieuwe Toewijzingen"
              description="Ontvang een melding wanneer een nieuwe misstand aan u wordt toegewezen"
              checked={notifications?.notifyNewAssignments ?? true}
              onChange={(e) => setNotifications({ ...notifications, notifyNewAssignments: e?.target?.checked })}
            />
            <Checkbox
              label="Status Updates"
              description="Ontvang meldingen bij statuswijzigingen van uw toegewezen misstanden"
              checked={notifications?.notifyStatusUpdates ?? true}
              onChange={(e) => setNotifications({ ...notifications, notifyStatusUpdates: e?.target?.checked })}
            />
            <Checkbox
              label="Escalaties"
              description="Ontvang meldingen wanneer een misstand wordt geëscaleerd"
              checked={notifications?.notifyEscalations ?? true}
              onChange={(e) => setNotifications({ ...notifications, notifyEscalations: e?.target?.checked })}
            />
            <Checkbox
              label="Deadline Herinneringen"
              description="Ontvang herinneringen voor naderende deadlines"
              checked={notifications?.notifyDeadlineReminders ?? true}
              onChange={(e) => setNotifications({ ...notifications, notifyDeadlineReminders: e?.target?.checked })}
            />
            <Checkbox
              label="Opmerkingen"
              description="Ontvang meldingen bij nieuwe opmerkingen op uw misstanden"
              checked={notifications?.notifyComments ?? false}
              onChange={(e) => setNotifications({ ...notifications, notifyComments: e?.target?.checked })}
            />
          </div>
        </div>

        {/* Severity Threshold */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-3">Ernst Drempel</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Selecteer de minimale ernst voor directe meldingen:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {severityOptions?.map((option) => (
              <button
                key={option?.value}
                onClick={() => setNotifications({ ...notifications, minSeverityImmediate: option?.value })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  notifications?.minSeverityImmediate === option?.value
                    ? 'border-primary bg-primary/10' :'border-border bg-card hover:border-primary/50'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${option?.color}`} />
                  <span className="text-sm font-medium text-foreground">{option?.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Daily Digest */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <Checkbox
            label="Dagelijkse Samenvatting"
            description="Ontvang een dagelijkse samenvatting van misstanden onder de ernst drempel"
            checked={notifications?.dailyDigestEnabled ?? false}
            onChange={(e) => setNotifications({ ...notifications, dailyDigestEnabled: e?.target?.checked })}
          />
        </div>

        {/* Communication Channels */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-3">Communicatiekanalen</h3>
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-card border border-border">
              <Checkbox
                label="E-mail Notificaties"
                description={hasEmail ? `Meldingen worden verzonden naar ${contactInfo?.email}` : 'Voer eerst een e-mailadres in'}
                checked={notifications?.emailEnabled ?? true}
                onChange={(e) => setNotifications({ ...notifications, emailEnabled: e?.target?.checked })}
                disabled={!hasEmail}
              />
              {!hasEmail && (
                <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <Icon name="AlertTriangle" size={16} color="var(--color-warning)" className="mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-warning">
                    Voer een e-mailadres in bij Contactinformatie om e-mailnotificaties te ontvangen
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-card border border-border relative">
              <Checkbox
                label={
                  <span className="flex items-center gap-2">
                    SMS Notificaties (Twilio)
                    <span className="px-2 py-0.5 text-xs bg-warning/20 text-warning rounded-full">
                      Binnenkort
                    </span>
                  </span>
                }
                description="SMS-notificaties worden binnenkort beschikbaar gesteld na Twilio configuratie"
                checked={false}
                onChange={() => {}}
                disabled={true}
              />
              <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Icon name="Info" size={16} color="var(--color-primary)" className="mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  SMS-functionaliteit is momenteel in onderhoud. Neem contact op met de systeembeheerder voor meer informatie.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div>
          <h3 className="text-base font-semibold text-foreground mb-3">Geavanceerde Instellingen</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Stille Uren Start"
                type="time"
                value={notifications?.quietHoursStart || ''}
                onChange={(e) => setNotifications({ ...notifications, quietHoursStart: e?.target?.value })}
                description="Geen meldingen tijdens stille uren"
              />
              <Input
                label="Stille Uren Einde"
                type="time"
                value={notifications?.quietHoursEnd || ''}
                onChange={(e) => setNotifications({ ...notifications, quietHoursEnd: e?.target?.value })}
                description="Einde van stille uren periode"
              />
            </div>

            <Checkbox
              label="Weekend Notificaties"
              description="Ontvang meldingen tijdens het weekend (zaterdag en zondag)"
              checked={notifications?.weekendNotifications ?? false}
              onChange={(e) => setNotifications({ ...notifications, weekendNotifications: e?.target?.checked })}
            />

            <Input
              label="Noodcontact Telefoonnummer (Optioneel)"
              type="tel"
              placeholder="+31612345678"
              value={notifications?.emergencyContactPhone || ''}
              onChange={(e) => setNotifications({ ...notifications, emergencyContactPhone: e?.target?.value })}
              description="Alternatief nummer voor kritieke misstanden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationPreferencesPanel;
