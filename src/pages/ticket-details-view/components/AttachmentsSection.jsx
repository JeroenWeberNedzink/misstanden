import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const AttachmentsSection = ({ attachments }) => {
  const { t } = useTranslation();

  const getFileIcon = (fileType) => {
    const type = String(fileType || '').toLowerCase();
    if (type.includes('pdf')) return 'FileText';
    if (type.includes('image') || type.includes('jpg') || type.includes('jpeg') || type.includes('png')) return 'Image';
    if (type.includes('doc')) return 'FileText';
    if (type.includes('xls') || type.includes('sheet')) return 'Table';
    return 'File';
  };

  const formatFileSize = (bytes) => {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="space-y-3">
      {attachments.map((attachment, index) => {
        const fileName = attachment?.name || `${t('ticketDetails.attachments')} ${index + 1}`;
        const canDownload = Boolean(attachment?.url);

        return (
          <div
            key={`${fileName}-${index}`}
            className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon name={getFileIcon(attachment?.type)} size={20} color="var(--color-primary)" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(attachment?.size)}</p>
            </div>

            {canDownload ? (
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 p-2 hover:bg-primary/10 rounded-lg transition-colors"
                title={t('ticketDetailsView.common.download')}
              >
                <Icon name="Download" size={16} className="text-primary" />
              </a>
            ) : (
              <div className="flex-shrink-0 p-2 text-muted-foreground/50" title={t('ticketDetailsView.attachments.noDownloadUrl')}>
                <Icon name="Download" size={16} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AttachmentsSection;
