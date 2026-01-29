import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import { translationService } from '../../../services/translationService';

const TranslationImportModal = ({ language, onClose, onImportComplete }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  const languageOptions = [
    { value: 'en', label: '🇬🇧 English' },
    { value: 'nl', label: '🇳🇱 Nederlands' },
    { value: 'fr', label: '🇫🇷 Français' },
    { value: 'de', label: '🇩🇪 Deutsch' }
  ];

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.json')) {
        setError('Please select a JSON file');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      // Read file
      const text = await selectedFile.text();
      const jsonData = JSON.parse(text);

      // Import via service
      const result = await translationService.importTranslations(
        selectedLanguage,
        jsonData
      );

      setImportResult(result.data);

      // Auto-close after 3 seconds if successful
      setTimeout(() => {
        onImportComplete?.();
      }, 3000);
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import translations');
      setImportResult(null);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Icon name="Upload" size={20} />
              Import Translations
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a JSON file to import/update translations
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            disabled={isImporting}
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <Select
            label="Target Language"
            options={languageOptions}
            value={selectedLanguage}
            onChange={setSelectedLanguage}
            disabled={isImporting}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">JSON File</label>

            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <Icon
                name="Upload"
                size={32}
                className="mx-auto mb-4 text-muted-foreground"
              />

              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={isImporting}
              />

              <label htmlFor="file-upload">
                <Button variant="outline" asChild disabled={isImporting}>
                  <span>Choose File</span>
                </Button>
              </label>

              {selectedFile && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <Icon name="FileText" size={16} className="text-primary" />
                  <p className="text-sm text-foreground font-medium">
                    {selectedFile.name}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Icon name="AlertCircle" className="text-error mt-0.5" size={18} />
                <div>
                  <p className="text-sm font-medium text-error">Import Failed</p>
                  <p className="text-xs text-error mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {importResult && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Icon name="CheckCircle2" className="text-success mt-0.5" size={18} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">Import Successful!</p>
                  <ul className="text-xs text-success mt-2 space-y-1">
                    <li>• Keys imported: {importResult.imported || 0}</li>
                    <li>• Keys updated: {importResult.updated || 0}</li>
                    {importResult.failed > 0 && (
                      <li className="text-warning">• Keys failed: {importResult.failed}</li>
                    )}
                    <li className="font-medium">• Total: {importResult.total || 0}</li>
                  </ul>
                  <p className="text-xs text-success/70 mt-2">
                    Closing automatically in 3 seconds...
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-muted/30 border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Icon name="Info" size={16} className="text-accent mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Note:</strong> Importing will:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Add new translation keys that don't exist</li>
                  <li>Update existing keys with new values</li>
                  <li>Not delete any existing keys</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {importResult ? 'Done' : 'Cancel'}
          </Button>

          {!importResult && (
            <Button
              variant="primary"
              onClick={handleImport}
              loading={isImporting}
              disabled={isImporting || !selectedFile}
              iconName="Upload"
            >
              Import
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranslationImportModal;
