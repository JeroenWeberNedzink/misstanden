import React from 'react';
import Icon from '../../../components/AppIcon';


const ErrorAlert = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="bg-error/10 border border-error/20 rounded-lg p-4 md:p-5 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex-shrink-0">
        <Icon name="AlertCircle" size={20} color="var(--color-error)" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm md:text-base font-medium text-error mb-1">Toegang Geweigerd</h4>
        <p className="text-xs md:text-sm text-error/80">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-error/10 transition-smooth focus-ring"
          aria-label="Sluit melding"
        >
          <Icon name="X" size={18} color="var(--color-error)" />
        </button>
      )}
    </div>
  );
};

export default ErrorAlert;