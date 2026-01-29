import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const AttachmentsSection = ({ attachments }) => {
  const getFileIcon = (fileType) => {
    const type = fileType?.toLowerCase();
    if (type?.includes('pdf')) return 'FileText';
    if (type?.includes('image') || type?.includes('jpg') || type?.includes('png')) return 'Image';
    if (type?.includes('doc')) return 'FileText';
    if (type?.includes('xls') || type?.includes('sheet')) return 'Table';
    return 'File';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024)?.toFixed(1) + ' KB';
    return (bytes / (1024 * 1024))?.toFixed(1) + ' MB';
  };

  const handleDownload = (attachment) => {
    console.log('Downloading:', attachment?.name);
    // Mock download functionality
    alert(`Download gestart voor: ${attachment?.name}`);
  };

  if (!attachments || attachments?.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {attachments?.map((attachment, index) => (
        <div
          key={index}
          className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name={getFileIcon(attachment?.type)} size={20} color="var(--color-primary)" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {attachment?.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(attachment?.size)}
            </p>
          </div>

          <button
            onClick={() => handleDownload(attachment)}
            className="flex-shrink-0 p-2 hover:bg-primary/10 rounded-lg transition-colors"
          >
            <Icon name="Download" size={16} className="text-primary" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default AttachmentsSection;