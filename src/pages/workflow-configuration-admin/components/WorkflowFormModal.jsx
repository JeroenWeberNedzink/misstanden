import React, { useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';

export default function WorkflowFormModal({ workflow, onClose, onSubmit }) {
  const isEdit = !!workflow;
  const [formData, setFormData] = useState({
    code: workflow?.code || '',
    name: workflow?.name || '',
    description: workflow?.description || '',
    iconName: workflow?.iconName || 'Workflow',
    colorScheme: workflow?.colorScheme || 'sky',
    active: workflow?.active ?? true,
    displayOrder: workflow?.displayOrder ?? 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const iconOptions = [
    { value: 'Workflow', label: 'Workflow' },
    { value: 'Shield', label: 'Shield' },
    { value: 'AlertCircle', label: 'Alert Circle' },
    { value: 'Zap', label: 'Zap' },
    { value: 'FileText', label: 'File Text' },
    { value: 'Settings', label: 'Settings' },
    { value: 'Users', label: 'Users' },
    { value: 'Lock', label: 'Lock' },
    { value: 'Bell', label: 'Bell' },
    { value: 'CheckCircle', label: 'Check Circle' }
  ];

  const colorOptions = [
    { value: 'sky', label: 'Sky Blue' },
    { value: 'rose', label: 'Rose' },
    { value: 'orange', label: 'Orange' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'emerald', label: 'Emerald' },
    { value: 'purple', label: 'Purple' },
    { value: 'amber', label: 'Amber' }
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    
    // Validation
    if (!formData?.name?.trim()) {
      setError('Naam is verplicht');
      return;
    }
    if (!formData?.code?.trim()) {
      setError('Code is verplicht');
      return;
    }
    if (!/^[a-z0-9_]+$/?.test(formData?.code)) {
      setError('Code mag alleen kleine letters, cijfers en underscores bevatten');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err?.message || 'Fout bij het opslaan van workflow');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]" onClick={onClose} />
      <div className="fixed inset-0 z-[10001] overflow-y-auto pointer-events-none">
        <div className="flex min-h-full items-start justify-center p-4 pt-24 pb-20">
          <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full pointer-events-auto max-h-[calc(100vh-8rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {isEdit ? 'Workflow Bewerken' : 'Nieuwe Workflow'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isEdit ? 'Wijzig workflow instellingen' : 'Maak een nieuwe workflow type aan'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <Icon name="X" size={20} />
            </Button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-3">
                <Icon name="AlertCircle" size={20} className="text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Workflow Naam"
                required
                value={formData?.name}
                onChange={(e) => handleChange('name', e?.target?.value)}
                placeholder="bijv. IT Misstand"
              />
              <Input
                label="Workflow Code"
                required
                value={formData?.code}
                onChange={(e) => handleChange('code', e?.target?.value)}
                placeholder="bijv. it_misstand"
                description="Alleen kleine letters, cijfers en underscores"
                disabled={isEdit}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Beschrijving
              </label>
              <textarea
                value={formData?.description}
                onChange={(e) => handleChange('description', e?.target?.value)}
                placeholder="Beschrijf het doel en gebruik van deze workflow..."
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Select
                label="Icoon"
                options={iconOptions}
                value={formData?.iconName}
                onChange={(value) => handleChange('iconName', value)}
              />
              <Select
                label="Kleurschema"
                options={colorOptions}
                value={formData?.colorScheme}
                onChange={(value) => handleChange('colorScheme', value)}
              />
              <Input
                label="Volgorde"
                type="number"
                value={formData?.displayOrder}
                onChange={(e) => handleChange('displayOrder', parseInt(e?.target?.value) || 0)}
                description="Lagere waarde = eerder getoond"
              />
            </div>

            {/* Info about statuses */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Icon name="Info" size={16} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Statussen worden beheerd na het aanmaken van de workflow via "Beheer statussen" in het bewerkpaneel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <input
                type="checkbox"
                id="active"
                checked={formData?.active}
                onChange={(e) => handleChange('active', e?.target?.checked)}
                className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
              <label htmlFor="active" className="text-sm font-medium text-foreground cursor-pointer">
                Workflow direct activeren
              </label>
            </div>

            </div>
            {/* Actions */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-card">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                iconName="Save"
                iconPosition="left"
              >
                {isEdit ? 'Opslaan' : 'Aanmaken'}
              </Button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </>
  );
}
