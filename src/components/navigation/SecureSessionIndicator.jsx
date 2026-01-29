import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';

const SecureSessionIndicator = ({ className = '' }) => {
  const [sessionStatus, setSessionStatus] = useState('active');
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    checkSessionStatus();
    const interval = setInterval(checkSessionStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkSessionStatus = () => {
    try {
      const sessionStart = sessionStorage.getItem('session_start');
      const sessionTimeout = 30 * 60 * 1000;
      
      if (sessionStart) {
        const elapsed = Date.now() - parseInt(sessionStart);
        const remaining = sessionTimeout - elapsed;
        
        if (remaining <= 0) {
          setSessionStatus('expired');
          setTimeRemaining(0);
        } else if (remaining <= 5 * 60 * 1000) {
          setSessionStatus('warning');
          setTimeRemaining(Math.floor(remaining / 60000));
        } else {
          setSessionStatus('active');
          setTimeRemaining(Math.floor(remaining / 60000));
        }
      } else {
        sessionStorage.setItem('session_start', Date.now()?.toString());
        setSessionStatus('active');
        setTimeRemaining(30);
      }
    } catch (error) {
      console.error('Session check failed:', error);
      setSessionStatus('active');
    }
  };

  const getStatusConfig = () => {
    switch (sessionStatus) {
      case 'warning':
        return {
          icon: 'AlertTriangle',
          color: 'var(--color-warning)',
          text: `Sessie verloopt over ${timeRemaining} min`,
          className: 'warning'
        };
      case 'expired':
        return {
          icon: 'XCircle',
          color: 'var(--color-error)',
          text: 'Sessie verlopen',
          className: 'error'
        };
      default:
        return {
          icon: 'Shield',
          color: 'var(--color-success)',
          text: 'Beveiligde sessie actief',
          className: 'active'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`secure-session-indicator ${config?.className} ${className}`}>
      <Icon name={config?.icon} size={16} color={config?.color} />
      <span className="text-sm font-medium">{config?.text}</span>
    </div>
  );
};

export default SecureSessionIndicator;