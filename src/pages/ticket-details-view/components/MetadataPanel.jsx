import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const MetadataPanel = ({ metadata = {} }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract metadata with defaults
  const {
    screenResolution = null,
    viewportSize = null,
    userAgent = null,
    browser = null,
    os = null,
    timezone = null,
    languages = [],
    submittedAt = null,
    ipAddress = null,
    deviceType = null,
    colorDepth = null,
    referrer = null
  } = metadata;

  // Parse user agent for better display
  const getBrowserInfo = () => {
    if (browser) return browser;
    if (!userAgent) return 'Onbekend';

    // Simple parsing (in production, use a library like ua-parser-js)
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Onbekend';
  };

  const getOSInfo = () => {
    if (os) return os;
    if (!userAgent) return 'Onbekend';

    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Onbekend';
  };

  const getDeviceIcon = () => {
    const device = deviceType?.toLowerCase() || '';
    if (device.includes('mobile') || device.includes('phone')) return 'Smartphone';
    if (device.includes('tablet')) return 'Tablet';
    return 'Monitor';
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatLanguages = (langs) => {
    if (!langs || langs.length === 0) return 'Niet beschikbaar';
    return langs.slice(0, 3).join(', ');
  };

  const metadataItems = [
    {
      icon: getDeviceIcon(),
      label: 'Apparaat',
      value: deviceType || 'Desktop',
      show: true
    },
    {
      icon: 'Monitor',
      label: 'Schermresolutie',
      value: screenResolution || 'Niet beschikbaar',
      show: !!screenResolution
    },
    {
      icon: 'Maximize2',
      label: 'Viewport',
      value: viewportSize || 'Niet beschikbaar',
      show: !!viewportSize
    },
    {
      icon: 'Globe',
      label: 'Browser',
      value: getBrowserInfo(),
      show: true
    },
    {
      icon: 'Cpu',
      label: 'Besturingssysteem',
      value: getOSInfo(),
      show: true
    },
    {
      icon: 'Clock',
      label: 'Tijdzone',
      value: timezone || 'Niet beschikbaar',
      show: !!timezone
    },
    {
      icon: 'Languages',
      label: 'Talen',
      value: formatLanguages(languages),
      show: languages && languages.length > 0
    },
    {
      icon: 'Calendar',
      label: 'Ingediend op',
      value: formatDate(submittedAt),
      show: !!submittedAt
    },
    {
      icon: 'Palette',
      label: 'Kleurdiepte',
      value: colorDepth ? `${colorDepth}-bit` : 'Niet beschikbaar',
      show: !!colorDepth
    }
  ].filter(item => item.show);

  // Don't render if no metadata
  if (metadataItems.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <Icon name="Info" size={20} className="text-muted-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-semibold text-foreground">
              Technische Informatie
            </h3>
            <p className="text-xs text-muted-foreground">
              {isExpanded ? 'Klik om te verbergen' : 'Klik om te bekijken'}
            </p>
          </div>
        </div>
        <Icon
          name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
          size={20}
          className="text-muted-foreground transition-transform"
        />
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {metadataItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/20 transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                  <Icon
                    name={item.icon}
                    size={16}
                    className="text-primary"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">
                    {item.label}
                  </p>
                  <p className="text-sm text-foreground truncate" title={item.value}>
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* User Agent - Full Display */}
          {userAgent && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start gap-2">
                <Icon name="Code" size={14} className="text-muted-foreground mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    User Agent
                  </p>
                  <p className="text-xs text-foreground font-mono break-all">
                    {userAgent}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border">
            <div className="flex items-start gap-2">
              <Icon name="Lock" size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deze technische informatie wordt automatisch verzameld om ons te helpen uw melding beter te begrijpen en eventuele technische problemen te diagnosticeren. Uw privacy wordt beschermd.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetadataPanel;
