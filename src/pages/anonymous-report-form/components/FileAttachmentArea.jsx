import React, { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import { useSettings } from '../../../contexts/SettingsContext';

// Map file extensions to MIME types
const MIME_TYPE_MAP = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'txt': 'text/plain',
  'csv': 'text/csv',
  'zip': 'application/zip',
};

const FileAttachmentArea = ({ files, onFilesAdd, onFileRemove, error }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const fileInputRef = useRef(null);

  // Get settings or use defaults
  const maxFileSize = (settings?.portal?.maxAttachmentSizeMb || 10) * 1024 * 1024;
  const allowedExtensions = settings?.portal?.allowedFileTypes || ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

  // Convert allowed extensions to MIME types
  const allowedTypes = useMemo(() => {
    return allowedExtensions.map(ext => MIME_TYPE_MAP[ext.toLowerCase()]).filter(Boolean);
  }, [allowedExtensions]);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e?.target?.files);
    const validFiles = [];
    const errors = [];

    selectedFiles?.forEach(file => {
      if (!allowedTypes?.includes(file?.type)) {
        errors?.push(`${file?.name}: ${t('reportForm.invalidFileType')}`);
        return;
      }
      if (file?.size > maxFileSize) {
        errors?.push(`${file?.name}: ${t('reportForm.fileTooLarge')}`);
        return;
      }
      validFiles?.push(file);
    });

    if (errors?.length > 0) {
      alert(errors?.join('\n'));
    }

    if (validFiles?.length > 0) {
      onFilesAdd(validFiles);
    }

    if (fileInputRef?.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return `0 ${t('common.bytes')}`;
    const k = 1024;
    const sizes = [t('common.bytes'), t('common.kb'), t('common.mb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes?.[i];
  };

  const getFileIcon = (fileName) => {
    const ext = fileName?.split('.')?.pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'FileText';
      case 'doc': case'docx':
        return 'FileText';
      case 'xls': case'xlsx':
        return 'Table';
      case 'jpg': case'jpeg': case'png':
        return 'Image';
      default:
        return 'File';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="Paperclip" size={20} color="var(--color-primary)" />
        <h3 className="text-lg font-semibold text-foreground">{t('reportForm.attachments')}</h3>
      </div>
      <div className={`border-2 border-dashed rounded-lg p-6 md:p-8 lg:p-10 text-center transition-smooth ${
        error ? 'border-error bg-error/5' : 'border-border hover:border-primary/50 bg-muted/30'
      }`}>
        <Icon name="Upload" size={40} className="mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm md:text-base text-foreground mb-2">
          {t('reportForm.dragDropOrClick')}
        </p>
        <p className="text-xs md:text-sm text-muted-foreground mb-4">
          {t('reportForm.supportedFormats')}: {allowedExtensions?.join(', ')?.toUpperCase()}
          <br />
          {t('reportForm.maxFileSize')}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedExtensions?.map(ext => `.${ext}`)?.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          aria-label={t('reportForm.selectFilesLabel')}
        />
        <Button
          variant="outline"
          iconName="FolderOpen"
          iconPosition="left"
          onClick={() => fileInputRef?.current?.click()}
        >
          {t('reportForm.selectFiles')}
        </Button>
        {error && (
          <p className="text-sm text-error mt-3 flex items-center justify-center gap-2">
            <Icon name="AlertCircle" size={16} />
            {error}
          </p>
        )}
      </div>
      {files?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {t('reportForm.selectedFiles')} ({files?.length})
          </p>
          <div className="space-y-2">
            {files?.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 md:p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-smooth"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon name={getFileIcon(file?.name)} size={20} color="var(--color-primary)" className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file?.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  iconName="X"
                  onClick={() => onFileRemove(index)}
                  className="flex-shrink-0"
                  aria-label={`${t('reportForm.removeFile')} ${file?.name}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileAttachmentArea;