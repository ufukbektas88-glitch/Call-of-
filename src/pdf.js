// PDF üretimi (pdfmake, Türkçe karakter destekli Roboto) ve paylaşım (WhatsApp).
import pdfMake from 'pdfmake/build/pdfmake';
import vfsKaynak from 'pdfmake/build/vfs_fonts.js?raw';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { calcLine, calcTotals, para, birimAd, yaziyla } from './calc.js';
import { tarihTR } from './gib.js';

// vfs_fonts.js bir modül değil, `this.pdfMake.vfs` atayan betik; kendi nesnemizde çalıştırıyoruz.
const fontCtx = {};
new Function(vfsKaynak).call(fontCtx);
pdfMake.vfs = fontCtx.pdfMake.vfs;

const MAVI = '#1d4ed8';

function musteriSatirlari(m) {
  const ad = m.unvan || [m.ad, m.soyad].filter(Boolean).join(' ') || 'Nihai Tüketici';
  const out = [{ text: ad, bold: true, fontSize: 11 }];
  const adres = [m.adres, [m.ilce, m.il].filter(Boolean).join('/')].filter(Boolean).join(' ');
  if (adres) out.push(adres);
  if (m.vkn) out.push(`${m.vkn.length === 10 ? 'VKN' : 'TCKN'}: ${m.vkn}${m.vergiDairesi ? '  V.D.: ' + m.vergiDairesi : ''}`);
  if (m.tel) out.push('Tel: ' + m.tel);
  return out;
}

export function faturaPdfTanimi(f, firma) {
  const dahil = !!f.kdvDahil;
  const t = calcTotals(f.satirlar, dahil);
  const tarih = f.tarihObj ? tarihTR(new Date(f.tarihObj)) : '';
  const govde = [
    [
      { text: '#', style: 'th' },
      { text: 'Mal / Hizmet', style: 'th' },
      { text: 'Miktar', style: 'th', alignment: 'right' },
      { text: 'Birim Fiyat', style: 'th', alignment: 'right' },
      { text: 'KDV', style: 'th', alignment: 'right' },
      { text: 'Tutar', style: 'th', alignment: 'right' },
    ],
    ...f.satirlar.map((l, i) => {
      const c = calcLine(l, dahil);
      return [
        String(i + 1),
        l.ad + (c.iskonto ? `\n(İskonto %${l.iskontoOrani}: -${para(c.iskonto)})` : ''),
        { text: `${l.miktar} ${birimAd(l.birim)}`, alignment: 'right' },
        { text: para(c.birimFiyatNet), alignment: 'right' },
        { text: `%${l.kdvOrani}`, alignment: 'right' },
        { text: para(c.net), alignment: 'right' },
      ];
    }),
  ];
  const toplamlar = [
    ['Mal/Hizmet Toplamı', para(t.brut)],
    ...(t.iskonto ? [['Toplam İskonto', '-' + para(t.iskonto)]] : []),
    ['KDV Matrahı', para(t.matrah)],
    ...Object.entries(t.kdvDokum).map(([o, v]) => [`Hesaplanan KDV (%${o})`, para(v.kdv)]),
    [{ text: 'Ödenecek Tutar', bold: true }, { text: para(t.toplam), bold: true, color: MAVI }],
  ].map(([a, b]) => [{ text: a, alignment: 'right' }, { text: b, alignment: 'right' }]);

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 48],
    defaultStyle: { font: 'Roboto', fontSize: 9.5 },
    styles: { th: { bold: true, color: '#fff', fillColor: MAVI, margin: [0, 3, 0, 3] } },
    footer: { text: 'Bu belge e-Arşiv fatura görünümüdür. Resmi belge GİB e-Arşiv Portal kaydındadır.', alignment: 'center', fontSize: 7.5, color: '#888' },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: firma.unvan || 'İşletme Ünvanı', fontSize: 15, bold: true, color: MAVI },
              [firma.adres, [firma.ilce, firma.il].filter(Boolean).join('/')].filter(Boolean).join(' '),
              firma.vkn ? `VKN/TCKN: ${firma.vkn}${firma.vergiDairesi ? '  V.D.: ' + firma.vergiDairesi : ''}` : '',
              firma.tel ? 'Tel: ' + firma.tel : '',
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            stack: [
              { text: 'e-ARŞİV FATURA', fontSize: 14, bold: true },
              `Fatura No: ${f.belgeNumarasi || '(taslak)'}`,
              `Tarih: ${tarih}`,
              { text: `ETTN: ${f.id}`, fontSize: 7 },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 523, y2: 8, lineWidth: 1, lineColor: MAVI }] },
      { text: 'SAYIN', bold: true, color: '#666', fontSize: 8, margin: [0, 14, 0, 2] },
      { stack: musteriSatirlari(f.musteri), margin: [0, 0, 0, 14] },
      {
        table: { headerRows: 1, widths: [18, '*', 55, 65, 30, 70], body: govde },
        layout: { hLineColor: '#ddd', vLineColor: '#fff', hLineWidth: (i) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, paddingTop: () => 4, paddingBottom: () => 4 },
      },
      {
        margin: [0, 12, 0, 0],
        columns: [{ width: '*', text: '' }, { width: 220, table: { widths: ['*', 85], body: toplamlar }, layout: 'noBorders' }],
      },
      { text: `Yalnız: ${yaziyla(t.toplam)}`, italics: true, margin: [0, 10, 0, 0] },
      ...(f.not ? [{ text: 'Not: ' + f.not, margin: [0, 8, 0, 0], color: '#444' }] : []),
    ],
  };
}

export function raporPdfTanimi(baslik, satirlar, ozet, firma) {
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: { th: { bold: true, color: '#fff', fillColor: MAVI, margin: [0, 3, 0, 3] } },
    footer: (p, n) => ({ text: `${p} / ${n}`, alignment: 'center', fontSize: 8, color: '#888' }),
    content: [
      { text: firma.unvan || 'Fatura Dökümü', fontSize: 14, bold: true, color: MAVI },
      { text: baslik, margin: [0, 2, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [60, 85, '*', 80, 70, 70, 80, 55],
          body: [
            ['Tarih', 'Fatura No', 'Müşteri', 'Durum', 'Matrah', 'KDV', 'Toplam', 'Tahsilat'].map((h, i) => ({ text: h, style: 'th', alignment: i >= 4 && i < 7 ? 'right' : 'left' })),
            ...satirlar.map((r) => r.map((c, i) => ({ text: c, alignment: i >= 4 && i < 7 ? 'right' : 'left' }))),
          ],
        },
        layout: { hLineColor: '#ddd', vLineWidth: () => 0, hLineWidth: () => 0.5 },
      },
      { text: ozet, bold: true, margin: [0, 12, 0, 0], alignment: 'right' },
    ],
  };
}

function base64Al(tanim) {
  return new Promise((resolve) => pdfMake.createPdf(tanim).getBase64(resolve));
}

// Telefonda paylaşım penceresi açar (WhatsApp seçilir); tarayıcıda indirir.
export async function pdfPaylas(tanim, dosyaAdi, mesaj) {
  if (Capacitor.isNativePlatform()) {
    const b64 = await base64Al(tanim);
    const r = await Filesystem.writeFile({ path: dosyaAdi, data: b64, directory: Directory.Cache });
    await Share.share({ title: dosyaAdi, text: mesaj || '', files: [r.uri], dialogTitle: 'PDF paylaş' });
  } else {
    pdfMake.createPdf(tanim).download(dosyaAdi);
  }
}

export async function metinPaylas(metin, dosyaAdi, mime = 'text/csv') {
  if (Capacitor.isNativePlatform()) {
    const r = await Filesystem.writeFile({ path: dosyaAdi, data: metin, directory: Directory.Cache, encoding: 'utf8' });
    await Share.share({ title: dosyaAdi, files: [r.uri] });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + metin], { type: mime }));
    a.download = dosyaAdi;
    a.click();
  }
}
