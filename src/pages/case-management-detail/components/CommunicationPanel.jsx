import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const CommunicationPanel = ({ messages, canContact, onSendMessage }) => {
  const { t } = useTranslation();
  const [isComposing, setIsComposing] = useState(false);
  const [messageText, setMessageText] = useState('');

  const scrollerRef = useRef(null);
  const safeMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [safeMessages.length, isComposing]);

  const handleSendMessage = () => {
    if (messageText?.trim()) {
      onSendMessage(messageText);
      setMessageText('');
      setIsComposing(false);
    }
  };

  const handleCancel = () => {
    setMessageText('');
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
            <Button variant="outline" size="sm" iconName="Plus" iconPosition="left" onClick={() => setIsComposing(true)}>
              {t('caseManagementDetail.common.new')}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        {!canContact ? (
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
                  const isHandler = message?.sender === 'handler';

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
                              <Icon name="UserCircle" size={12} />
                              <span>{t('caseManagement.reporter')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Icon name="User" size={12} />
                              <span className="truncate max-w-[140px]">
                                {message?.senderName || t('caseManagement.handler')}
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
                          <p className="text-sm leading-snug whitespace-pre-wrap break-words">{message?.content}</p>

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
                  <Input
                    label={t('caseManagementDetail.communication.messageLabel')}
                    type="text"
                    placeholder={t('caseManagementDetail.communication.messagePlaceholder')}
                    value={messageText}
                    onChange={(e) => setMessageText(e?.target?.value)}
                    description=""
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      iconName="Send"
                      iconPosition="left"
                      onClick={handleSendMessage}
                      disabled={!messageText?.trim()}
                    >
                      {t('caseManagementDetail.common.send')}
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleCancel}>
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
