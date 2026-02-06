import React, { useMemo, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const initialsFromName = (name) => {
  const safe = String(name || '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase();
};

const InvestigationNotesPanel = ({ notes, onAddNote }) => {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const listRef = useRef(null);

  const safeNotes = useMemo(() => (Array.isArray(notes) ? notes : []), [notes]);
  const notesCount = safeNotes.length;

  const handleSaveNote = () => {
    if (newNote?.trim()) {
      onAddNote(newNote, null, selectedFiles);
      setNewNote('');
      setSelectedFiles([]);
      setIsAddingNote(false);
    }
  };

  const handleCancel = () => {
    setNewNote('');
    setSelectedFiles([]);
    setIsAddingNote(false);
  };

  const handleAddFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSelectedFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    const n = Number(bytes || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header (more compact) */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Icon name="FileEdit" size={18} color="var(--color-secondary)" />
            </div>

            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                Onderzoeksnotities
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  Deze notities zijn alleen zichtbaar voor interne handlers.

              </div>
            </div>
          </div>

          {!isAddingNote && (
            <Button
              variant="outline"
              size="sm"
              iconName="Plus"
              iconPosition="left"
              onClick={() => setIsAddingNote(true)}
            >
              Notitie
            </Button>
          )}
        </div>
      </div>

      {/* Body (tight) */}
      <div className="p-4">
        {/* Composer (compact) */}
        {isAddingNote && (
          <div className="mb-3 rounded-lg border border-border bg-muted/15 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="Lock" size={14} />
              <span>Alleen zichtbaar voor interne handlers.</span>
            </div>

            <div className="p-3">
              <Input
                label="Nieuwe notitie"
                type="text"
                placeholder="Voer uw onderzoeksnotitie in..."
                value={newNote}
                onChange={(e) => setNewNote(e?.target?.value)}
                description=""
                className="mb-2"
              />

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />

                <Button
                  variant="outline"
                  size="sm"
                  iconName="Paperclip"
                  iconPosition="left"
                  onClick={handleAddFiles}
                >
                  Bijlage
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  iconName="Save"
                  iconPosition="left"
                  onClick={handleSaveNote}
                  disabled={!newNote?.trim()}
                >
                  Opslaan
                </Button>

                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Annuleren
                </Button>

                <div className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Icon name="ShieldCheck" size={13} />
                  <span>Audit-ready</span>
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-3 rounded-md border border-border bg-background/60">
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
                    Interne bijlagen
                  </div>
                  <div className="divide-y divide-border">
                    {selectedFiles.map((file, index) => (
                      <div key={`${file?.name}-${index}`} className="px-3 py-2 flex items-center gap-2">
                        <Icon name="Paperclip" size={14} className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground truncate">{file?.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatFileSize(file?.size)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-70 hover:opacity-100"
                          onClick={() => handleRemoveFile(index)}
                          title="Verwijderen"
                        >
                          <Icon name="X" size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes list (compact log style) */}
        <div ref={listRef} className="rounded-lg border border-border bg-background/40 overflow-hidden">
          {notesCount === 0 ? (
            <div className="text-center py-8 px-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-background/70 border border-border flex items-center justify-center">
                <Icon name="FileEdit" size={22} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nog geen onderzoeksnotities
              </p>
              {!isAddingNote && (
                <p className="text-xs text-muted-foreground mt-1">
                  Voeg een interne notitie toe om acties en bevindingen vast te leggen.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {safeNotes.map((note) => (
                <div
                  key={note?.id}
                  className="px-3 py-2.5 hover:bg-muted/30 transition"
                >
                  <div className="flex items-start gap-3">
                    {/* Smaller avatar */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-semibold text-foreground">
                        {initialsFromName(note?.author)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Meta row (single line feeling) */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {note?.author || 'Onbekend'}
                        </span>

                        {note?.role && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground shrink-0">
                            <Icon name="BadgeCheck" size={12} />
                            {note?.role}
                          </span>
                        )}

                        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                          {note?.timestamp}
                        </span>
                      </div>

                      {/* Content (no extra bordered box) */}
                      <div className="mt-1.5 text-sm text-foreground leading-snug whitespace-pre-wrap break-words">
                        {note?.content}
                      </div>

                      {Array.isArray(note?.attachments) && note.attachments.length > 0 && (
                        <div className="mt-2 rounded-md border border-border bg-background/70 overflow-hidden">
                          <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground border-b border-border">
                            Interne bijlagen
                          </div>
                          <div className="divide-y divide-border">
                            {note.attachments.map((file) => (
                              <div key={file?.id || file?.name} className="px-2.5 py-2 flex items-center gap-2">
                                <Icon name="Paperclip" size={14} className="text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-foreground truncate">
                                    {file?.name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {file?.uploadedDate ? file.uploadedDate : null}
                                    {file?.uploadedDate ? ' - ' : null}
                                    {formatFileSize(file?.size)}
                                  </div>
                                </div>
                                {file?.url ? (
                                  <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex"
                                    title="Download"
                                  >
                                    <Button variant="ghost" size="icon" className="opacity-80 hover:opacity-100">
                                      <Icon name="Download" size={14} />
                                    </Button>
                                  </a>
                                ) : (
                                  <Button variant="ghost" size="icon" disabled className="opacity-50" title="Geen download URL">
                                    <Icon name="Download" size={14} />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Optional: tiny contact hint if you ever need it */}
                      {/* <div className="mt-1 text-[11px] text-muted-foreground">...</div> */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvestigationNotesPanel;



