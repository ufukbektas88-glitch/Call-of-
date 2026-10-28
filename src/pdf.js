// PDF üretimi (pdfmake, Türkçe karakter destekli Roboto) ve paylaşım (WhatsApp).
import pdfMake from 'pdfmake/build/pdfmake';
import vfsKaynak from 'pdfmake/build/vfs_fonts.js?raw';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { calcLine, calcTotals, para, birimAd, yaziyla } from './calc.js';
import { tarihTR } from './gib.js';
import { LOGO_PNG } from './logo.js';

// vfs_fonts.js bir modül değil, `this.pdfMake.vfs` atayan betik; kendi nesnemizde çalıştırıyoruz.
const fontCtx = {};
new Function(vfsKaynak).call(fontCtx);
pdfMake.vfs = fontCtx.pdfMake.vfs;

const LACIVERT = '#0a2540';
const MAVI = '#1565c0';
const TURKUAZ = '#2fb6ea';
const GRI = '#f1f5f9';
const SAYFA_GEN = 595.28;

function musteriSatirlari(m) {
  const ad = m.unvan || [m.ad, m.soyad].filter(Boolean).join(' ') || 'Nihai Tüketici';
  const out = [{ text: ad, bold: true, fontSize: 12, color: LACIVERT }];
  const adres = [m.adres, [m.ilce, m.il].filter(Boolean).join('/')].filter(Boolean).join(' ');
  if (adres) out.push(adres);
  if (m.vkn) out.push(`${m.vkn.length === 10 ? 'VKN' : 'TCKN'}: ${m.vkn}${m.vergiDairesi ? '   V.D.: ' + m.vergiDairesi : ''}`);
  if (m.tel) out.push('Tel: ' + m.tel);
  if (m.eposta) out.push(m.eposta);
  return out;
}

// Kurumsal başlık bandı: lacivert zemin, logo, firma adı.
function baslikBandi(firma, sag) {
  const ad = (firma.unvan || 'OR-ÇA Su Tesisatı').toLocaleUpperCase('tr');
  return {
    margin: [36, 20, 36, 0],
    columns: [
      { image: LOGO_PNG, width: 62, margin: [0, 0, 12, 0] },
      {
        width: '*',
        stack: [
          { text: ad, fontSize: 21, bold: true, color: '#ffffff', characterSpacing: 1, margin: [0, 8, 0, 0] },
          { text: 'SU TESİSATI · ISITMA · SIHHİ TESİSAT', fontSize: 7.5, color: TURKUAZ, characterSpacing: 1.4, margin: [0, 3, 0, 0] },
        ],
      },
      { width: 'auto', alignment: 'right', stack: sag },
    ],
  };
}
const bandArka = (h) => () => [
  { canvas: [{ type: 'rect', x: 0, y: 0, w: SAYFA_GEN, h, color: LACIVERT }, { type: 'rect', x: 0, y: h, w: SAYFA_GEN, h: 4, color: TURKUAZ }] },
];

