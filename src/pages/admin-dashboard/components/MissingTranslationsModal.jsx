import React, { useState, useMemo } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import { translationService } from '../../../services/translationService';

const MissingTranslationsModal = ({ missingTranslations, onClose, onAddMissing }) => {
  const [groupBy, setGroupBy] = useState('key'); // 'key' | 'language'
  const [isFilling, setIsFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0 });
  const [fillResults, setFillResults] = useState(null);
  const [sourceLang, setSourceLang] = useState('en');

  // Group by language
  const byLanguage = useMemo(() => {
    const result = {};

    missingTranslations.forEach((mt) => {
      mt.missingIn.forEach((lang) => {
        if (!result[lang]) {
          result[lang] = [];
        }
        result[lang].push(mt.key);
      });
    });

    return result;
  }, [missingTranslations]);

  const languageLabels = {
    en: '🇬🇧 English',
    nl: '🇳🇱 Nederlands',
    fr: '🇫🇷 Français',
    de: '🇩🇪 Deutsch'
  };

  const languageOptions = [
    { value: 'en', label: '🇬🇧 English' },
    { value: 'nl', label: '🇳🇱 Nederlands' },
    { value: 'fr', label: '🇫🇷 Français' },
    { value: 'de', label: '🇩🇪 Deutsch' }
  ];

  const handleFillMissing = async () => {
    if (!confirm(`Fill all ${missingTranslations.length} missing translations by copying from ${languageLabels[sourceLang]}?\n\nThis will update the JSON files.`)) {
      return;
    }

    setIsFilling(true);
    setFillProgress({ current: 0, total: missingTranslations.length });
    setFillResults(null);

    try {
      const results = await translationService.fillMissingTranslations(
        missingTranslations,
        sourceLang,
        (current, total) => {
          setFillProgress({ current, total });
        }
      );

      setFillResults(results);

      // Auto-close after 5 seconds
      setTimeout(() => {
        onClose();
        window.location.reload(); // Reload to refresh translations
      }, 5000);
    } catch (err) {
      console.error('Fill missing error:', err);
      alert('Failed to fill missing translations: ' + err.message);
    } finally {
      setIsFilling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Icon name="AlertCircle" size={20} className="text-warning" />
              Missing Translations
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {missingTranslations.length} keys have missing translations
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setGroupBy('key')}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    groupBy === 'key'
                      ? 'bg-primary text-white'
                      : 'bg-muted text-foreground hover:bg-muted/70'
                  }`}
                  disabled={isFilling}
                >
                  Key
                </button>
                <button
                  onClick={() => setGroupBy('language')}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    groupBy === 'language'
                      ? 'bg-primary text-white'
                      : 'bg-muted text-foreground hover:bg-muted/70'
                  }`}
                  disabled={isFilling}
                >
                  Language
                </button>
              </div>
            </div>

            {missingTranslations.length > 0 && !fillResults && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Copy from:</span>
                <Select
                  options={languageOptions}
                  value={sourceLang}
                  onChange={setSourceLang}
                  className="w-40"
                  disabled={isFilling}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFillMissing}
                  loading={isFilling}
                  disabled={isFilling}
                  iconName="Copy"
                >
                  Fill All Missing
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Progress indicator */}
          {isFilling && (
            <div className="mb-6 bg-primary/10 border border-primary/30 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Icon name="Loader2" className="text-primary" size={20} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">
                    Filling missing translations...
                  </p>
                  <p className="text-xs text-primary/70 mt-1">
                    {fillProgress.current} / {fillProgress.total} keys processed
                  </p>
                </div>
              </div>
              <div className="w-full bg-primary/20 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width: `${(fillProgress.current / fillProgress.total) * 100}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {fillResults && (
            <div className="mb-6 bg-success/10 border border-success/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Icon name="CheckCircle2" className="text-success mt-0.5" size={20} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-success mb-3">
                    Missing translations filled successfully!
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(fillResults).map(([lang, result]) => (
                      <div key={lang} className="bg-background rounded-lg p-3">
                        <p className="text-xs font-medium text-foreground mb-1">
                          {languageLabels[lang]}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>✓ Copied: {result.copied}</p>
                          {result.failed > 0 && (
                            <p className="text-error">✗ Failed: {result.failed}</p>
                          )}
                          {result.skipped > 0 && (
                            <p className="text-warning">⊘ Skipped: {result.skipped}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-success/70 mt-3">
                    Reloading page in 5 seconds to refresh translations...
                  </p>
                </div>
              </div>
            </div>
          )}

          {missingTranslations.length === 0 ? (
            <div className="text-center py-12">
              <Icon
                name="CheckCircle2"
                size={48}
                className="mx-auto mb-3 text-success"
              />
              <p className="text-lg font-medium text-foreground">
                All translations are complete!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                No missing translations detected across all languages
              </p>
            </div>
          ) : groupBy === 'key' ? (
            <div className="space-y-3">
              {missingTranslations.map((mt, idx) => (
                <div
                  key={idx}
                  className="bg-background border border-border rounded-xl p-4 hover:border-warning/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-foreground font-medium">
                        {mt.key}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Category: {mt.category}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {mt.missingIn.map((lang) => (
                          <span
                            key={lang}
                            className="px-2 py-1 rounded text-xs bg-warning/10 text-warning border border-warning/30 font-medium"
                            title={`Missing in ${languageLabels[lang]}`}
                          >
                            {lang.toUpperCase()}
                          </span>
                        ))}
                      </div>

                      {onAddMissing && (
                        <button
                          onClick={() => onAddMissing(mt.key)}
                          className="p-1.5 hover:bg-primary/10 rounded transition-colors group"
                          title="Add missing translations"
                        >
                          <Icon
                            name="Plus"
                            size={14}
                            className="text-muted-foreground group-hover:text-primary"
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(byLanguage)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([lang, keys]) => (
                  <div
                    key={lang}
                    className="bg-background border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="Globe" size={16} className="text-accent" />
                      <h3 className="font-semibold text-foreground">
                        {languageLabels[lang]}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-xs bg-warning/10 text-warning border border-warning/30">
                        {keys.length} missing
                      </span>
                    </div>

                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {keys.map((key, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-muted-foreground font-mono flex items-center justify-between group hover:bg-muted/30 px-2 py-1 rounded"
                        >
                          <span>• {key}</span>
                          {onAddMissing && (
                            <button
                              onClick={() => onAddMissing(key)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/10 rounded transition-all"
                              title="Add missing translation"
                            >
                              <Icon name="Plus" size={12} className="text-primary" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {!fillResults && !isFilling && missingTranslations.length > 0 && (
              <p>
                💡 Tip: Use "Fill All Missing" to copy from {languageLabels[sourceLang]} to all
                missing languages
              </p>
            )}
          </div>
          <Button variant="primary" onClick={onClose} disabled={isFilling}>
            {fillResults ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MissingTranslationsModal;
