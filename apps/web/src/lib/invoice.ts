import { tg } from './tg';

/**
 * Open a Telegram Stars invoice.
 *
 * Extracted so the wallet and the donation panel share one path —
 * duplicating the WebApp lookup meant one of them would eventually
 * drift. Outside Telegram (a dev browser) there is no invoice UI, so it
 * falls back to opening the link.
 */
export function openInvoiceUrl(invoiceUrl: string, onPaid?: () => void): void {
  const openInvoice = (window as unknown as {
    Telegram?: { WebApp?: { openInvoice?: (url: string, cb: (s: string) => void) => void } };
  }).Telegram?.WebApp?.openInvoice;

  if (!openInvoice) {
    window.open(invoiceUrl, '_blank');
    return;
  }
  openInvoice(invoiceUrl, (status) => {
    if (status === 'paid') {
      tg.notify('success');
      onPaid?.();
    }
  });
}
