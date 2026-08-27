import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import RichTextEditor from '../../../components/ui/RichTextEditor';
import { RichTextMessage, richTextMessageToPlainText } from '../../../utils/richTextMessage';
import TimelinePendingItem from './TimelinePendingItem';

const CommunicationPanel = ({ messages, canContact, onSendMessage, isLoading = false }) => {
  const { t } = useTranslation();
  const [isComposing, setIsComposing] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [discloseHandlerIdentity, setDiscloseHandlerIdentity] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const scrollerRef = useRef(null);
  const submitInFlightRef = useRef(false);
  const safeMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [safeMessages.length, isComposing]);

  const handleSendMessage = async () => {
    if (richTextMessageToPlainText(messageText).trim() && !submitInFlightRef.current) {
      try {
        submitInFlightRef.current = true;
        setIsSubmitting(true);
        await onSendMessage(messageText, { discloseHandlerIdentity });
      } catch {
        return;
      } finally {
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
      setMessageText('');
      setDiscloseHandlerIdentity(false);
      setIsComposing(false);
    }
  };

  const handleCancel = () => {
    setMessageText('');
    setDiscloseHandlerIdentity(false);
    setIsComposing(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Icon name="MessageSquare" size={16} />
            </div>

            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {t('ticketDetails.communication')}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                  <Icon name={canContact ? 'ShieldCheck' : 'ShieldAlert'} size={13} />
                  {canContact
                    ? t('caseManagementDetail.communication.secureChat')
                    : t('caseManagementDetail.communication.noContact')}
                </span>

                {canContact ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                    <Icon name="Lock" size={13} />
                    {t('caseManagementDetail.communication.encryption')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                    <Icon name="UserX" size={13} />
                    {t('caseManagementDetail.communication.fullyAnonymous')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {canContact && !isComposing && (
            <Button
              variant="outline"
              size="sm"
              iconName="Plus"
              iconPosition="left"
              onClick={() => setIsComposing(true)}
              disabled={isLoading}
            >
              {t('caseManagementDetail.common.new')}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
            <div className="h-10 rounded-md bg-muted animate-pulse" />
            <div className="h-10 rounded-md bg-muted animate-pulse" />
            <div className="h-10 rounded-md bg-muted animate-pulse" />
          </div>
        ) : !canContact ? (
          <div className="rounded-lg border border-border bg-muted/25 px-4 py-4 text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-background/70 border border-border flex items-center justify-center">
              <Icon name="ShieldAlert" size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('caseManagementDetail.communication.anonymousNoDirect')}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
            <div ref={scrollerRef} className="h-[280px] md:h-[340px] overflow-auto px-3 py-3 space-y-2">
              {safeMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-background/70 border border-border flex items-center justify-center">
                      <Icon name="MessageSquare" size={20} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('ticketDetails.noMessages')}</p>
                    {!isComposing && (
                      <p className="text-xs text-muted-foreground mt-1">{t('caseManagementDetail.communication.startBySending')}</p>
                    )}
                  </div>
                </div>
              ) : (
                safeMessages.map((message) => {
                  if (message?.pending) return <TimelinePendingItem key={message?.id} variant="message" />;
                  const isHandler = message?.sender === 'handler';
                  const handlerPublicName = String(
                    message?.senderName || message?.handlerName || message?.handler_name || ''
                  ).trim();
                  const isHandlerIdentityVisible = isHandler && handlerPublicName.length > 0;

                  return (
                    <div key={message?.id} className={['flex', isHandler ? 'justify-end' : 'justify-start'].join(' ')}>
                      <div className="max-w-[88%] md:max-w-[70%]">
                        <div
                          className={[
                            'mb-1 flex items-center gap-2 text-[11px] text-muted-foreground',
                            isHandler ? 'justify-end' : 'justify-start',
                          ].join(' ')}
                        >
                          {!isHandler ? (
                            <span className="inline-flex items-center gap-1">
                              <Icon name="User" size={12} />
                              <span className="truncate max-w-[180px]">
                                {message?.senderName || t('caseManagement.reporter')}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <Icon name={isHandlerIdentityVisible ? 'User' : 'UserX'} size={12} />
                              <span className="truncate max-w-[150px]">
                                {isHandlerIdentityVisible
                                  ? handlerPublicName
                                  : t('caseManagementDetail.communication.anonymousHandler')}
                              </span>
                              <span className="hidden sm:inline-flex shrink-0 rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] leading-none">
                                {isHandlerIdentityVisible
                                  ? t('caseManagementDetail.communication.nameVisibleToReporter')
                                  : t('caseManagementDetail.communication.nameHiddenFromReporter')}
                              </span>
                            </span>
                          )}

                          <span className="opacity-70">|</span>
                          <span className="opacity-70">{message?.timestamp}</span>
                        </div>

                        <div
                          className={[
                            'rounded-xl px-3 py-2 border',
                            isHandler
                              ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-md'
                              : 'bg-background/70 text-foreground border-border rounded-tl-md',
                          ].join(' ')}
                        >
                          <RichTextMessage value={message?.content} className="text-sm leading-snug" />

                          {isHandler && message?.read && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-90">
                              <Icon name="CheckCheck" size={12} />
                              <span>{t('caseManagementDetail.communication.read')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-border bg-background/50 px-3 py-3">
              {isComposing ? (
                <div className="space-y-2">
                  <RichTextEditor
                    label={t('caseManagementDetail.communication.messageLabel')}
                    placeholder={t('caseManagementDetail.communication.messagePlaceholder')}
                    value={messageText}
                    onChange={setMessageText}
                    disabled={isSubmitting}
                  />
                  <label
                    className={[
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      discloseHandlerIdentity
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-muted/20',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                      checked={discloseHandlerIdentity}
                      onChange={(e) => setDiscloseHandlerIdentity(Boolean(e?.target?.checked))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Icon name={discloseHandlerIdentity ? 'Eye' : 'UserX'} size={14} />
                        <span>
                          {discloseHandlerIdentity
                            ? t('caseManagementDetail.communication.identityDisclosedTitle')
                            : t('caseManagementDetail.communication.identityAnonymousTitle')}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {discloseHandlerIdentity
                          ? t('caseManagementDetail.communication.identityDisclosedDescription')
                          : t('caseManagementDetail.communication.identityAnonymousDescription')}
                      </span>
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      iconName={isSubmitting ? 'Loader' : 'Send'}
                      iconPosition="left"
                      onClick={handleSendMessage}
                      disabled={isSubmitting || !richTextMessageToPlainText(messageText).trim()}
                    >
                      {isSubmitting ? t('caseManagementDetail.communication.sending') : t('caseManagementDetail.common.send')}
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSubmitting}>
                      {t('common.cancel')}
                    </Button>

                    <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Icon name="Lock" size={13} />
                      <span>{t('caseManagementDetail.communication.secured')}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {safeMessages.length > 0
                      ? t('caseManagementDetail.communication.replyPrompt')
                      : t('caseManagementDetail.communication.startPrompt')}
                  </p>

                  <Button variant="outline" size="sm" iconName="PenLine" iconPosition="left" onClick={() => setIsComposing(true)}>
                    {t('caseManagementDetail.communication.write')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunicationPanel;
