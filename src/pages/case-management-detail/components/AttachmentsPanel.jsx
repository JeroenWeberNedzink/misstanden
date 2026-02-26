import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Image from '../../../components/AppImage';

const AttachmentsPanel = ({ attachments, onAddAttachment, isLoading = false }) => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);

  const getFileIcon = (fileType) => {
    const icons = {
      image: 'Image',
      pdf: 'FileText',
      document: 'File',
      spreadsheet: 'Sheet',
    };
    return icons?.[fileType] || 'File';
  };

  const formatFileSize = (bytes) => {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileView = (file) => setSelectedFile(file);
  const handleClosePreview = () => setSelectedFile(null);

  const isPreviewablePdf = (file) => {
    if (!file) return false;
    const url = String(file?.url || '').trim();
    if (!url || url === '#') return false;

    const mime = String(file?.mimeType || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return mime.includes('pdf') || name.endsWith('.pdf') || url.toLowerCase().includes('.pdf');
  };

  const getDownloadUrl = (file) => {
    const url = String(file?.url || '').trim();
    if (!url || url === '#') return '';
    return url;
  };

  const hasValidUrl = useMemo(() => Boolean(getDownloadUrl(selectedFile)), [selectedFile]);
  const files = useMemo(() => (Array.isArray(attachments) ? attachments : []), [attachments]);
  const count = files.length;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Icon name="Paperclip" size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {t('ticketDetails.attachments')}
              </h2>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {isLoading ? t('common.loading') : `${count} ${t('caseManagementDetail.attachments.files')}`}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            iconName="Plus"
            iconPosition="left"
            onClick={onAddAttachment}
            disabled={isLoading}
          >
            {t('caseManagementDetail.attachments.add')}
          </Button>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-md bg-muted animate-pulse" />
            <div className="h-10 rounded-md bg-muted animate-pulse" />
            <div className="h-10 rounded-md bg-muted animate-pulse" />
          </div>
        ) : count === 0 ? (
          <div className="text-center py-8 px-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Icon name="Paperclip" size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('ticketDetails.noAttachments')}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
            <div className="divide-y divide-border">
              {files.map((file) => (
                <div
                  key={file?.id}
                  className="px-3 py-2.5 hover:bg-muted/30 transition cursor-pointer"
                  onClick={() => handleFileView(file)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{file?.name}</div>
                        {file?.type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-background/60 text-muted-foreground shrink-0">
                            {String(file.type).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {file?.uploadedDate ? file.uploadedDate : null}
                        {file?.uploadedDate && file?.uploadedBy ? ` - ${t('caseManagementDetail.attachments.by')} ` : null}
                        {file?.uploadedBy ? file.uploadedBy : null}
                        {file?.size ? ` - ${formatFileSize(file?.size)}` : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-80 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileView(file);
                        }}
                        title={t('caseManagementDetail.common.preview')}
                      >
                        <Icon name="Eye" size={16} />
                      </Button>

                      {getDownloadUrl(file) ? (
                        <a
                          href={getDownloadUrl(file)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex"
                          title={t('caseManagementDetail.common.download')}
                        >
                          <Button variant="ghost" size="icon" className="opacity-80 hover:opacity-100">
                            <Icon name="Download" size={16} />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled
                          title={t('caseManagementDetail.attachments.noDownloadUrl')}
                          className="opacity-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="Download" size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/10 flex items-center justify-center">
                  <Icon name={getFileIcon(selectedFile?.type)} size={18} color="var(--color-primary)" />
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm md:text-base font-semibold text-foreground truncate">{selectedFile?.name}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(selectedFile?.size)}
                    {selectedFile?.uploadedDate ? ` - ${selectedFile.uploadedDate}` : ''}
                  </p>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={handleClosePreview} title={t('common.close')}>
                <Icon name="X" size={18} />
              </Button>
            </div>

            <div className="p-4 overflow-auto max-h-[calc(90vh-70px)]">
              {selectedFile?.type === 'image' ? (
                <div className="flex justify-center">
                  <Image src={selectedFile?.url} alt={selectedFile?.alt || selectedFile?.name} className="max-w-full h-auto rounded-lg" />
                </div>
              ) : isPreviewablePdf(selectedFile) ? (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
                    <iframe
                      title={`pdf-preview-${selectedFile?.id}`}
                      src={`${getDownloadUrl(selectedFile)}#view=FitH`}
                      className="w-full h-[70vh]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a href={getDownloadUrl(selectedFile)} target="_blank" rel="noreferrer" className="inline-flex">
                      <Button variant="outline" size="sm" iconName="Download" iconPosition="left">
                        {t('caseManagementDetail.common.download')}
                      </Button>
                    </a>
                    <a href={getDownloadUrl(selectedFile)} target="_blank" rel="noreferrer" className="inline-flex">
                      <Button variant="ghost" size="sm" iconName="ExternalLink" iconPosition="left">
                        {t('caseManagementDetail.attachments.openInNewTab')}
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10">
                  <Icon name={getFileIcon(selectedFile?.type)} size={48} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-3">{t('caseManagementDetail.attachments.previewUnavailable')}</p>

                  {!hasValidUrl ? (
                    <p className="text-xs text-muted-foreground max-w-xl mx-auto">
                      {t('caseManagementDetail.attachments.downloadUnavailableReason')}
                    </p>
                  ) : (
                    <a href={getDownloadUrl(selectedFile)} target="_blank" rel="noreferrer" className="inline-flex">
                      <Button variant="outline" size="sm" iconName="Download" iconPosition="left">
                        {t('caseManagementDetail.common.download')}
                      </Button>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttachmentsPanel;
