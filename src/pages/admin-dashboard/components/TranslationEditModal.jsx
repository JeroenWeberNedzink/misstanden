import React, { useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const TranslationEditModal = ({ translationKey, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    keyPath: '',
    values: {
      en: '',
      nl: '',
      fr: '',
      de: ''
    }
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Prefill for edit mode
  useEffect(() => {
    if (translationKey) {
      setFormData({
        keyPath: translationKey.keyPath,
        values: { ...translationKey.values }
      });
    }
  }, [translationKey]);

  const validateForm = () => {
    const newErrors = {};

    // Validate key path
    if (!formData.keyPath?.trim()) {
      newErrors.keyPath = 'Key path is required';
    } else if (!/^[a-zA-Z0-9_.]+$/.test(formData.keyPath)) {
      newErrors.keyPath = 'Invalid format. Use alphanumeric characters, dots, and underscores only (e.g., common.save)';
    }

    // At least one translation required
    const hasValue = Object.values(formData.values).some((v) => v?.trim());
    if (!hasValue) {
      newErrors.general = 'At least one translation is required';
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
    } catch (err) {
      // Parent will handle toast, but we stay open on error
      setIsSaving(false);
    }
  };

  const isEditMode = !!translationKey;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Icon name={isEditMode ? 'Pencil' : 'Plus'} size={20} />
              {isEditMode ? 'Edit Translation' : 'Add Translation Key'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditMode
                ? 'Update values for all languages'
                : 'Create a new translation key with values for all languages'}
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
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Key Path */}
            <div>
              <Input
                label="Key Path"
                placeholder="e.g., common.save or handlerDashboard.metrics.totalCases"
                value={formData.keyPath}
                onChange={(e) =>
                  setFormData({ ...formData, keyPath: e.target.value })
                }
                error={errors.keyPath}
                disabled={isEditMode} // Can't change key path in edit mode
                required
                description={
                  !isEditMode &&
                  'Use dot notation to organize keys (e.g., category.subcategory.key)'
                }
              />
            </div>

            {/* Translations */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-foreground">
                Translations
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Input
                    label="🇬🇧 EN - English"
                    value={formData.values.en}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        values: { ...formData.values, en: e.target.value }
                      })
                    }
                    placeholder="Enter English translation"
                  />

                  <Input
                    label="🇳🇱 NL - Nederlands"
                    value={formData.values.nl}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        values: { ...formData.values, nl: e.target.value }
                      })
                    }
                    placeholder="Enter Dutch translation"
                  />
                </div>

                <div className="space-y-3">
                  <Input
                    label="🇫🇷 FR - Français"
                    value={formData.values.fr}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        values: { ...formData.values, fr: e.target.value }
                      })
                    }
                    placeholder="Enter French translation"
                  />

                  <Input
                    label="🇩🇪 DE - Deutsch"
                    value={formData.values.de}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        values: { ...formData.values, de: e.target.value }
                      })
                    }
                    placeholder="Enter German translation"
                  />
                </div>
              </div>

              {errors.general && (
                <div className="bg-error/10 border border-error/30 rounded-xl p-3">
                  <p className="text-sm text-error">{errors.general}</p>
                </div>
              )}
            </div>

            {/* Preview */}
            {formData.keyPath && formData.values.en && (
              <div className="bg-muted/30 border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Preview
                </p>
                <p className="text-sm font-mono text-foreground">
                  {formData.keyPath}: "{formData.values.en}"
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 sticky bottom-0 bg-card">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSaving}
            disabled={isSaving}
          >
            {isEditMode ? 'Save Changes' : 'Create Key'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TranslationEditModal;
