import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../../components/navigation/AnonymousNavHeader';
import Icon from '../../components/AppIcon';
import { ticketService } from '../../services/ticketService';

// Step components
import WorkflowSelector from './components/WorkflowSelector';
import DescriptionField from './components/DescriptionField';
import LocationField from './components/LocationField';
import ReporterContactFields from './components/ReporterContactFields';
import FileAttachmentArea from './components/FileAttachmentArea';
import EmailNotificationToggle from './components/EmailNotificationToggle';

const STEPS = [
  { id: 1, name: 'reportForm.stepName1', icon: 'FolderOpen', desc: 'reportForm.stepDesc1' },
  { id: 2, name: 'reportForm.stepName2', icon: 'FileText', desc: 'reportForm.stepDesc2' },
  { id: 3, name: 'reportForm.stepName3', icon: 'MapPin', desc: 'reportForm.stepDesc3' },
  { id: 4, name: 'reportForm.stepName4', icon: 'User', desc: 'reportForm.stepDesc4' },
  { id: 5, name: 'reportForm.stepName5', icon: 'Paperclip', desc: 'reportForm.stepDesc5' },
  { id: 6, name: 'reportForm.stepName6', icon: 'CheckCircle2', desc: 'reportForm.stepDesc6' }
];

const safeTrim = (v) => String(v ?? '').trim();
const toWorkflowKey = (v) =>
  safeTrim(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export default function AnonymousReportForm() {
  const DESCRIPTION_PREVIEW_LENGTH = 240;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [currentStep, setCurrentStep] = useState(1);
  const [workflows, setWorkflows] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [reviewPreviewFile, setReviewPreviewFile] = useState(null);
  const [reviewPreviewType, setReviewPreviewType] = useState(null);
  const [reviewPreviewUrl, setReviewPreviewUrl] = useState('');
  const [reviewPreviewText, setReviewPreviewText] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const getLocalizedWorkflowName = (workflow) => {
    const code = safeTrim(workflow?.code);
    const name = safeTrim(workflow?.name);
    const candidates = Array.from(new Set([code, toWorkflowKey(code), toWorkflowKey(name)].filter(Boolean)));

    for (const candidate of candidates) {
      const translated = t(`reportForm.workflowOptions.${candidate}.name`, { defaultValue: '' });
      if (translated) return translated;
    }

    return name || code;
  };

  const [formData, setFormData] = useState({
    workflow: '',
    severity: 'medium',
    description: '',
    location: '',
    reporterName: '',
    reporterEmail: '',
    reporterPhone: '',
    emailNotify: true,
    statusEmailNotify: true,
    isAnonymous: true,
    files: []
  });

  useEffect(() => {
    loadFormData();
  }, []);

  useEffect(() => {
    const workflowParam = searchParams?.get('workflow');
    if (workflowParam && workflows?.length > 0) {
      const workflow = workflows?.find(w => w?.code === workflowParam);
      if (workflow && workflow?.active) {
        setFormData(prev => ({ ...prev, workflow: workflowParam }));
      }
    }
  }, [searchParams, workflows]);

  useEffect(() => {
    if (currentStep !== 6) {
      setShowFullDescription(false);
    }
  }, [currentStep]);

  useEffect(() => {
    return () => {
      if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    };
  }, [reviewPreviewUrl]);

  const loadFormData = async () => {
    try {
      const [workflowsData, severitiesData] = await Promise.all([
        ticketService?.getWorkflows(),
        ticketService?.getSeverities()
      ]);

      setWorkflows(workflowsData);
      setSeverities(severitiesData);
    } catch (err) {
      setError(t('reportForm.errorLoadingData'));
      console.error('Error loading form data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const validateStep = (step) => {
    const validationErrors = {};

    if (step === 1) {
      if (!formData?.workflow) validationErrors.workflow = t('reportForm.workflowRequired');
    }

    if (step === 2) {
      if (!formData?.description || formData?.description?.trim() === '') {
        validationErrors.description = t('reportForm.descriptionRequired');
      }
    }

    if (step === 3) {
      if (!formData?.location || formData?.location?.trim() === '') {
        validationErrors.location = t('reportForm.locationRequired');
      }
    }
    if (step === 4) {
      if (!formData?.reporterEmail || !String(formData?.reporterEmail).trim()) {
        validationErrors.reporterEmail = t('reportForm.emailRequired');
      }
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 200, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSkip = () => {
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setError('');

    if (!validateStep(2) || !validateStep(3)) {
      setCurrentStep(2);
      return;
    }
    if (!validateStep(4)) {
      setCurrentStep(4);
      return;
    }

    setIsSubmitting(true);

    try {
      const email = String(formData?.reporterEmail || '').trim();
      const emailNotify = !!formData?.emailNotify;
      const statusEmailNotify = formData?.statusEmailNotify !== false;
      const isAnonymous = !!formData?.isAnonymous;

      const newTicket = await ticketService?.createTicket({
        description: formData?.description,
        location: formData?.location,
        workflowType: formData?.workflow,
        severity: formData?.severity,
        reporterLanguage: i18n?.resolvedLanguage || i18n?.language || 'en',
        reporterEmail: email || null,
        reporterName: String(formData?.reporterName || '').trim() || null,
        reporterPhone: String(formData?.reporterPhone || '').trim() || null,
        emailNotify,
        statusEmailNotify,
        isAnonymous,
      });

      if (formData?.files?.length) {
        for (const file of formData.files) {
          await ticketService?.uploadAttachment(newTicket?.id, file);
        }
      }

      const selectedWorkflow = workflows?.find(w => w?.code === formData?.workflow);
      const selectedSeverity = severities?.find(s => s?.code === formData?.severity);

      const ticketWithDetails = {
        ...newTicket,
        workflow: getLocalizedWorkflowName(selectedWorkflow) || formData?.workflow,
        severity: selectedSeverity?.label || formData?.severity,
        location: formData?.location || null,
        attachmentCount: formData?.files?.length || 0,
      };

      sessionStorage.setItem('new_ticket', JSON.stringify(ticketWithDetails));
      navigate('/report-confirmation', { state: { ticket: ticketWithDetails } });
    } catch (err) {
      setError(t('reportForm.errorSubmitting'));
      console.error('Error submitting report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFilesAdd = (newFiles) => {
    setFormData(prev => ({
      ...prev,
      files: [...prev?.files, ...newFiles]
    }));
  };

  const handleFileRemove = (index) => {
    setFormData(prev => ({
      ...prev,
      files: prev?.files?.filter((_, i) => i !== index)
    }));
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
  };

  const getPreviewType = (file) => {
    const ext = file?.name?.split('.')?.pop()?.toLowerCase();
    const mime = file?.type || '';
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mime.startsWith('text/') || ['txt', 'csv', 'log', 'json', 'md'].includes(ext)) return 'text';
    return 'unsupported';
  };

  const closeReviewPreview = () => {
    setReviewPreviewFile(null);
    setReviewPreviewType(null);
    setReviewPreviewText('');
    setReviewPreviewUrl('');
  };

  const handleReviewPreview = async (file) => {
    if (reviewPreviewUrl) URL.revokeObjectURL(reviewPreviewUrl);
    const type = getPreviewType(file);
    setReviewPreviewFile(file);
    setReviewPreviewType(type);
    setReviewPreviewText('');
    setReviewPreviewUrl('');

    if (type === 'text') {
      try {
        const textContent = await file.text();
        setReviewPreviewText(textContent);
      } catch {
        setReviewPreviewText(t('reportForm.previewUnavailable'));
      }
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      setReviewPreviewUrl(objectUrl);
    } catch {
      setReviewPreviewUrl('');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="FolderOpen" size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step1Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step1Description')}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <WorkflowSelector
                  value={formData?.workflow}
                  onChange={(value) => {
                    setFormData(prev => ({ ...prev, workflow: value }));
                    setErrors(prev => ({ ...prev, workflow: null }));
                  }}
                  workflows={workflows}
                  error={errors?.workflow}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="FileText" size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step2Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step2Description')}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <DescriptionField
                  value={formData?.description}
                  onChange={(value) => {
                    setFormData(prev => ({ ...prev, description: value }));
                    setErrors(prev => ({ ...prev, description: null }));
                  }}
                  error={errors?.description}
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="MapPin" size={24} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step3Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step3Description')}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <LocationField
                  value={formData?.location}
                  onChange={(value) => {
                    setFormData(prev => ({ ...prev, location: value }));
                    setErrors(prev => ({ ...prev, location: null }));
                  }}
                  error={errors?.location}
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="User" size={24} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step4Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step4Description')}
                  </p>
                </div>
              </div>

              {/* <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-6 flex items-start gap-2">
                <Icon name="ShieldCheck" size={18} className="text-accent mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{t('reportForm.contactRequiredHelp')}</p>
              </div> */}

              <div className="border-t border-border pt-6">
                <ReporterContactFields
                  name={formData?.reporterName}
                  email={formData?.reporterEmail}
                  phone={formData?.reporterPhone}
                  isAnonymous={formData?.isAnonymous}
                  onAnonymousChange={(value) => setFormData(prev => ({ ...prev, isAnonymous: value }))}
                  emailError={errors?.reporterEmail}
                  onNameChange={(value) => setFormData(prev => ({ ...prev, reporterName: value }))}
                  onEmailChange={(value) => setFormData(prev => ({ ...prev, reporterEmail: value }))}
                  onPhoneChange={(value) => setFormData(prev => ({ ...prev, reporterPhone: value }))}
                />
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="Paperclip" size={24} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step5Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step5Description')}
                  </p>
                </div>
              </div>

              {/* <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-6 flex items-start gap-2">
                <Icon name="Info" size={18} className="text-accent mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{t('reportForm.step5Optional')}</p>
              </div> */}

              <div className="border-t border-border pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <FileAttachmentArea
                      files={formData?.files}
                      onFilesAdd={handleFilesAdd}
                      onFileRemove={handleFileRemove}
                      error={errors?.attachments}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Icon name="CheckCircle2" size={16} className="text-success" />
                        {t('reportForm.supportedFormats')}
                      </h3>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>PDF</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>JPEG</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>PNG</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>DOC</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>DOCX</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>TXT</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Icon name="Info" size={16} className="text-primary" />
                        {t('reportForm.fileRequirements')}
                      </h3>
                      <ul className="space-y-2 text-xs text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <Icon name="Check" size={14} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{t('reportForm.maxFileSize')}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Icon name="Check" size={14} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{t('reportForm.multipleFilesAllowed')}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Icon name="Check" size={14} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{t('reportForm.filesStoredSecurely')}</span>
                        </li>
                      </ul>
                    </div>

                    {formData?.files?.length > 0 && (
                      <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                          <Icon name="CheckCircle2" size={16} className="text-success" />
                          {formData.files.length} {t('reportForm.filesReady')}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {t('reportForm.filesWillBeUploaded')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 6:
        const selectedWorkflow = workflows?.find(w => w?.code === formData?.workflow);
        const selectedWorkflowLabel = getLocalizedWorkflowName(selectedWorkflow);
        const isAnonymous = !!formData?.isAnonymous;
        const descriptionText = formData?.description || '';
        const shouldTruncateDescription = descriptionText.length > DESCRIPTION_PREVIEW_LENGTH;
        const visibleDescription = shouldTruncateDescription && !showFullDescription
          ? `${descriptionText.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...`
          : descriptionText;

        return (
          <div className="max-w-6xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="CheckCircle2" size={24} className="text-success" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground">
                    {t('reportForm.step6Title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('reportForm.step6Description')}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('reportForm.incidentType')}</p>
                      <p className="text-lg font-semibold text-foreground">{selectedWorkflowLabel}</p>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('reportForm.location')}</p>
                      <div className="flex items-start gap-2">
                        <Icon name="MapPin" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-foreground">{formData?.location}</p>
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {t('reportForm.contactOptional')}
                      </p>
                      <div className="space-y-2">
                        {formData?.reporterEmail && (
                          <div className="flex items-center gap-2">
                            <Icon name="Mail" size={14} className="text-muted-foreground" />
                            <p className="text-sm text-foreground">{formData.reporterEmail}</p>
                          </div>
                        )}
                        {!isAnonymous && formData?.reporterName && (
                          <div className="flex items-center gap-2">
                            <Icon name="User" size={14} className="text-muted-foreground" />
                            <p className="text-sm text-foreground">{formData.reporterName}</p>
                          </div>
                        )}
                        {!isAnonymous && formData?.reporterPhone && (
                          <div className="flex items-center gap-2">
                            <Icon name="Phone" size={14} className="text-muted-foreground" />
                            <p className="text-sm text-foreground">{formData.reporterPhone}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="Paperclip" size={14} className="text-primary" />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('reportForm.attachments')}</p>
                      </div>
                      {formData?.files?.length > 0 ? (
                        <div className="space-y-2">
                          {formData.files.map((file, index) => (
                            <div key={`${file?.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/70 p-2.5">
                              <div className="min-w-0">
                                <p className="text-sm text-foreground truncate">{file?.name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(file?.size)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleReviewPreview(file)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                              >
                                <Icon name="Eye" size={14} />
                                <span>{t('reportForm.preview')}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t('ticketDetails.noAttachments')}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Icon name="FileText" size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('reportForm.description')}</p>
                          <p className="text-sm font-semibold text-foreground">{t('reportForm.reviewSubmit')}</p>
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap rounded-md bg-card/70 border border-border p-3">
                        {visibleDescription}
                      </p>
                      {shouldTruncateDescription && (
                        <button
                          type="button"
                          onClick={() => setShowFullDescription(prev => !prev)}
                          className="mt-2 text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                        >
                          {showFullDescription ? t('reportForm.closeText') : t('reportForm.openText')}
                        </button>
                      )}
                    </div>

                    {isAnonymous && (
                      <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <Icon name="ShieldCheck" size={20} className="text-accent flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-1">{t('reportForm.anonymousReport')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('reportForm.anonymousDescription')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {formData?.reporterEmail && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <EmailNotificationToggle
                          checked={formData?.emailNotify}
                          onChange={(e) => setFormData(prev => ({ ...prev, emailNotify: e?.target?.checked }))}
                          statusChecked={formData?.statusEmailNotify}
                          onStatusChange={(e) => setFormData(prev => ({ ...prev, statusEmailNotify: e?.target?.checked }))}
                          disabled={!formData?.reporterEmail}
                          statusDisabled={!formData?.reporterEmail || !formData?.emailNotify}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isOptionalStep = currentStep === 4 || currentStep === 5;

  return (
    <>
      <AnonymousNavHeader />
      <div className="min-h-screen bg-background pt-24">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 lg:px-12">
          {/* Page Title */}
          <div className="text-center mb-8 mt-8">
            <h1 className="text-4xl md:text-5xl font-bold text-sky-600 mb-3">
              {t('reportForm.pageTitle')}
            </h1>
            <p className="text-md text-muted-foreground max-w-2xl mx-auto">
              {t('reportForm.pageSubtitle')}
            </p>
          </div>

          {/* Visual Timeline / Stepper */}
          <div className="mb-10">
            <div className="max-w-4xl mx-auto">
              {/* Desktop Timeline */}
              <div className="hidden md:block">
                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute top-6 left-0 right-0 h-0.5 bg-border" style={{ zIndex: 0 }}></div>
                  <div
                    className="absolute top-6 left-0 h-0.5 bg-primary transition-all duration-500"
                    style={{
                      width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
                      zIndex: 1
                    }}
                  ></div>

                  {/* Steps */}
                  <div className="relative flex justify-between" style={{ zIndex: 2 }}>
                    {STEPS.map((step) => {
                      const isCompleted = currentStep > step.id;
                      const isCurrent = currentStep === step.id;

                      return (
                        <div key={step.id} className="flex flex-col items-center" style={{ width: `${100 / STEPS.length}%` }}>
                          {/* Step Circle */}
                          <div
                            className={`
                              w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-all duration-300
                              ${isCurrent ? 'bg-primary text-white shadow-lg scale-110' : ''}
                              ${isCompleted ? 'bg-primary text-white' : ''}
                              ${!isCurrent && !isCompleted ? 'bg-card border-2 border-border text-muted-foreground' : ''}
                            `}
                          >
                            {isCompleted && !isCurrent ? (
                              <Icon name="Check" size={20} />
                            ) : (
                              <Icon name={step.icon} size={20} />
                            )}
                          </div>

                          {/* Step Label */}
                          <div className="text-center max-w-[120px]">
                            <p className={`text-sm font-semibold mb-1 ${isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {t(step.name)}
                            </p>
                            <p className={`text-xs ${isCurrent ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                              {t(step.desc)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Mobile Timeline */}
              <div className="md:hidden">
                <div className="flex items-center justify-center gap-2 mb-4">
                  {STEPS.map((step) => {
                    const isCompleted = currentStep > step.id;
                    const isCurrent = currentStep === step.id;

                    return (
                      <div
                        key={step.id}
                        className={`
                          w-2 h-2 rounded-full transition-all duration-300
                          ${isCurrent ? 'bg-primary w-8' : ''}
                          ${isCompleted ? 'bg-primary' : ''}
                          ${!isCurrent && !isCompleted ? 'bg-border' : ''}
                        `}
                      />
                    );
                  })}
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground mb-1">
                    {t(STEPS[currentStep - 1].name)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('reportForm.step')} {currentStep} {t('reportForm.of')} {STEPS.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 max-w-3xl mx-auto bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Step content */}
          <div className="mb-8">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="btn-outline h-14 px-5 text-muted-foreground hover:text-foreground"
                >
                  <Icon name="ArrowLeft" size={18} />
                  <span>{t('reportForm.back')}</span>
                </button>
              )}

              <div className="flex-1">
                {currentStep < STEPS.length ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full btn-sky-600 h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-shadow"
                  >
                    <span>{t('reportForm.continue')}</span>
                    <Icon name="ChevronRight" size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full btn-sky-600"
                  >
                    {isSubmitting ? (
                      <>
                        <Icon name="Loader" size={20} className="animate-spin" />
                        <span>{t('reportForm.submitting')}</span>
                      </>
                    ) : (
                      <>
                        <Icon name="Send" size={20} />
                        <span>{t('reportForm.submitReport')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {isOptionalStep && (
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-muted-foreground hover:text-foreground text-sm underline"
                >
                  {t('reportForm.skipStep')}
                </button>
              </div>
            )}
          </div>

          {/* Privacy note */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground max-w-2xl mx-auto">
              {t('reportForm.privacyNote')}
            </p>
          </div>
        </div>
      </div>
      {reviewPreviewFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={closeReviewPreview}>
          <div className="w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground truncate">{reviewPreviewFile?.name}</p>
              <button
                type="button"
                onClick={closeReviewPreview}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[80vh]">
              {reviewPreviewType === 'image' && reviewPreviewUrl && (
                <img src={reviewPreviewUrl} alt={reviewPreviewFile?.name} className="max-w-full mx-auto rounded-md" />
              )}
              {reviewPreviewType === 'pdf' && reviewPreviewUrl && (
                <iframe title={reviewPreviewFile?.name} src={reviewPreviewUrl} className="w-full h-[70vh] rounded-md border border-border" />
              )}
              {reviewPreviewType === 'text' && (
                <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 border border-border rounded-md p-4">
                  {reviewPreviewText}
                </pre>
              )}
              {reviewPreviewType === 'unsupported' && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">{t('reportForm.noInlinePreview')}</p>
                  {reviewPreviewUrl && (
                    <a
                      href={reviewPreviewUrl}
                      download={reviewPreviewFile?.name}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      {t('reportForm.openOrDownloadFile')}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
