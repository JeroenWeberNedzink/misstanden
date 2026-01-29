import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';

const FormActions = ({ onSubmit, onSaveDraft, isSubmitting, isSavingDraft, hasDraft }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        <Button
          variant="default"
          size="lg"
          fullWidth
          iconName="Send"
          iconPosition="left"
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || isSavingDraft}
        >
          {isSubmitting ? t('reportForm.submitting') : t('reportForm.submitReport')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          fullWidth
          iconName="Save"
          iconPosition="left"
          onClick={onSaveDraft}
          loading={isSavingDraft}
          disabled={isSubmitting || isSavingDraft}
        >
          {isSavingDraft ? t('reportForm.savingDraft') : t('reportForm.saveDraft')}
        </Button>
      </div>

      {hasDraft && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
          <Icon name="CheckCircle" size={16} color="var(--color-success)" />
          <p className="text-sm text-success">
            {t('reportForm.draftSaved')}
          </p>
        </div>
      )}

      <div className="">
        <div className="flex items-start gap-3">
          <Icon name="Info" size={18} color="var(--color-primary)" className="mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">
              {t('reportForm.submitInfo')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormActions;