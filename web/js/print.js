// Impression : ticket de caisse (imprimante thermique 80 mm) et facture A4.
import { h, clear, fmtNum, fmtDateTime, PAY_METHODS } from './core.js';

const cur = (s) => s.company?.currency || 'FCFA';
const m = (n, s) => `${fmtNum(n)} ${cur(s)}`;

function doPrint(content) {
  const area = document.getElementById('print-area');
  clear(area, content);
  setTimeout(() => { window.print(); }, 50);
}

export function printTicket(sale) {
  const c = sale.company || {};
  const due = sale.total - sale.paid;
  doPrint(h('div.ticket',
    h('div.t-center.t-title', c.name),
    c.address ? h('div.t-center', c.address) : null,
    c.phone ? h('div.t-center', 'Tél : ' + c.phone) : null,
    c.tax_id ? h('div.t-center', 'NIU : ' + c.tax_id) : null,
    h('hr'),
    h('div', `Ticket : ${sale.number}`), h('div', `Date : ${fmtDateTime(sale.created_at)}`),
    h('div', `Caissier : ${sale.user || ''}`),
    sale.customer ? h('div', `Client : ${sale.customer}`) : null,
    h('hr'),
    h('table', sale.items.map((i) => [
      h('tr', h('td', { colSpan: 2 }, i.name)),
      h('tr', h('td', `  ${fmtNum(i.qty)} x ${fmtNum(i.price)}`), h('td', { style: 'text-align:right' }, fmtNum(i.total))),
    ])),
    h('hr'),
    h('table',
      sale.discount ? h('tr', h('td', 'Remise'), h('td', { style: 'text-align:right' }, '-' + fmtNum(sale.discount))) : null,
      sale.tax ? h('tr', h('td', 'TVA'), h('td', { style: 'text-align:right' }, fmtNum(sale.tax))) : null,
      h('tr.t-total', h('td', 'TOTAL'), h('td', { style: 'text-align:right' }, m(sale.total, sale))),
      h('tr', h('td', 'Payé (' + (PAY_METHODS[sale.payment_method] || '') + ')'), h('td', { style: 'text-align:right' }, fmtNum(sale.paid))),
      sale.received > sale.paid ? h('tr', h('td', 'Reçu'), h('td', { style: 'text-align:right' }, fmtNum(sale.received))) : null,
      sale.received > sale.paid ? h('tr', h('td', 'Monnaie rendue'), h('td', { style: 'text-align:right' }, fmtNum(sale.received - sale.paid))) : null,
      due > 0.001 ? h('tr', h('td', h('b', 'Reste à payer')), h('td', { style: 'text-align:right' }, h('b', fmtNum(due)))) : null),
    sale.status === 'annulee' ? h('div.t-center.t-title', '*** ANNULÉE ***') : null,
    h('hr'),
    h('div.t-center', c.receipt_footer || 'Merci !')));
}

export function printInvoice(sale) {
  const c = sale.company || {};
  const due = sale.total - sale.paid;
  doPrint(h('div.invoice',
    h('div', { style: 'display:flex;justify-content:space-between;gap:20px' },
      h('div', h('h2', { style: 'margin:0' }, c.name), h('div', c.address || ''), h('div', c.phone || ''), h('div', c.email || ''), c.tax_id ? h('div', 'NIU : ' + c.tax_id) : null),
      h('div', { style: 'text-align:right' }, h('h2', { style: 'margin:0' }, 'FACTURE'), h('div', 'N° ' + sale.number), h('div', 'Date : ' + fmtDateTime(sale.created_at)))),
    h('div', { style: 'margin-top:20px;padding:10px;border:1px solid #ccc;width:50%' }, h('b', 'Client : '), sale.customer || 'Client comptoir', sale.customer_phone ? h('div', sale.customer_phone) : null),
    h('table',
      h('tr', h('th', 'Désignation'), h('th.r', 'Qté'), h('th.r', 'Prix unitaire'), h('th.r', 'Total')),
      sale.items.map((i) => h('tr', h('td', i.name), h('td.r', fmtNum(i.qty)), h('td.r', fmtNum(i.price)), h('td.r', fmtNum(i.total))))),
    h('table', { style: 'width:45%;margin-left:auto' },
      h('tr', h('td', 'Sous-total'), h('td.r', m(sale.subtotal, sale))),
      sale.discount ? h('tr', h('td', 'Remise'), h('td.r', '-' + m(sale.discount, sale))) : null,
      sale.tax ? h('tr', h('td', 'TVA'), h('td.r', m(sale.tax, sale))) : null,
      h('tr', h('td', h('b', 'Total')), h('td.r', h('b', m(sale.total, sale)))),
      h('tr', h('td', 'Payé'), h('td.r', m(sale.paid, sale))),
      due > 0.001 ? h('tr', h('td', h('b', 'Reste à payer')), h('td.r', h('b', m(due, sale)))) : null),
    h('p', { style: 'margin-top:40px;text-align:center;color:#555' }, c.receipt_footer || '')));
}
