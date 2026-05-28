import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import { toDateSafe } from '../../../utils/slaUtils';

const CommunicationPanel = ({ initialMessages = [], onSendMessage }) => {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const formatDate = (date) => {
    if (!date) return '';
    const d = toDateSafe(date);
    if (!d) return '';
    return d.toLocaleDateString(i18n?.resolvedLanguage || i18n?.language || undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const handleSend = async () => {
    const content = newMessage.trim();
    if (!content || isSending) return;

    try {
      setIsSending(true);

      const optimisticMessage = {
        from: 'reporter',
        timestamp: new Date().toISOString(),
        message: content,
        isRead: false,
        sending: true,
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setNewMessage('');

      if (onSendMessage) await onSendMessage(content);

      setMessages((prev) => prev.map((msg) => (msg.sending ? { ...msg, sending: false } : msg)));
    } catch (sendError) {
      console.error('Error sending message:', sendError);
      setMessages((prev) => prev.filter((msg) => !msg.sending));
      setNewMessage(content);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col h-[560px]">
      <div className="p-4 md:p-5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="MessageSquare" size={18} color="var(--color-primary)" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground">{t('ticketDetails.communication')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('ticketDetailsView.communication.help')}
            </p>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-success/10 border border-success/20">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            <span className="text-xs font-medium text-success">{t('ticketDetailsView.communication.secured')}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
              <Icon name="MessageSquare" size={28} className="text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">{t('ticketDetails.noMessages')}</p>
              <p className="text-xs text-muted-foreground">{t('ticketDetailsView.communication.startBySending')}</p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isReporter = msg.from === 'reporter';
            const isHandler = msg.from === 'handler';

            return (
              <div key={`${msg?.timestamp || 'msg'}-${index}`} className={`flex ${isReporter ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[80%] ${isReporter ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isReporter ? 'bg-primary/20' : isHandler ? 'bg-success/20' : 'bg-muted'
                    }`}
                  >
                    <Icon
                      name={isReporter ? 'User' : isHandler ? 'UserCheck' : 'Bot'}
                      size={16}
                      className={isReporter ? 'text-primary' : isHandler ? 'text-success' : 'text-muted-foreground'}
                    />
                  </div>

                  <div className={`flex flex-col gap-1 ${isReporter ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-medium text-foreground">
                        {isReporter
                          ? t('ticketDetailsView.communication.you')
                          : isHandler
                          ? (msg?.senderName || t('ticketDetailsView.communication.handler'))
                          : t('ticketDetailsView.activity.system')}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(msg.timestamp)}</span>
                    </div>

                    <div
                      className={`px-4 py-3 rounded-2xl ${
                        isReporter
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : isHandler
                          ? 'bg-muted border border-border rounded-tl-sm'
                          : 'bg-muted/50 border border-border rounded-tl-sm'
                      }`}
                    >
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isReporter ? 'text-primary-foreground' : 'text-foreground'}`}>
                        {msg.message}
                      </p>

                      {msg.sending && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary-foreground/20">
                          <div className="w-1 h-1 rounded-full bg-primary-foreground/60 animate-pulse"></div>
                          <span className="text-xs text-primary-foreground/80">
                            {t('ticketDetailsView.communication.sending')}
                          </span>
                        </div>
                      )}
                    </div>

                    {isReporter && msg.isRead && (
                      <div className="px-1 flex items-center gap-1">
                        <Icon name="CheckCheck" size={12} className="text-success" />
                        <span className="text-xs text-success">{t('ticketDetailsView.communication.read')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 md:p-5 border-t border-border bg-muted/10">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="Lock" size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('ticketDetails.privacyReminder')}</span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('ticketDetailsView.communication.messagePlaceholder')}
              disabled={isSending}
              rows={1}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">{newMessage.length}/1000</div>
          </div>

          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="flex-shrink-0 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Icon name="Send" size={16} />
            <span className="hidden sm:inline">{t('ticketDetailsView.common.send')}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5" type="button">
            <Icon name="Paperclip" size={14} />
            <span className="hidden sm:inline">{t('ticketDetailsView.communication.addAttachment')}</span>
          </button>
          <div className="text-xs text-muted-foreground">
            {t('ticketDetailsView.communication.messageHotkeyHint')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunicationPanel;
