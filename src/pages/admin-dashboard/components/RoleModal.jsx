import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const RoleModal = ({ role, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    isSystem: false,
    isDefault: false
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (role) {
      setFormData({
        code: role.code || '',
        name: role.name || '',
        description: role.description || '',
        isSystem: role.isSystem || false,
        isDefault: role.isDefault || false
      });
    } else {
      setFormData({
        code: '',
        name: '',
        description: '',
        isSystem: false,
        isDefault: false
      });
    }
  }, [role]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.code?.trim()) {
      newErrors.code = 'Code is verplicht';
    } else if (!/^[A-Z_]+$/.test(formData.code)) {
      newErrors.code = 'Code moet alleen hoofdletters en underscores bevatten (bijv. TICKET_MANAGER)';
    }

    if (!formData.name?.trim()) {
      newErrors.name = 'Naam is verplicht';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setIsSaving(false);
    }
  };

  const isEditMode = !!role;

  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl max-w-2xl w-full shadow-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Icon name={isEditMode ? 'Pencil' : 'Plus'} size={20} />
                {isEditMode ? 'Rol Bewerken' : 'Nieuwe Rol'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isEditMode ? 'Wijzig de rol details' : 'Maak een nieuwe rol aan'}
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              disabled={isSaving}
            >
              <Icon name="X" size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <Input
              label="Code"
              placeholder="bijv. TICKET_MANAGER"
              value={formData.code}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }));
                setErrors(prev => ({ ...prev, code: null }));
              }}
              error={errors.code}
              disabled={isEditMode || isSaving}
              required
            />

            <Input
              label="Naam"
              placeholder="bijv. Ticket Manager"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }));
                setErrors(prev => ({ ...prev, name: null }));
              }}
              error={errors.name}
              disabled={isSaving}
              required
            />

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Beschrijving
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optionele beschrijving van deze rol..."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={3}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isSystem}
                  onChange={(e) => setFormData(prev => ({ ...prev, isSystem: e.target.checked }))}
                  className="w-4 h-4 rounded border-border"
                  disabled={isEditMode || isSaving}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Systeemrol</p>
                  <p className="text-xs text-muted-foreground">
                    Kan niet worden verwijderd (alleen voor ingebouwde rollen)
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-border"
                  disabled={isSaving}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Standaardrol</p>
                  <p className="text-xs text-muted-foreground">
                    Wordt automatisch toegewezen aan nieuwe gebruikers
                  </p>
                </div>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
                loading={isSaving}
              >
                {isEditMode ? 'Opslaan' : 'Aanmaken'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default RoleModal;
