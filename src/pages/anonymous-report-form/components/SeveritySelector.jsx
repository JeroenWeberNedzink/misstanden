import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const SeveritySelector = ({ value, onChange, severities, error }) => {
  const { t } = useTranslation();
  const getSeverityConfig = (code) => {
    switch (code) {
      case 'critical':
        return {
          name: 'AlertTriangle',
          color: '#DC2626',
          bgColor: 'rgba(220, 38, 38, 0.1)',
          borderColor: '#DC2626'
        };
      case 'high':
        return {
          name: 'AlertCircle',
          color: '#F59E0B',
          bgColor: 'rgba(245, 158, 11, 0.1)',
          borderColor: '#F59E0B'
        };
      case 'medium':
        return {
          name: 'Info',
          color: '#009ad8',
          bgColor: 'rgba(0, 154, 216, 0.1)',
          borderColor: '#009ad8'
        };
      case 'low':
        return {
          name: 'CheckCircle',
          color: '#10B981',
          bgColor: 'rgba(16, 185, 129, 0.1)',
          borderColor: '#10B981'
        };
      default:
        return {
          name: 'AlertCircle',
          color: '#4A5568',
          bgColor: 'rgba(74, 85, 104, 0.1)',
          borderColor: '#E2E8F0'
        };
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{t('reportForm.severity')}</h3>
        <p className="text-sm text-muted-foreground">{t('reportForm.severityHelp')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {severities?.map((severity) => {
          const config = getSeverityConfig(severity?.code);
          const isSelected = value === severity?.code;

          return (
            <button
              key={severity?.code}
              type="button"
              onClick={() => onChange(severity?.code)}
              className={`
                relative p-4 rounded-lg border-2 transition-all duration-200
                flex flex-col items-center gap-2 text-center
                hover:shadow-md cursor-pointer
                ${isSelected
                  ? 'shadow-lg transform scale-105'
                  : 'hover:transform hover:scale-102'
                }
              `}
              style={{
                backgroundColor: isSelected ? config.bgColor : 'transparent',
                borderColor: isSelected ? config.borderColor : 'var(--color-border)',
              }}
            >
              <Icon
                name={config.name}
                size={28}
                color={config.color}
              />
              <div>
                <div className="font-semibold text-sm" style={{ color: isSelected ? config.color : 'var(--color-foreground)' }}>
                  {severity?.label}
                </div>
              </div>
              {isSelected && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: config.color }}
                >
                  <Icon name="Check" size={14} color="#FFFFFF" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
};

export default SeveritySelector;