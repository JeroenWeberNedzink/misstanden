import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../components/navigation/AnonymousNavHeader';
import Button from '../components/ui/Button';
import Icon from '../components/AppIcon';
import { reporterReplyService } from '../services/reporterReplyService';
import { toDateSafe } from '../utils/slaUtils';

const formatDate = (value, locale) => {
  if (!value) return '-';
  const d = toDateSafe(value);
  if (!d) return '-';
  return d.toLocaleString(locale || undefined);
};

export default function ReporterReplyPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const locale = i18n?.resolvedLanguage || i18n?.language;

  const loadThread = useCallback(async () => {
    if (!token) return;
    try {
      const data = await reporterReplyService.getThread(token);
      setThread(data?.ticket || null);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load secure reply thread');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) {
        setError('Missing secure token');
        setLoading(false);
        return;
      }
      try {
        const data = await reporterReplyService.validateToken(token);
        if (!mounted) return;
        setThread(data?.ticket || null);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || 'Failed to validate secure token');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const id = window.setInterval(() => {
      loadThread().catch(() => {});
    }, 30000);
    return () => window.clearInterval(id);
  }, [loadThread, token]);

  const sortedMessages = useMemo(() => {
    const rows = Array.isArray(thread?.messages) ? thread.messages : [];
    return [...rows].sort((a, b) => {
      const at = toDateSafe(a?.created_at || a?.createdAt)?.getTime() || 0;
      const bt = toDateSafe(b?.created_at || b?.createdAt)?.getTime() || 0;
      return at - bt;
    });
  }, [thread?.messages]);

  const handleSend = async () => {
    const body = String(message || '').trim();
    if (!body || !token) return;
    try {
      setSending(true);
      await reporterReplyService.sendMessage(token, body);
      setMessage('');
      await loadThread();
    } catch (err) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handlePickFiles = () => {
    fileInputRef.current?.click();
  };

  const handleUploadFiles = async (evt) => {
    const files = Array.from(evt?.target?.files || []);
    if (!files.length || !token) return;
    try {
      setUploading(true);
      for (const file of files) {
        await reporterReplyService.uploadAttachment(token, file);
      }
      await loadThread();
    } catch (err) {
      setError(err?.message || 'Failed to upload attachment');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <AnonymousNavHeader />
      <div className="min-h-screen app-page-gradient bg-background pt-24 sm:pt-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  {t('reporterReply.title', { defaultValue: 'Secure Reply Channel' })}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('reporterReply.subtitle', { defaultValue: 'Continue communication about your report without revealing identity.' })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <Icon name="Shield" size={14} />
                {t('reporterReply.secure', { defaultValue: 'Secure token' })}
              </span>
            </div>

            {thread && (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <div>{t('reporterReply.ticket', { defaultValue: 'Ticket' })}: <span className="font-mono">{thread?.ticket_number || '-'}</span></div>
                <div>{t('reporterReply.status', { defaultValue: 'Status' })}: {thread?.status_code || '-'}</div>
              </div>
            )}

            {loading && (
              <div className="py-10 text-center text-muted-foreground">
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {!loading && !error && (
              <>
                <div className="rounded-xl border border-border p-3 md:p-4 max-h-[360px] overflow-auto space-y-3">
                  {sortedMessages.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t('reporterReply.noMessages', { defaultValue: 'No messages yet.' })}
                    </p>
                  )}
                  {sortedMessages.map((msg) => {
                    const fromHandler = String(msg?.sender || '').toLowerCase() === 'handler';
                    return (
                      <div
                        key={msg?.id || `${msg?.created_at}_${msg?.body?.slice(0, 20)}`}
                        className={`rounded-lg px-3 py-2 text-sm ${fromHandler ? 'bg-primary/10' : 'bg-muted/40'}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-foreground">
                            {fromHandler
                              ? t('reporterReply.handler', { defaultValue: 'Case handler' })
                              : t('reporterReply.you', { defaultValue: 'You' })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(msg?.created_at, locale)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-foreground">{msg?.body || '-'}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-input bg-white text-black px-3 py-2 text-sm"
                    placeholder={t('reporterReply.messagePlaceholder', { defaultValue: 'Type your message...' })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSend} loading={sending} disabled={sending || !String(message || '').trim()}>
                      {t('reporterReply.send', { defaultValue: 'Send message' })}
                    </Button>
                    <Button variant="outline" onClick={handlePickFiles} loading={uploading} disabled={uploading}>
                      {t('reporterReply.addAttachment', { defaultValue: 'Add attachment' })}
                    </Button>
                    <Button variant="ghost" onClick={loadThread}>
                      {t('common.refresh', { defaultValue: 'Refresh' })}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={handleUploadFiles}
                  />
                </div>

                {Array.isArray(thread?.attachments) && thread.attachments.length > 0 && (
                  <div className="rounded-xl border border-border p-3 md:p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-2">
                      {t('reporterReply.attachments', { defaultValue: 'Attachments' })}
                    </h2>
                    <div className="space-y-2">
                      {thread.attachments.map((att) => (
                        <a
                          key={att?.id || `${att?.file_name}_${att?.created_at}`}
                          href={att?.file_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm hover:bg-muted/30"
                        >
                          <span className="truncate">{att?.file_name || '-'}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(att?.created_at, locale)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
