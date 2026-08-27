import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AnonymousNavHeader from '../components/navigation/AnonymousNavHeader';
import Icon from '../components/AppIcon';
import { guestAccessService } from '../services/guestAccessService';
import { toDateSafe } from '../utils/slaUtils';
import { RichTextMessage } from '../utils/richTextMessage';

const fmt = (value) => {
  if (!value) return '-';
  const d = toDateSafe(value);
  if (!d) return '-';
  return d.toLocaleString();
};

export default function GuestTicketViewPage() {
  const { token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guest, setGuest] = useState(null);
  const [ticket, setTicket] = useState(null);
  const attemptedTokenRef = useRef('');

  const load = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await guestAccessService.fetchGuestTicket(token);
      setGuest(data?.guest || null);
      setTicket(data?.ticket || null);
      setError('');
    } catch (err) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('already been used')) {
        setError('Deze gedeelde link is al gebruikt. Vraag de behandelaar om een nieuwe link.');
      } else if (message.toLowerCase().includes('expired')) {
        setError('Deze gedeelde link is verlopen. Vraag de behandelaar om een nieuwe link.');
      } else {
        setError(message || 'Failed to load guest case');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || attemptedTokenRef.current === token) return;
    attemptedTokenRef.current = token;
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const messages = useMemo(() => {
    const rows = Array.isArray(ticket?.messages) ? ticket.messages : [];
    return [...rows].sort((a, b) => {
      const at = toDateSafe(a?.created_at || a?.createdAt)?.getTime() || 0;
      const bt = toDateSafe(b?.created_at || b?.createdAt)?.getTime() || 0;
      return at - bt;
    });
  }, [ticket?.messages]);

  return (
    <>
      <AnonymousNavHeader />
      <div className="min-h-screen app-page-gradient bg-background pt-24 sm:pt-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <h1 className="text-2xl font-semibold text-foreground">Anonieme Ticketweergave</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Alleen-lezen toegang via gedeelde link. Interne notities en behandelaargegevens blijven verborgen.
            </p>
            {guest && (
              <div className="mt-3 text-sm text-muted-foreground">
                <div>Role: {guest?.role || '-'}</div>
                <div>Expires: {fmt(guest?.expires_at)}</div>
                <div>Opened: {fmt(guest?.consumed_at)}</div>
              </div>
            )}
          </div>

          {loading && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              Loading...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && ticket && (
            <>
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  Ticket {ticket?.ticket_number || ticket?.id}
                </div>
                <div className="text-sm text-muted-foreground">
                  Status: {ticket?.status_code || '-'} | Workflow: {ticket?.workflow_type || '-'} | Priority: {ticket?.severity_code || '-'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Submitted: {fmt(ticket?.submitted_at)} | Last update: {fmt(ticket?.last_update_at)}
                </div>
                <div className="pt-2 text-sm text-foreground whitespace-pre-wrap">
                  {ticket?.description || '-'}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">Messages</h2>
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                  {messages.map((msg) => (
                    <div key={msg?.id || `${msg?.created_at}_${msg?.body}`} className="rounded border border-border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium">{msg?.sender || 'unknown'}</span>
                        <span className="text-xs text-muted-foreground">{fmt(msg?.created_at)}</span>
                      </div>
                      <RichTextMessage value={msg?.body || '-'} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">Attachments</h2>
                <div className="space-y-2">
                  {(ticket?.attachments || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No attachments available.</p>
                  )}
                  {(ticket?.attachments || []).map((att) => (
                    <a
                      key={att?.id || `${att?.file_name}_${att?.created_at}`}
                      href={att?.file_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm hover:bg-muted/20"
                    >
                      <span className="truncate flex items-center gap-2">
                        <Icon name="Paperclip" size={14} />
                        {att?.file_name || '-'}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmt(att?.created_at)}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground flex items-start gap-2">
                <Icon name="Lock" size={16} className="mt-0.5 text-warning" />
                <span>Deze link is nu gebruikt en kan niet opnieuw worden geopend.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
