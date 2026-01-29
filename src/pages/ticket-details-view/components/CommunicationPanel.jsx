import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const CommunicationPanel = ({ ticketId, initialMessages = [], onSendMessage }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update messages when initial messages change
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    try {
      setIsSending(true);

      // Create optimistic message
      const optimisticMessage = {
        from: 'reporter',
        timestamp: new Date().toISOString(),
        message: newMessage.trim(),
        isRead: false,
        sending: true
      };

      // Add to messages immediately for instant feedback
      setMessages(prev => [...prev, optimisticMessage]);
      setNewMessage('');

      // Call parent handler
      if (onSendMessage) {
        await onSendMessage(newMessage.trim());
      }

      // Remove sending flag
      setMessages(prev => prev.map(msg =>
        msg.sending ? { ...msg, sending: false } : msg
      ));

    } catch (error) {
      console.error('Error sending message:', error);
      // Remove failed message
      setMessages(prev => prev.filter(msg => !msg.sending));
      setNewMessage(newMessage); // Restore message
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
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="MessageSquare" size={20} color="var(--color-primary)" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Communicatie
            </h2>
            <p className="text-xs text-muted-foreground">
              Stel vragen of voeg informatie toe
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            <span className="text-xs font-medium text-success">Online</span>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <Icon name="MessageSquare" size={32} className="text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                Nog geen berichten
              </p>
              <p className="text-xs text-muted-foreground">
                Start een gesprek door hieronder een bericht te sturen
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isReporter = msg.from === 'reporter';
            const isHandler = msg.from === 'handler';

            return (
              <div
                key={index}
                className={`flex ${isReporter ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[80%] ${isReporter ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isReporter
                      ? 'bg-primary/20'
                      : isHandler
                      ? 'bg-success/20'
                      : 'bg-muted'
                  }`}>
                    <Icon
                      name={isReporter ? 'User' : isHandler ? 'UserCheck' : 'Bot'}
                      size={16}
                      className={isReporter ? 'text-primary' : isHandler ? 'text-success' : 'text-muted-foreground'}
                    />
                  </div>

                  {/* Message Bubble */}
                  <div className={`flex flex-col gap-1 ${isReporter ? 'items-end' : 'items-start'}`}>
                    {/* Sender & Time */}
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-medium text-foreground">
                        {isReporter ? 'U' : isHandler ? 'Behandelaar' : 'Systeem'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(msg.timestamp)}
                      </span>
                    </div>

                    {/* Message Content */}
                    <div className={`px-4 py-3 rounded-2xl ${
                      isReporter
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : isHandler
                        ? 'bg-muted border border-border rounded-tl-sm'
                        : 'bg-muted/50 border border-border rounded-tl-sm'
                    }`}>
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        isReporter ? 'text-primary-foreground' : 'text-foreground'
                      }`}>
                        {msg.message}
                      </p>

                      {/* Sending indicator */}
                      {msg.sending && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary-foreground/20">
                          <div className="w-1 h-1 rounded-full bg-primary-foreground/60 animate-pulse"></div>
                          <span className="text-xs text-primary-foreground/80">Verzenden...</span>
                        </div>
                      )}
                    </div>

                    {/* Read Status */}
                    {isReporter && msg.isRead && (
                      <div className="px-1 flex items-center gap-1">
                        <Icon name="CheckCheck" size={12} className="text-success" />
                        <span className="text-xs text-success">Gelezen</span>
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

      {/* Message Composer */}
      <div className="p-4 md:p-6 border-t border-border bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="Lock" size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            End-to-end encrypted • Uw privacy is gewaarborgd
          </span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Typ uw bericht..."
              disabled={isSending}
              rows={1}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">
              {newMessage.length}/1000
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="flex-shrink-0 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Icon name="Send" size={16} />
            <span className="hidden sm:inline">Verzenden</span>
          </button>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <Icon name="Paperclip" size={14} />
            <span className="hidden sm:inline">Bestand toevoegen</span>
          </button>
          <div className="text-xs text-muted-foreground">
            Press Enter to send • Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunicationPanel;
