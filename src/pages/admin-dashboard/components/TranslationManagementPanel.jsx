import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import { translationService } from '../../../services/translationService';

const TranslationManagementPanel = ({ onRefresh, onShowToast }) => {
  const { i18n } = useTranslation();

  // State
  const [translations, setTranslations] = useState({});
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [jsonText, setJsonText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Available languages
  const [languages, setLanguages] = useState([
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' }
  ]);

  const [showAddLanguageModal, setShowAddLanguageModal] = useState(false);
  const [newLanguageCode, setNewLanguageCode] = useState('');
  const [newLanguageName, setNewLanguageName] = useState('');

  // Load translations for selected language
  const loadTranslations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      setValidationError('');

      const data = await translationService.getTranslations(selectedLanguage);
      setTranslations(data);
      setJsonText(JSON.stringify(data, null, 2));
      setIsDirty(false);
    } catch (err) {
      console.error('Error loading translations:', err);
      setError('Failed to load translations');
      onShowToast?.('Failed to load translations', true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLanguage, onShowToast]);

  useEffect(() => {
    loadTranslations();
  }, [loadTranslations]);

  // Handle JSON text change
  const handleJsonChange = (e) => {
    const newText = e.target.value;
    setJsonText(newText);
    setIsDirty(true);

    // Validate JSON
    try {
      JSON.parse(newText);
      setValidationError('');
    } catch (err) {
      setValidationError(err.message);
    }
  };

  // Save translations
  const handleSave = async () => {
    try {
      // Validate JSON first
      const parsed = JSON.parse(jsonText);

      setIsSaving(true);
      setError('');

      // Update each translation key
      for (const [key, value] of Object.entries(parsed)) {
        if (translations[key] !== value) {
          await translationService.updateValue(key, selectedLanguage, value);
        }
      }

      // Check for deleted keys
      for (const key of Object.keys(translations)) {
        if (!(key in parsed)) {
          await translationService.deleteKey(key);
        }
      }

      onShowToast?.('Translations saved successfully');
      await loadTranslations();
      await i18n.reloadResources();
    } catch (err) {
      console.error('Error saving translations:', err);
      setError(err.message || 'Failed to save translations');
      onShowToast?.(err.message || 'Failed to save translations', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Export translations
  const handleExport = async () => {
    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translation-${selectedLanguage}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onShowToast?.('Translations exported successfully');
    } catch (err) {
      onShowToast?.('Failed to export translations', true);
    }
  };

  // Import translations
  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setJsonText(JSON.stringify(parsed, null, 2));
      setIsDirty(true);
      setValidationError('');
      onShowToast?.('File loaded. Click Save to apply changes.');
    } catch (err) {
      onShowToast?.('Invalid JSON file', true);
    }
  };

  // Add new language
  const handleAddLanguage = async () => {
    if (!newLanguageCode || !newLanguageName) {
      onShowToast?.('Please provide both language code and name', true);
      return;
    }

    try {
      // Check if language already exists
      if (languages.some(l => l.value === newLanguageCode.toLowerCase())) {
        onShowToast?.('Language already exists', true);
        return;
      }

      // Copy English translations as base
      const englishTranslations = await translationService.getTranslations('en');

      // Create new language file with English content
      for (const [key, value] of Object.entries(englishTranslations)) {
        await translationService.updateValue(key, newLanguageCode.toLowerCase(), value);
      }

      // Add to languages list
      const newLang = {
        value: newLanguageCode.toLowerCase(),
        label: newLanguageName
      };
      setLanguages([...languages, newLang]);
      setSelectedLanguage(newLanguageCode.toLowerCase());

      setShowAddLanguageModal(false);
      setNewLanguageCode('');
      setNewLanguageName('');

      onShowToast?.(`Language "${newLanguageName}" added successfully`);
    } catch (err) {
      console.error('Error adding language:', err);
      onShowToast?.('Failed to add language', true);
    }
  };

  // Format JSON (prettier)
  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setValidationError('');
    } catch (err) {
      setValidationError(err.message);
    }
  };

  const totalKeys = Object.keys(translations).length;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-white/60 rounded-xl p-4 border border-cyan-100">
        <div className="flex flex-wrap gap-3 items-center">
          <Select
            options={languages}
            value={selectedLanguage}
            onChange={(val) => {
              if (isDirty && !confirm('You have unsaved changes. Discard them?')) {
                return;
              }
              setSelectedLanguage(val);
            }}
            className="w-48"
          />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="FileCode" size={16} />
            <span>{totalKeys} keys</span>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
              <Icon name="AlertCircle" size={16} />
              <span>Invalid JSON</span>
            </div>
          )}

          {isDirty && !validationError && (
            <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg">
              <Icon name="AlertCircle" size={16} />
              <span>Unsaved changes</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            iconName="Plus"
            onClick={() => setShowAddLanguageModal(true)}
          >
            Add Language
          </Button>

          <Button
            variant="outline"
            size="sm"
            iconName="Upload"
            onClick={() => document.getElementById('import-file').click()}
          >
            Import
          </Button>
          <input
            id="import-file"
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          <Button
            variant="outline"
            size="sm"
            iconName="Download"
            onClick={handleExport}
          >
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            iconName="Code"
            onClick={handleFormat}
            disabled={!jsonText || validationError}
          >
            Format
          </Button>

          <Button
            variant="outline"
            size="sm"
            iconName="RotateCcw"
            onClick={loadTranslations}
            disabled={isLoading}
          >
            Reset
          </Button>

          <Button
            variant="primary"
            size="sm"
            iconName="Save"
            onClick={handleSave}
            disabled={!isDirty || validationError || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Icon name="AlertCircle" className="text-red-600" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* JSON Editor */}
      {isLoading ? (
        <div className="text-center py-12 bg-white/40 rounded-xl border border-cyan-100">
          <Icon name="Loader2" className="animate-spin mx-auto mb-2" size={32} />
          <p className="text-muted-foreground">Loading translations...</p>
        </div>
      ) : (
        <div className="relative bg-white/60 rounded-xl border border-cyan-100 p-4">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono bg-cyan-50 px-2 py-1 rounded">
              {selectedLanguage.toUpperCase()} / JSON
            </span>
          </div>

          <textarea
            value={jsonText}
            onChange={handleJsonChange}
            className="w-full h-[600px] p-4 font-mono text-sm bg-white border border-cyan-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 resize-none"
            placeholder="{ ... }"
            spellCheck={false}
          />

          {validationError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg font-mono">
              {validationError}
            </div>
          )}
        </div>
      )}

      {/* Add Language Modal */}
      {showAddLanguageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">Add New Language</h3>
              <button
                onClick={() => {
                  setShowAddLanguageModal(false);
                  setNewLanguageCode('');
                  setNewLanguageName('');
                }}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <Icon name="X" size={20} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              New language will be created with English translations as a starting point.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Language Code
                </label>
                <input
                  type="text"
                  value={newLanguageCode}
                  onChange={(e) => setNewLanguageCode(e.target.value)}
                  placeholder="e.g., es, it, pt"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={5}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  2-letter ISO code (e.g., es for Spanish)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Language Name
                </label>
                <input
                  type="text"
                  value={newLanguageName}
                  onChange={(e) => setNewLanguageName(e.target.value)}
                  placeholder="e.g., Español, Italiano"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                fullWidth
                onClick={() => {
                  setShowAddLanguageModal(false);
                  setNewLanguageCode('');
                  setNewLanguageName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleAddLanguage}
                disabled={!newLanguageCode || !newLanguageName}
              >
                Add Language
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationManagementPanel;
