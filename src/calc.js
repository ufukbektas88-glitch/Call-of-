// Fatura hesaplamaları. Tüm tutarlar 2 hane yuvarlanır.
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const BIRIMLER = [
  ['C62', 'Adet'],
  ['MTR', 'Metre'],
  ['HUR', 'Saat'],
  ['DAY', 'Gün'],
  ['KGM', 'Kg'],
  ['LTR', 'Litre'],
  ['MTK', 'm²'],
  ['SET', 'Takım'],
];
export const birimAd = (kod) => (BIRIMLER.find((b) => b[0] === kod) || [, kod])[1];

export const KDV_ORANLARI = [0, 1, 10, 20];

// kdvDahil=true ise girilen birim fiyat KDV dahildir; KDV hariç fiyata çevrilir.
export function calcLine(l, kdvDahil = false) {
  const miktar = Number(l.miktar) || 0;
  let fiyat = Number(l.birimFiyat) || 0;
  const kdvOrani = Number(l.kdvOrani) || 0;
  const iskontoOrani = Number(l.iskontoOrani) || 0;
  if (kdvDahil) fiyat = fiyat / (1 + kdvOrani / 100);
  const brut = r2(miktar * fiyat);
  const iskonto = r2((brut * iskontoOrani) / 100);
  const net = r2(brut - iskonto);
  const kdv = r2((net * kdvOrani) / 100);
  return { birimFiyatNet: r2(fiyat), brut, iskonto, net, kdv, toplam: r2(net + kdv) };
}

export function calcTotals(lines, kdvDahil = false) {
  const t = { brut: 0, iskonto: 0, matrah: 0, kdv: 0, toplam: 0, kdvDokum: {} };
  for (const l of lines) {
    const c = calcLine(l, kdvDahil);
    t.brut += c.brut;
    t.iskonto += c.iskonto;
    t.matrah += c.net;
    t.kdv += c.kdv;
    const k = String(Number(l.kdvOrani) || 0);
    t.kdvDokum[k] = t.kdvDokum[k] || { matrah: 0, kdv: 0 };
    t.kdvDokum[k].matrah = r2(t.kdvDokum[k].matrah + c.net);
    t.kdvDokum[k].kdv = r2(t.kdvDokum[k].kdv + c.kdv);
  }
  t.brut = r2(t.brut);
  t.iskonto = r2(t.iskonto);
  t.matrah = r2(t.matrah);
  t.kdv = r2(t.kdv);
  t.toplam = r2(t.matrah + t.kdv);
  return t;
}

export const para = (n) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ₺';

// Tutar → yazıyla (ör. "Yüz Yirmi Türk Lirası Elli Kuruş")
const BIR = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const ON = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
const BASAMAK = ['', 'Bin', 'Milyon', 'Milyar'];
function ucBasamak(n) {
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  return [y ? (y === 1 ? '' : BIR[y]) + (y ? ' Yüz' : '') : '', ON[o], BIR[b]].filter(Boolean).join(' ').trim();
}
export function yaziyla(tutar) {
  const toplam = Math.round((Number(tutar) || 0) * 100);
  const lira = Math.floor(toplam / 100), kurus = toplam % 100;
  const parcalar = [];
  let n = lira, i = 0;
  while (n > 0) {
    const p = n % 1000;
    if (p) parcalar.unshift(i === 1 && p === 1 ? 'Bin' : [ucBasamak(p), BASAMAK[i]].filter(Boolean).join(' '));
    n = Math.floor(n / 1000);
    i++;
  }
  let s = (lira === 0 ? 'Sıfır' : parcalar.join(' ')).replace(/\s+/g, ' ').replace(/^ Yüz/, 'Yüz') + ' Türk Lirası';
  if (kurus) s += ' ' + [ON[Math.floor(kurus / 10)], BIR[kurus % 10]].filter(Boolean).join(' ') + ' Kuruş';
  return s;
}
