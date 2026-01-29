import React from 'react';
import Icon from '../../../components/AppIcon';

const SecurityBadge = ({ icon, text, variant = 'default' }) => {
  const variantStyles = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success',
    primary: 'bg-primary/10 text-primary'
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-lg ${variantStyles?.[variant]} transition-smooth`}>
      <Icon name={icon} size={16} className="flex-shrink-0" />
      <span className="text-xs md:text-sm font-medium">{text}</span>
    </div>
  );
};

export default SecurityBadge;