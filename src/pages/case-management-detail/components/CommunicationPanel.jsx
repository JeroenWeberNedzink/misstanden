import React, { useMemo, useRef, useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

const CommunicationPanel = ({ messages, canContact, onSendMessage }) => {
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
      {/* Header (compact) */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Icon name="MessageSquare" size={16}/>
            </div>

            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                Communicatie
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                  <Icon name={canContact ? 'ShieldCheck' : 'ShieldAlert'} size={13} />
                  {canContact ? 'Beveiligde chat' : 'Geen contact'}
                </span>

                {canContact ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                    <Icon name="Lock" size={13} />
                    End-to-end (app)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-0.5">
                    <Icon name="UserX" size={13} />
                    Volledig anoniem
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
            >
              Nieuw
            </Button>
          )}
        </div>
      </div>

      {/* Body (tight) */}
      <div className="p-4">
        {!canContact ? (
          <div className="rounded-lg border border-border bg-muted/25 px-4 py-4 text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-background/70 border border-border flex items-center justify-center">
              <Icon name="ShieldAlert" size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Deze melding is volledig anoniem. Directe communicatie is niet mogelijk.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
            {/* Chat window (compact) */}
            <div
              ref={scrollerRef}
              className="h-[280px] md:h-[340px] overflow-auto px-3 py-3 space-y-2"
            >
              {safeMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <div>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-background/70 border border-border flex items-center justify-center">
                      <Icon name="MessageSquare" size={20} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Nog geen berichten</p>
                    {!isComposing && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Stuur een bericht om te starten.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                safeMessages.map((message) => {
                  const isHandler = message?.sender === 'handler';

                  return (
                    <div
                      key={message?.id}
                      className={['flex', isHandler ? 'justify-end' : 'justify-start'].join(' ')}
                    >
                      <div className="max-w-[88%] md:max-w-[70%]">
                        {/* Meta (smaller) */}
                        <div
                          className={[
                            'mb-1 flex items-center gap-2 text-[11px] text-muted-foreground',
                            isHandler ? 'justify-end' : 'justify-start',
                          ].join(' ')}
                        >
                          {!isHandler ? (
                            <span className="inline-flex items-center gap-1">
                              <Icon name="UserCircle" size={12} />
                              <span>Melder</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Icon name="User" size={12} />
                              <span className="truncate max-w-[140px]">
                                {message?.senderName || 'Handler'}
                              </span>
                            </span>
                          )}

                          <span className="opacity-70">•</span>
                          <span className="opacity-70">{message?.timestamp}</span>
                        </div>

                        {/* Bubble (compact) */}
                        <div
                          className={[
                            'rounded-xl px-3 py-2 border',
                            isHandler
                              ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-md'
                              : 'bg-background/70 text-foreground border-border rounded-tl-md',
                          ].join(' ')}
                        >
                          <p className="text-sm leading-snug whitespace-pre-wrap break-words">
                            {message?.content}
                          </p>

                          {isHandler && message?.read && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-90">
                              <Icon name="CheckCheck" size={12} />
                              <span>Gelezen</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer (compact footer) */}
            <div className="border-t border-border bg-background/50 px-3 py-3">
              {isComposing ? (
                <div className="space-y-2">
                  <Input
                    label="Bericht"
                    type="text"
                    placeholder="Typ je bericht..."
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
                      Verzenden
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      Annuleren
                    </Button>

                    <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Icon name="Lock" size={13} />
                      <span>Beveiligd</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {safeMessages.length > 0 ? 'Reageer op het gesprek.' : 'Start het gesprek.'}
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    iconName="PenLine"
                    iconPosition="left"
                    onClick={() => setIsComposing(true)}
                  >
                    Schrijven
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