export function faturaPdfTanimi(f, firma) {
  const dahil = !!f.kdvDahil;
  const t = calcTotals(f.satirlar, dahil);
  const tarih = f.tarihObj ? tarihTR(new Date(f.tarihObj)) : '';
  const iletisim = [firma.adres, [firma.ilce, firma.il].filter(Boolean).join('/')].filter(Boolean).join(' ');
  const govde = [
    [
      { text: '#', style: 'th' },
      { text: 'MAL / HİZMET', style: 'th' },
      { text: 'MİKTAR', style: 'th', alignment: 'right' },
      { text: 'BİRİM FİYAT', style: 'th', alignment: 'right' },
      { text: 'KDV', style: 'th', alignment: 'right' },
      { text: 'TUTAR', style: 'th', alignment: 'right' },
    ],
    ...f.satirlar.map((l, i) => {
      const c = calcLine(l, dahil);
      return [
        { text: String(i + 1), color: '#64748b' },
        { text: l.ad + (c.iskonto ? `\n(İskonto %${l.iskontoOrani}: -${para(c.iskonto)})` : ''), bold: true, color: LACIVERT },
        { text: `${l.miktar} ${birimAd(l.birim)}`, alignment: 'right' },
        { text: para(c.birimFiyatNet), alignment: 'right' },
        { text: `%${l.kdvOrani}`, alignment: 'right' },
        { text: para(c.net), alignment: 'right', bold: true },
      ];
    }),
  ];
  const toplamlar = [
    ['Mal/Hizmet Toplamı', para(t.brut)],
    ...(t.iskonto ? [['Toplam İskonto', '-' + para(t.iskonto)]] : []),
    ['KDV Matrahı', para(t.matrah)],
    ...Object.entries(t.kdvDokum).map(([o, v]) => [`Hesaplanan KDV (%${o})`, para(v.kdv)]),
  ].map(([a, b]) => [{ text: a, color: '#475569' }, { text: b, alignment: 'right' }]);

  return {
    pageSize: 'A4',
    pageMargins: [36, 130, 36, 58],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: '#1e293b' },
    styles: { th: { bold: true, color: '#fff', fillColor: LACIVERT, fontSize: 8, characterSpacing: 0.6, margin: [0, 4, 0, 4] } },
    background: bandArka(104),
    header: baslikBandi(firma, [
      { text: 'e-ARŞİV FATURA', fontSize: 15, bold: true, color: '#ffffff', margin: [0, 6, 0, 3] },
      { text: `No: ${f.belgeNumarasi || 'TASLAK'}`, color: TURKUAZ, fontSize: 10, bold: true },
      { text: `Tarih: ${tarih}`, color: '#cbd5e1', fontSize: 9 },
    ]),
    footer: () => ({
      margin: [36, 0, 36, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: SAYFA_GEN - 72, y2: 0, lineWidth: 1.5, lineColor: TURKUAZ }] },
        { text: [firma.unvan, iletisim, firma.tel && 'Tel: ' + firma.tel, firma.eposta, firma.vkn && `VKN/TCKN: ${firma.vkn}`, firma.vergiDairesi && 'V.D.: ' + firma.vergiDairesi].filter(Boolean).join('  •  '), alignment: 'center', fontSize: 8, color: '#475569', margin: [0, 5, 0, 2] },
        { text: 'Bu belge e-Arşiv fatura görünümüdür; resmi belge GİB e-Arşiv Portal kaydındadır.', alignment: 'center', fontSize: 7, color: '#94a3b8' },
      ],
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            table: { widths: ['*'], body: [[{ stack: [{ text: 'SAYIN', fontSize: 7.5, bold: true, color: MAVI, characterSpacing: 1.2, margin: [0, 0, 0, 3] }, ...musteriSatirlari(f.musteri)], fillColor: GRI, margin: [10, 8, 10, 8] }]] },
            layout: 'noBorders',
          },
          { width: 14, text: '' },
          {
            width: 170,
            table: { widths: ['*'], body: [[{ stack: [
              { text: 'FATURA BİLGİLERİ', fontSize: 7.5, bold: true, color: MAVI, characterSpacing: 1.2, margin: [0, 0, 0, 3] },
              { text: ['Senaryo: ', { text: 'Temel / e-Arşiv', bold: true }] },
              { text: ['Tip: ', { text: 'Satış', bold: true }] },
              { text: ['Para birimi: ', { text: 'TRY', bold: true }] },
              { text: `ETTN: ${f.id}`, fontSize: 6.5, color: '#64748b', margin: [0, 3, 0, 0] },
            ], fillColor: GRI, margin: [10, 8, 10, 8] }]] },
            layout: 'noBorders',
          },
        ],
      },
      {
        margin: [0, 16, 0, 0],
        table: { headerRows: 1, widths: [20, '*', 56, 66, 32, 72], body: govde },
        layout: {
          hLineColor: '#e2e8f0', vLineWidth: () => 0, hLineWidth: (i, n) => (i === 0 || i === 1 ? 0 : 0.6),
          fillColor: (i) => (i > 0 && i % 2 === 0 ? '#f8fafc' : null), paddingTop: () => 5, paddingBottom: () => 5,
        },
      },
      {
        margin: [0, 14, 0, 0],
        columns: [
          { width: '*', stack: [
            { text: 'YALNIZ', fontSize: 7.5, bold: true, color: MAVI, characterSpacing: 1.2 },
            { text: yaziyla(t.toplam), italics: true, margin: [0, 2, 0, 0] },
            ...(f.not ? [{ text: 'NOT', fontSize: 7.5, bold: true, color: MAVI, characterSpacing: 1.2, margin: [0, 12, 0, 0] }, { text: f.not, color: '#475569' }] : []),
          ] },
          {
            width: 232,
            stack: [
              { table: { widths: ['*', 90], body: toplamlar }, layout: 'noBorders' },
              {
                margin: [0, 6, 0, 0],
                table: { widths: ['*', 'auto'], body: [[{ text: 'ÖDENECEK TUTAR', bold: true, color: '#fff', fontSize: 10, margin: [8, 7, 0, 7] }, { text: para(t.toplam), bold: true, color: '#fff', fontSize: 13, alignment: 'right', margin: [0, 5, 8, 5] }]] },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => LACIVERT },
              },
            ],
          },
        ],
      },
    ],
  };
}

export function raporPdfTanimi(baslik, satirlar, ozet, firma) {
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: { th: { bold: true, color: '#fff', fillColor: LACIVERT, margin: [0, 3, 0, 3] } },
    footer: (p, n) => ({ text: `${p} / ${n}`, alignment: 'center', fontSize: 8, color: '#888' }),
    content: [
      { columns: [{ image: LOGO_PNG, width: 34, margin: [0, 0, 8, 0] }, { width: '*', stack: [{ text: (firma.unvan || 'OR-ÇA Su Tesisatı').toLocaleUpperCase('tr'), fontSize: 14, bold: true, color: LACIVERT }, { text: 'FATURA DÖKÜMÜ', fontSize: 8, color: MAVI, bold: true, characterSpacing: 1.4 }] }] },
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
