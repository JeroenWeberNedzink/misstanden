import React, { useEffect, useRef, useMemo, useState } from 'react';
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
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewText, setPreviewText] = useState('');

  // Get settings or use defaults
  const maxFileSize = (settings?.portal?.maxAttachmentSizeMb || 10) * 1024 * 1024;
  const allowedExtensions = settings?.portal?.allowedFileTypes || ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

  // Convert allowed extensions to MIME types
  const allowedTypes = useMemo(() => {
    return allowedExtensions.map(ext => MIME_TYPE_MAP[ext.toLowerCase()]).filter(Boolean);
  }, [allowedExtensions]);

  const processSelectedFiles = (selectedFiles = []) => {
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
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e?.target?.files || []);
    processSelectedFiles(selectedFiles);

    if (fileInputRef?.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const droppedFiles = Array.from(e?.dataTransfer?.files || []);
    processSelectedFiles(droppedFiles);
  };

  const openFilePicker = () => {
    fileInputRef?.current?.click();
  };

  const handleDropzoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
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

  const getPreviewType = (file) => {
    const ext = file?.name?.split('.')?.pop()?.toLowerCase();
    const mime = file?.type || '';

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return 'image';
    }
    if (mime === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }
    if (mime.startsWith('text/') || ['txt', 'csv', 'log', 'json', 'md'].includes(ext)) {
      return 'text';
    }
    return 'unsupported';
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewType(null);
    setPreviewText('');
    setPreviewUrl('');
  };

  const handlePreview = async (file) => {
    const type = getPreviewType(file);
    setPreviewFile(file);
    setPreviewType(type);
    setPreviewText('');

    if (type === 'text') {
      setPreviewUrl('');
      try {
        const textContent = await file.text();
        setPreviewText(textContent);
      } catch {
        setPreviewText('Preview unavailable for this file.');
      }
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } catch {
      setPreviewUrl('');
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        onKeyDown={handleDropzoneKeyDown}
        role="button"
        tabIndex={0}
        className={`border-2 border-dashed rounded-lg p-6 md:p-8 lg:p-10 text-center transition-smooth ${
        error
          ? 'border-error bg-error/5'
          : isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 bg-muted/30'
      }`}>
        <Icon name="Upload" size={40} className="mx-auto mb-1 text-muted-foreground" />
        <p className="text-sm md:text-base text-foreground mb-2">
          {t('reportForm.dragDropOrClick')}
        </p>
        {/* <p className="text-xs md:text-sm text-muted-foreground mb-1">
          {t('reportForm.supportedFormats')}: {allowedExtensions?.join(', ')?.toUpperCase()}
          <br />
          {t('reportForm.maxFileSize')}
        </p> */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedExtensions?.map(ext => `.${ext}`)?.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          aria-label={t('reportForm.selectFilesLabel')}
        />
        {/* <Button
          variant="outline"
          iconName="FolderOpen"
          iconPosition="left"
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
        >
          {t('reportForm.selectFiles')}
        </Button> */}
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
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconName="Eye"
                    onClick={() => handlePreview(file)}
                    aria-label={`Preview ${file?.name}`}
                  >
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    iconName="X"
                    onClick={() => onFileRemove(index)}
                    aria-label={`${t('reportForm.removeFile')} ${file?.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground truncate">{previewFile?.name}</p>
              <Button variant="ghost" size="icon" iconName="X" onClick={closePreview} aria-label={t('common.close')} />
            </div>
            <div className="p-4 overflow-auto max-h-[80vh]">
              {previewType === 'image' && previewUrl && (
                <img src={previewUrl} alt={previewFile?.name} className="max-w-full mx-auto rounded-md" />
              )}
              {previewType === 'pdf' && previewUrl && (
                <iframe title={previewFile?.name} src={previewUrl} className="w-full h-[70vh] rounded-md border border-border" />
              )}
              {previewType === 'text' && (
                <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 border border-border rounded-md p-4">
                  {previewText}
                </pre>
              )}
              {previewType === 'unsupported' && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">No inline preview available for this file type.</p>
                  {previewUrl && (
                    <a
                      href={previewUrl}
                      download={previewFile?.name}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      Open or download file
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

export default FileAttachmentArea;
