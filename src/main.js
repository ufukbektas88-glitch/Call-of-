import { db, kaydet, upsert, sil, yeniId, yedekAl, yedekYukle } from './store.js';
import { calcLine, calcTotals, para, BIRIMLER, KDV_ORANLARI, r2 } from './calc.js';
import { Gib, gibFaturaGovdesi, tarihTR, uuid } from './gib.js';
import { LOGO_PNG } from './logo.js';
import { faturaPdfTanimi, raporPdfTanimi, pdfPaylas, htmlPdfPaylas, metinPaylas } from './pdf.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

function modal(inner) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div>${inner}</div>`;
  m.addEventListener('click', (e) => e.target === m && m.remove());
  document.body.appendChild(m);
  return m;
}
const bekle = (metin) => modal(`<p style="text-align:center;padding:20px 0">⏳ ${esc(metin)}</p>`);

// ---------- GİB oturumu ----------
let gib = null;
let gibKey = '';
function getGib() {
  const a = db().ayar;
  if (a.mode === 'prod' && (!a.user || !a.pass)) throw new Error('Önce Ayarlar bölümünden GİB kullanıcı adı ve şifrenizi girin.');
  const key = [a.mode, a.user, a.pass].join('|');
  if (!gib || key !== gibKey) {
    gib = new Gib({ mode: a.mode, user: a.user, pass: a.pass });
    gibKey = key;
  }
  return gib;
}

// ---------- yardımcılar ----------
const ayAdi = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const gunKisa = (iso) => (iso ? tarihTR(new Date(iso)) : '-');
const isoGun = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const musteriAdi = (m) => m.unvan || [m.ad, m.soyad].filter(Boolean).join(' ') || 'Nihai Tüketici';
function durumBadge(d) {
  return { onaylandi: '<span class="badge b-ok">Onaylı</span>', taslak: '<span class="badge b-draft">Taslak</span>', iptal: '<span class="badge b-bad">İptal</span>' }[d] || '';
}
function gibTarihParse(s) {
  const m = String(s || '').match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], 12).toISOString() : new Date().toISOString();
}
function gibDurum(s) {
  s = String(s || '');
  if (/sil|iptal/i.test(s)) return 'iptal';
  return s === 'Onaylandı' ? 'onaylandi' : 'taslak';
}
const toplamAl = (f) => f.toplam || (f.satirlar && f.satirlar.length ? calcTotals(f.satirlar, f.kdvDahil) : { matrah: 0, kdv: 0, toplam: 0 });

// ---------- iskelet ve yönlendirme ----------
const SEKMELER = [
  ['#/', '🏠', 'Ana Sayfa'],
  ['#/faturalar', '🧾', 'Faturalar'],
  ['#/yeni', '＋', 'Yeni', 'plus'],
  ['#/musteriler', '👥', 'Müşteriler'],
  ['#/daha', '☰', 'Daha Fazla'],
];
function nav(aktif) {
  return `<nav>${SEKMELER.map(([h, i, t, c]) => `<a href="${h}" class="${c || ''} ${aktif === h ? 'on' : ''}"><b>${i}</b>${t}</a>`).join('')}</nav>`;
}
function sayfa(aktifSekme, icerik) {
  app.innerHTML = icerik + nav(aktifSekme);
  window.scrollTo(0, 0);
}

const rotalar = [];
const rota = (re, fn) => rotalar.push([re, fn]);
function yonlendir() {
  const yol = location.hash.replace(/^#/, '') || '/';
  for (const [re, fn] of rotalar) {
    const m = yol.match(re);
    if (m) return fn(...m.slice(1).map(decodeURIComponent));
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', yonlendir);

// ================= ANA SAYFA =================
rota(/^\/$/, () => {
  const d = db();
  const simdi = new Date();
  const ayBas = new Date(simdi.getFullYear(), simdi.getMonth(), 1).toISOString();
  const onayli = d.faturalar.filter((f) => f.durum === 'onaylandi');
  const buAy = onayli.filter((f) => f.tarihObj >= ayBas);
  const ciro = buAy.reduce((s, f) => s + toplamAl(f).toplam, 0);
  const bekleyen = onayli.filter((f) => !f.odendi && toplamAl(f).toplam > 0);
  const bekTutar = bekleyen.reduce((s, f) => s + toplamAl(f).toplam, 0);
  const taslaklar = d.faturalar.filter((f) => f.durum === 'taslak').length;
  const son = d.faturalar.slice(0, 5);
  const ilkKurulum = d.ayar.mode === 'prod' && (!d.ayar.user || !d.ayar.pass);
  sayfa(
    '#/',
    `<div class="brand"><img src="${LOGO_PNG}" alt=""><div><b>${esc((d.ayar.firma.unvan || 'OR-ÇA Su Tesisatı').toLocaleUpperCase('tr'))}</b><span>FATURA</span></div></div>
    ${ilkKurulum ? `<div class="warn" style="margin-bottom:12px">Başlamak için <a href="#/ayarlar">Ayarlar</a>'dan GİB e-Arşiv kullanıcı adı/şifrenizi ve işletme bilgilerinizi girin. Denemek için "Demo" modunu açabilirsiniz.</div>` : ''}
    ${d.ayar.mode === 'test' ? `<div class="warn" style="margin-bottom:12px">🧪 DEMO MODU açık — GİB'e bağlı değil, faturalar gerçek değildir. Gerçek fatura için Ayarlar'dan "Gerçek"e geçin.</div>` : ''}
    <div class="grid2">
      <div class="card"><div class="mut">${ayAdi[simdi.getMonth()]} cirosu</div><div class="stat">${para(ciro)}</div><div class="mut">${buAy.length} fatura</div></div>
      <div class="card"><div class="mut">Tahsil edilmemiş</div><div class="stat" style="color:var(--warn)">${para(bekTutar)}</div><div class="mut">${bekleyen.length} fatura</div></div>
    </div>
    <button class="big" onclick="location.hash='#/yeni'">＋ Yeni Fatura Kes</button>
    ${taslaklar ? `<p class="mut" style="text-align:center">⚠ Onay bekleyen ${taslaklar} taslak var</p>` : ''}
    <h2>Son faturalar</h2>
    <div class="card">${son.length ? son.map(satirHtml).join('') : '<p class="mut">Henüz fatura yok.</p>'}</div>`
  );
  $$('[data-fid]').forEach((e) => (e.onclick = () => (location.hash = '#/fatura/' + e.dataset.fid)));
});

function satirHtml(f) {
  const t = toplamAl(f);
  return `<div class="item" data-fid="${esc(f.id)}"><div><b>${esc(musteriAdi(f.musteri))}</b><div class="mut">${gunKisa(f.tarihObj)} · ${esc(f.belgeNumarasi || 'no yok')}</div></div>
  <div class="r"><b>${t.toplam ? para(t.toplam) : '-'}</b><div>${durumBadge(f.durum)} ${f.durum === 'onaylandi' && t.toplam ? (f.odendi ? '<span class="badge b-ok">💰</span>' : '<span class="badge b-gray">bekliyor</span>') : ''}</div></div></div>`;
}

// ================= YENİ FATURA =================
let taslak = null;
function yeniTaslak() {
  const a = db().ayar;
  return {
    id: uuid(),
    tarihObj: new Date().toISOString(),
    musteri: { ad: '', soyad: '', unvan: '', vkn: '', vergiDairesi: '', adres: '', il: '', ilce: '', tel: '', eposta: '' },
    satirlar: [],
    kdvDahil: a.kdvDahil,
    not: a.notSablonu || '',
    durum: 'taslak',
  };
}
const bosSatir = () => ({ ad: '', miktar: 1, birim: 'C62', birimFiyat: '', kdvOrani: db().ayar.varsayilanKdv, iskontoOrani: 0 });

rota(/^\/yeni$/, () => {
  if (!taslak) taslak = yeniTaslak();
  if (!taslak.satirlar.length) taslak.satirlar.push(bosSatir());
  formCiz();
});

function formCiz() {
  const d = db();
  const f = taslak;
  const m = f.musteri;
  const kayitliOpts = d.musteriler.map((c) => `<option value="${c.id}">${esc(musteriAdi(c))}</option>`).join('');
  sayfa(
    '#/yeni',
    `<h1>Yeni Fatura</h1>
    <div class="card">
      <h2 style="margin-top:0">Müşteri</h2>
      <select id="kayitli"><option value="">— Kayıtlı müşteri seç —</option>${kayitliOpts}</select>
      <div class="seg" style="margin-top:10px"><button data-tip="kisi" class="${m.unvan ? '' : 'on'}">Şahıs</button><button data-tip="firma" class="${m.unvan ? 'on' : ''}">Firma</button></div>
      ${
        m.unvan || f._firma
          ? `<label>Firma ünvanı</label><input data-m="unvan" value="${esc(m.unvan)}" autocomplete="off" />`
          : `<div class="grid2"><div><label>Ad</label><input data-m="ad" value="${esc(m.ad)}" /></div><div><label>Soyad</label><input data-m="soyad" value="${esc(m.soyad)}" /></div></div>`
      }
      <div class="grid2"><div><label>TC / Vergi No</label><input data-m="vkn" inputmode="numeric" maxlength="11" value="${esc(m.vkn)}" placeholder="Boşsa 11111111111" /></div>
      <div><label>Vergi dairesi</label><input data-m="vergiDairesi" value="${esc(m.vergiDairesi)}" /></div></div>
      <label>Adres</label><input data-m="adres" value="${esc(m.adres)}" />
      <div class="grid2"><div><label>İl</label><input data-m="il" value="${esc(m.il)}" /></div><div><label>İlçe</label><input data-m="ilce" value="${esc(m.ilce)}" /></div></div>
      <div class="grid2"><div><label>Telefon (WhatsApp)</label><input data-m="tel" inputmode="tel" value="${esc(m.tel)}" /></div><div><label>E-posta</label><input data-m="eposta" inputmode="email" value="${esc(m.eposta)}" /></div></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="musKaydet" style="width:auto" /> Müşteriyi kaydet</label>
    </div>

    <div class="card">
      <div class="row between"><h2 style="margin:0">Hizmetler</h2><label style="margin:0;display:flex;gap:6px;align-items:center" class="auto"><input type="checkbox" id="kdvDahil" style="width:auto" ${f.kdvDahil ? 'checked' : ''}/> Fiyatlar KDV dahil</label></div>
      <div id="satirlar">${f.satirlar.map(satirFormHtml).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="sec" id="katalogEkle">📋 Hizmet listesinden</button><button class="sec" id="satirEkle">＋ Boş satır</button></div>
    </div>

    <div class="card">
      <label style="margin-top:0">Fatura tarihi</label><input type="date" id="tarih" value="${isoGun(new Date(f.tarihObj))}" />
      <label>Fatura notu</label><textarea id="not" rows="2">${esc(f.not)}</textarea>
      <div id="ozet" style="margin-top:12px"></div>
    </div>
    <button class="big" id="kesOnay">✅ Faturayı Kes ve Onayla</button>
    <div class="row" style="margin-top:10px"><button class="sec" id="sadeceTaslak">Sadece taslak oluştur</button><button class="ghost" id="temizle">Formu temizle</button></div>`
  );
  ozetGuncelle();
  formBagla();
}

function satirFormHtml(l, i) {
  return `<div class="line" data-i="${i}">
    <input data-k="ad" placeholder="Hizmet / mal adı" value="${esc(l.ad)}" />
    <div class="grid2" style="margin-top:8px">
      <div><label style="margin-top:0">Miktar</label><input data-k="miktar" inputmode="decimal" value="${esc(l.miktar)}" /></div>
      <div><label style="margin-top:0">Birim</label><select data-k="birim">${BIRIMLER.map(([k, a]) => `<option value="${k}" ${l.birim === k ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div><label>Birim fiyat (₺)</label><input data-k="birimFiyat" inputmode="decimal" value="${esc(l.birimFiyat)}" /></div>
      <div><label>KDV</label><select data-k="kdvOrani">${KDV_ORANLARI.map((k) => `<option value="${k}" ${+l.kdvOrani === k ? 'selected' : ''}>%${k}</option>`).join('')}</select></div>
    </div>
    <div class="row between" style="margin-top:8px"><div><label style="margin:0">İskonto %</label><input data-k="iskontoOrani" inputmode="decimal" value="${esc(l.iskontoOrani)}" style="max-width:110px"/></div>
    <button class="bad auto" data-sil="${i}">Sil</button></div></div>`;
}

function ozetGuncelle() {
  const t = calcTotals(taslak.satirlar, taslak.kdvDahil);
  $('#ozet').innerHTML = `<div class="sum"><span>Ara toplam</span><span>${para(t.brut)}</span></div>
    ${t.iskonto ? `<div class="sum"><span>İskonto</span><span>-${para(t.iskonto)}</span></div>` : ''}
    <div class="sum"><span>KDV Matrahı</span><span>${para(t.matrah)}</span></div>
    ${Object.entries(t.kdvDokum).map(([o, v]) => `<div class="sum"><span>KDV %${o}</span><span>${para(v.kdv)}</span></div>`).join('')}
    <div class="sum t"><span>Toplam</span><span>${para(t.toplam)}</span></div>`;
}

function formBagla() {
  const f = taslak;
  const num = (v) => String(v).replace(',', '.');
  $$('[data-m]').forEach((e) => (e.oninput = () => (f.musteri[e.dataset.m] = e.value)));
  $$('#satirlar [data-k]').forEach((e) => {
    const handler = () => {
      const i = +e.closest('.line').dataset.i;
      const k = e.dataset.k;
      f.satirlar[i][k] = ['miktar', 'birimFiyat', 'iskontoOrani'].includes(k) ? num(e.value) : e.value;
      ozetGuncelle();
    };
    e.oninput = handler;
    e.onchange = handler;
  });
  $$('[data-sil]').forEach((b) => (b.onclick = () => { f.satirlar.splice(+b.dataset.sil, 1); if (!f.satirlar.length) f.satirlar.push(bosSatir()); formCiz(); }));
  $$('[data-tip]').forEach((b) => (b.onclick = () => {
    if (b.dataset.tip === 'firma') { f._firma = true; } else { f._firma = false; f.musteri.unvan = ''; }
    formCiz();
  }));
  $('#kayitli').onchange = (e) => {
    const c = db().musteriler.find((x) => x.id === e.target.value);
    if (c) { f.musteri = { ...c }; delete f.musteri.id; f._firma = !!c.unvan; formCiz(); }
  };
  $('#kdvDahil').onchange = (e) => { f.kdvDahil = e.target.checked; ozetGuncelle(); };
  $('#tarih').onchange = (e) => { if (e.target.value) f.tarihObj = new Date(e.target.value + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(); };
  $('#not').oninput = (e) => (f.not = e.target.value);
  $('#satirEkle').onclick = () => { f.satirlar.push(bosSatir()); formCiz(); };
  $('#katalogEkle').onclick = katalogSec;
  $('#temizle').onclick = () => { if (confirm('Form temizlensin mi?')) { taslak = null; yonlendir(); } };
  $('#kesOnay').onclick = () => faturaGonder(true);
  $('#sadeceTaslak').onclick = () => faturaGonder(false);
}

function katalogSec() {
  const h = db().hizmetler;
  const m = modal(`<h2 style="margin-top:0">Hizmet seç</h2>${h.length ? h.map((x) => `<div class="item" data-h="${x.id}"><div><b>${esc(x.ad)}</b><div class="mut">KDV %${x.kdv}</div></div><div class="r">${x.fiyat ? para(x.fiyat) : '—'}</div></div>`).join('') : '<p class="mut">Hizmet listesi boş. Daha Fazla → Hizmetler.</p>'}`);
  $$('[data-h]', m).forEach((e) => (e.onclick = () => {
    const x = h.find((y) => y.id === e.dataset.h);
    const bos = taslak.satirlar.length === 1 && !taslak.satirlar[0].ad && !taslak.satirlar[0].birimFiyat;
    if (bos) taslak.satirlar = [];
    taslak.satirlar.push({ ad: x.ad, miktar: 1, birim: x.birim, birimFiyat: x.fiyat || '', kdvOrani: x.kdv, iskontoOrani: 0 });
    m.remove();
    formCiz();
  }));
}

function dogrula(f) {
  const m = f.musteri;
  if (!m.unvan && !m.ad && !m.vkn) throw new Error('Müşteri adı (veya ünvan) girin.');
  if (m.vkn && !/^\d{10}$|^\d{11}$/.test(m.vkn)) throw new Error('TC 11, vergi no 10 haneli olmalı.');
  const gecerli = f.satirlar.filter((l) => l.ad && Number(l.birimFiyat) > 0);
  if (!gecerli.length) throw new Error('En az bir hizmet satırı (ad + fiyat) girin.');
  if (gecerli.length !== f.satirlar.length) throw new Error('Boş veya fiyatsız satır var, silin ya da doldurun.');
  if (!db().ayar.firma.unvan) throw new Error('Ayarlar → İşletme bilgilerini doldurun (PDF için).');
}

async function faturaGonder(onayla) {
  const f = taslak;
  const w = bekle('GİB ile bağlantı kuruluyor…');
  try {
    dogrula(f);
    if ($('#musKaydet') && $('#musKaydet').checked) {
      upsert('musteriler', { id: yeniId(), ...f.musteri });
    }
    const g = getGib();
    const satir = await g.taslakOlustur(gibFaturaGovdesi(f), new Date(f.tarihObj));
    const t = calcTotals(f.satirlar, f.kdvDahil);
    const kayit = { ...f, ettn: satir.ettn, belgeNumarasi: satir.belgeNumarasi || '', toplam: { matrah: t.matrah, kdv: t.kdv, toplam: t.toplam }, durum: 'taslak', odendi: false, olusturma: new Date().toISOString() };
    delete kayit._firma;
    upsert('faturalar', kayit);
    taslak = null;
    w.remove();
    if (onayla) await onayAkisi(kayit.id);
    else { toast('Taslak GİB\'e kaydedildi'); location.hash = '#/fatura/' + kayit.id; }
  } catch (e) {
    w.remove();
    toast('⚠ ' + e.message, 5000);
  }
}

// Müşteriye gönderilecek PDF: onaylıysa GİB'in resmi görünümünden, olmazsa kendi şablonumuzdan.
async function faturaPdfGonder(f) {
  const t = toplamAl(f);
  const dosya = `Fatura-${f.belgeNumarasi || (f.ettn || f.id).slice(0, 8)}.pdf`;
  const mesaj = `Merhaba, ${para(t.toplam)} tutarındaki faturanız ektedir. Teşekkürler.`;
  if (f.durum === 'onaylandi' && (f.ettn || f.id)) {
    const w = bekle('Onaylı fatura GİB\'den alınıyor…');
    try {
      const html = await getGib().htmlGetir(f.ettn || f.id, true);
      if (html && html.length > 200) {
        await htmlPdfPaylas(html, dosya, mesaj);
        w.remove();
        return;
      }
    } catch (e) {
      toast('GİB görünümü alınamadı, özet PDF hazırlanıyor', 3500);
    }
    w.remove();
  }
  if (!(f.satirlar && f.satirlar.length)) return toast('Bu faturanın kalem bilgisi yok.');
  await pdfPaylas(faturaPdfTanimi(f, db().ayar.firma), dosya, mesaj);
}

// SMS onayı: GİB, kayıtlı telefona kod gönderir.
async function onayAkisi(id) {
  const f = db().faturalar.find((x) => x.id === id);
  const ettn = f.ettn || f.id;
  const g = getGib();
  const w = bekle('SMS kodu isteniyor…');
  let oid, satir, tel;
  try {
    satir = await g.satirBul(ettn, new Date(f.tarihObj));
    if (!satir) throw new Error('Taslak GİB listesinde bulunamadı. Faturalar → GİB ile eşitle deneyin.');
    f.belgeNumarasi = satir.belgeNumarasi || f.belgeNumarasi;
    upsert('faturalar', f);
    ({ oid, tel } = await g.smsGonder());
  } catch (e) {
    w.remove();
    toast('⚠ ' + e.message, 5000);
    location.hash = '#/fatura/' + id;
    return;
  }
  w.remove();
  const m = modal(`<h2 style="margin-top:0">SMS onay kodu</h2>
    <p class="mut">GİB'e kayıtlı telefonunuza (${esc(tel)}) gelen kodu girin.${db().ayar.mode === 'test' ? ' (Demo modunda herhangi bir kod girebilirsiniz.)' : ''}</p>
    <input id="smsKod" inputmode="numeric" autocomplete="one-time-code" style="font-size:24px;text-align:center;letter-spacing:6px" />
    <button class="big" id="smsOk" style="margin-top:12px">Onayla</button>
    <button class="ghost" id="smsIptal" style="width:100%;margin-top:6px">Sonra onaylarım (taslak kalsın)</button>`);
  $('#smsIptal', m).onclick = () => { m.remove(); location.hash = '#/fatura/' + id; };
  $('#smsOk', m).onclick = async () => {
    const kod = $('#smsKod', m).value.trim();
    if (!kod) return;
    $('#smsOk', m).disabled = true;
    try {
      await g.onayla(oid, kod, [satir]);
      f.durum = 'onaylandi';
      try {
        const yeni = await g.satirBul(ettn, new Date(f.tarihObj));
        if (yeni && yeni.belgeNumarasi) f.belgeNumarasi = yeni.belgeNumarasi;
      } catch {}
      upsert('faturalar', f);
      m.remove();
      onayliModal(f);
    } catch (e) {
      $('#smsOk', m).disabled = false;
      toast('⚠ ' + e.message, 5000);
    }
  };
  setTimeout(() => $('#smsKod', m) && $('#smsKod', m).focus(), 100);
}

function onayliModal(f) {
  const m = modal(`<h2 style="margin-top:0">✅ Fatura onaylandı</h2>
    <p>Fatura No: <b>${esc(f.belgeNumarasi || '—')}</b><br><span class="mut">${esc(musteriAdi(f.musteri))} · ${para(toplamAl(f).toplam)}</span></p>
    <button class="big" id="wpHemen">💬 Müşteriye WhatsApp'tan gönder (PDF)</button>
    <button class="ghost" id="wpKapat" style="width:100%;margin-top:6px">Şimdi değil</button>`);
  $('#wpKapat', m).onclick = () => { m.remove(); location.hash = '#/fatura/' + f.id; };
  $('#wpHemen', m).onclick = async () => {
    try { await faturaPdfGonder(f); } catch (e) { toast('⚠ ' + e.message, 4000); }
    m.remove();
    location.hash = '#/fatura/' + f.id;
  };
}

// ================= FATURA LİSTESİ =================
let filtre = { durum: 'hepsi', ara: '', odeme: 'hepsi' };
rota(/^\/faturalar$/, () => {
  const d = db();
  const liste = d.faturalar
    .filter((f) => filtre.durum === 'hepsi' || f.durum === filtre.durum)
    .filter((f) => filtre.odeme === 'hepsi' || (f.durum === 'onaylandi' && (filtre.odeme === 'odendi' ? f.odendi : !f.odendi)))
    .filter((f) => !filtre.ara || (musteriAdi(f.musteri) + ' ' + (f.belgeNumarasi || '')).toLowerCase().includes(filtre.ara.toLowerCase()))
    .sort((a, b) => (b.tarihObj || '').localeCompare(a.tarihObj || ''));
  const chip = (k, v, t, alan = 'durum') => `<button data-f="${alan}:${v}" class="${filtre[alan] === v ? 'on' : ''}">${t}</button>`;
  sayfa(
    '#/faturalar',
    `<div class="row between"><h1>Faturalar</h1><button class="sec auto" id="esitle">⟳ GİB ile eşitle</button></div>
    <input id="ara" placeholder="🔍 Müşteri veya fatura no ara" value="${esc(filtre.ara)}" />
    <div class="chips" style="margin:10px 0">${chip('d', 'hepsi', 'Tümü')}${chip('d', 'onaylandi', 'Onaylı')}${chip('d', 'taslak', 'Taslak')}${chip('d', 'iptal', 'İptal')}${chip('o', 'bekliyor', '💸 Tahsil bekleyen', 'odeme')}${chip('o', 'odendi', '💰 Tahsil edilen', 'odeme')}</div>
    <div class="card">${liste.length ? liste.map(satirHtml).join('') : '<p class="mut">Kayıt yok. "GİB ile eşitle" ile geçmiş faturalarınızı çekebilirsiniz.</p>'}</div>`
  );
  $$('[data-fid]').forEach((e) => (e.onclick = () => (location.hash = '#/fatura/' + e.dataset.fid)));
  $$('[data-f]').forEach((b) => (b.onclick = () => { const [k, v] = b.dataset.f.split(':'); filtre[k] = v; yonlendir(); }));
  $('#ara').oninput = (e) => { filtre.ara = e.target.value; clearTimeout(rota.t); rota.t = setTimeout(() => { yonlendir(); const el = $('#ara'); el.focus(); el.setSelectionRange(99, 99); }, 350); };
  $('#esitle').onclick = esitle;
});

async function esitle() {
  const m = modal(`<h2 style="margin-top:0">GİB ile eşitle</h2><p class="mut">Hangi dönem çekilsin?</p>
    <div class="chips" style="flex-wrap:wrap"><button data-ay="1">Son 1 ay</button><button data-ay="3">Son 3 ay</button><button data-ay="12">Son 12 ay</button><button data-ay="24">Son 24 ay</button></div>`);
  $$('[data-ay]', m).forEach((b) => (b.onclick = async () => {
    m.remove();
    const w = bekle('Faturalar GİB\'den çekiliyor…');
    try {
      const g = getGib();
      const bit = new Date();
      const bas = new Date(bit.getFullYear(), bit.getMonth() - +b.dataset.ay, bit.getDate());
      const satirlar = await g.listeleAralik(bas, bit);
      let yeni = 0, guncel = 0;
      for (const s of satirlar) {
        const var_ = db().faturalar.find((x) => x.ettn === s.ettn || x.id === s.ettn);
        const durum = gibDurum(s.onayDurumu);
        if (var_) { var_.belgeNumarasi = s.belgeNumarasi || var_.belgeNumarasi; var_.durum = durum; guncel++; }
        else {
          const unvan = s.aliciUnvanAdSoyad || '';
          db().faturalar.push({ id: s.ettn, ettn: s.ettn, belgeNumarasi: s.belgeNumarasi, tarihObj: gibTarihParse(s.belgeTarihi), musteri: { unvan, vkn: s.aliciVknTckn && s.aliciVknTckn !== '11111111111' ? s.aliciVknTckn : '' }, satirlar: [], durum, odendi: true, kaynak: 'gib' });
          yeni++;
        }
      }
      kaydet();
      w.remove();
      toast(`${yeni} yeni, ${guncel} güncellendi`);
      yonlendir();
    } catch (e) { w.remove(); toast('⚠ ' + e.message, 5000); }
  }));
}

// ================= FATURA DETAY =================
rota(/^\/fatura\/(.+)$/, (id) => {
  const f = db().faturalar.find((x) => x.id === id);
  if (!f) return (location.hash = '#/faturalar');
  const t = toplamAl(f);
  const tam = f.satirlar && f.satirlar.length;
  sayfa(
    '#/faturalar',
    `<div class="row between"><button class="ghost auto" onclick="history.back()">← Geri</button><span class="auto">${durumBadge(f.durum)}</span></div>
    <h1>${esc(musteriAdi(f.musteri))}</h1>
    <div class="card">
      <div class="sum"><span class="mut">Fatura no</span><span>${esc(f.belgeNumarasi || '—')}</span></div>
      <div class="sum"><span class="mut">Tarih</span><span>${gunKisa(f.tarihObj)}</span></div>
      ${f.musteri.vkn ? `<div class="sum"><span class="mut">TC/VKN</span><span>${esc(f.musteri.vkn)}</span></div>` : ''}
      ${f.musteri.tel ? `<div class="sum"><span class="mut">Telefon</span><span>${esc(f.musteri.tel)}</span></div>` : ''}
      ${tam ? f.satirlar.map((l) => `<div class="item"><div>${esc(l.ad)}<div class="mut">${l.miktar} × ${l.birimFiyat}₺ · KDV %${l.kdvOrani}</div></div><div class="r">${para(calcLine(l, f.kdvDahil).net)}</div></div>`).join('') : '<p class="mut">Bu fatura GİB\'den eşitlendi; kalem detayı uygulamada yok.</p>'}
      ${tam ? `<div class="sum"><span>KDV</span><span>${para(t.kdv)}</span></div><div class="sum t"><span>Toplam</span><span>${para(t.toplam)}</span></div>` : ''}
    </div>
    ${tam || f.durum === 'onaylandi' ? `<button class="big" id="wp">💬 ${f.durum === 'onaylandi' ? 'Onaylı faturayı WhatsApp ile gönder' : 'PDF taslağını WhatsApp ile gönder'}</button>` : ''}
    <div style="height:10px"></div>
    ${f.durum === 'taslak' ? `<button class="big" id="onayla" style="background:var(--ok)">✅ Şimdi onayla (SMS)</button><div style="height:10px"></div>` : ''}
    ${f.durum === 'onaylandi' && tam ? `<button class="sec big" id="odeme">${f.odendi ? '↩ Tahsilatı geri al' : '💰 Tahsil edildi olarak işaretle'}</button><div style="height:10px"></div>` : ''}
    <div class="row">${tam ? '<button class="sec" id="kopya">⧉ Kopyala</button>' : ''}${f.durum === 'taslak' ? '<button class="bad" id="sil">🗑 Taslağı sil</button>' : ''}${f.kaynak === 'gib' || f.durum === 'iptal' ? '<button class="bad" id="yerelSil">Listeden kaldır</button>' : ''}</div>`
  );
  const w = $('#wp');
  if (w) w.onclick = async () => { try { await faturaPdfGonder(f); } catch (e) { toast('⚠ ' + e.message, 4000); } };
  if ($('#onayla')) $('#onayla').onclick = () => onayAkisi(f.id);
  if ($('#odeme')) $('#odeme').onclick = () => { f.odendi = !f.odendi; upsert('faturalar', f); yonlendir(); };
  if ($('#kopya')) $('#kopya').onclick = () => {
    taslak = { ...yeniTaslak(), musteri: { ...f.musteri }, satirlar: f.satirlar.map((l) => ({ ...l })), kdvDahil: f.kdvDahil, not: f.not || '', _firma: !!f.musteri.unvan };
    location.hash = '#/yeni';
  };
  if ($('#sil')) $('#sil').onclick = async () => {
    if (!confirm('Taslak GİB\'den silinsin mi?')) return;
    const w2 = bekle('Siliniyor…');
    try {
      const g2 = getGib();
      const satir = await g2.satirBul(f.ettn || f.id, new Date(f.tarihObj));
      if (satir) await g2.sil(satir);
      sil('faturalar', f.id);
      w2.remove();
      location.hash = '#/faturalar';
    } catch (e) { w2.remove(); toast('⚠ ' + e.message, 5000); }
  };
  if ($('#yerelSil')) $('#yerelSil').onclick = () => { if (confirm('Sadece uygulamadaki kayıt silinir.')) { sil('faturalar', f.id); location.hash = '#/faturalar'; } };
});

// ================= MÜŞTERİLER =================
rota(/^\/musteriler$/, () => {
  const liste = [...db().musteriler].sort((a, b) => musteriAdi(a).localeCompare(musteriAdi(b), 'tr'));
  sayfa(
    '#/musteriler',
    `<div class="row between"><h1>Müşteriler</h1><button class="auto" id="yeniM">＋ Ekle</button></div>
    <div class="card">${liste.length ? liste.map((c) => `<div class="item" data-mid="${c.id}"><div><b>${esc(musteriAdi(c))}</b><div class="mut">${esc(c.tel || c.adres || '')}</div></div><div class="mut r">${esc(c.vkn || '')}</div></div>`).join('') : '<p class="mut">Kayıtlı müşteri yok.</p>'}</div>`
  );
  $('#yeniM').onclick = () => musteriForm();
  $$('[data-mid]').forEach((e) => (e.onclick = () => musteriForm(db().musteriler.find((x) => x.id === e.dataset.mid))));
});

function musteriForm(c) {
  const v = c || { id: yeniId(), ad: '', soyad: '', unvan: '', vkn: '', vergiDairesi: '', adres: '', il: '', ilce: '', tel: '', eposta: '' };
  const inp = (k, t, ek = '') => `<label>${t}</label><input data-c="${k}" value="${esc(v[k])}" ${ek}/>`;
  const m = modal(`<h2 style="margin-top:0">${c ? 'Müşteriyi düzenle' : 'Yeni müşteri'}</h2>
    <div class="grid2"><div>${inp('ad', 'Ad')}</div><div>${inp('soyad', 'Soyad')}</div></div>
    ${inp('unvan', 'Firma ünvanı (firmaysa)')}
    <div class="grid2"><div>${inp('vkn', 'TC / Vergi no', 'inputmode="numeric" maxlength="11"')}</div><div>${inp('vergiDairesi', 'Vergi dairesi')}</div></div>
    ${inp('adres', 'Adres')}<div class="grid2"><div>${inp('il', 'İl')}</div><div>${inp('ilce', 'İlçe')}</div></div>
    <div class="grid2"><div>${inp('tel', 'Telefon', 'inputmode="tel"')}</div><div>${inp('eposta', 'E-posta')}</div></div>
    <button class="big" id="mk" style="margin-top:14px">Kaydet</button>
    ${c ? '<div class="row" style="margin-top:8px"><button class="sec" id="mf">Bu müşteriye fatura kes</button><button class="bad" id="ms">Sil</button></div>' : ''}`);
  $('#mk', m).onclick = () => {
    $$('[data-c]', m).forEach((e) => (v[e.dataset.c] = e.value.trim()));
    if (!v.ad && !v.unvan) return toast('Ad veya ünvan girin');
    upsert('musteriler', v);
    m.remove();
    yonlendir();
  };
  if (c) {
    $('#ms', m).onclick = () => { if (confirm('Müşteri silinsin mi?')) { sil('musteriler', v.id); m.remove(); yonlendir(); } };
    $('#mf', m).onclick = () => { const { id, ...mus } = v; taslak = { ...yeniTaslak(), musteri: mus, _firma: !!mus.unvan }; m.remove(); location.hash = '#/yeni'; };
  }
}

// ================= DAHA FAZLA =================
rota(/^\/daha$/, () => {
  sayfa('#/daha', `<h1>Daha Fazla</h1>
    <div class="card"><div class="item" onclick="location.hash='#/rapor'"><span>📊 Fatura dökümü / Rapor</span><span>›</span></div>
    <div class="item" onclick="location.hash='#/hizmetler'"><span>🔧 Hizmet listesi</span><span>›</span></div>
    <div class="item" onclick="location.hash='#/ayarlar'"><span>⚙️ Ayarlar</span><span>›</span></div></div>`);
});

// ================= HİZMETLER =================
rota(/^\/hizmetler$/, () => {
  const h = db().hizmetler;
  sayfa('#/daha', `<div class="row between"><h1>Hizmetler</h1><button class="auto" id="yeniH">＋ Ekle</button></div>
    <p class="mut">Sık yaptığınız işleri kaydedin; fatura keserken tek dokunuşla ekleyin.</p>
    <div class="card">${h.map((x) => `<div class="item" data-h="${x.id}"><div><b>${esc(x.ad)}</b><div class="mut">KDV %${x.kdv}</div></div><div class="r">${x.fiyat ? para(x.fiyat) : '—'}</div></div>`).join('') || '<p class="mut">Boş.</p>'}</div>`);
  $('#yeniH').onclick = () => hizmetForm();
  $$('[data-h]').forEach((e) => (e.onclick = () => hizmetForm(h.find((x) => x.id === e.dataset.h))));
});
function hizmetForm(x) {
  const v = x || { id: yeniId(), ad: '', birim: 'C62', fiyat: '', kdv: db().ayar.varsayilanKdv };
  const m = modal(`<h2 style="margin-top:0">${x ? 'Hizmeti düzenle' : 'Yeni hizmet'}</h2>
    <label>Adı</label><input id="ha" value="${esc(v.ad)}" />
    <div class="grid2"><div><label>Birim fiyat (₺)</label><input id="hf" inputmode="decimal" value="${esc(v.fiyat)}" /></div>
    <div><label>KDV</label><select id="hk">${KDV_ORANLARI.map((k) => `<option value="${k}" ${+v.kdv === k ? 'selected' : ''}>%${k}</option>`).join('')}</select></div></div>
    <label>Birim</label><select id="hb">${BIRIMLER.map(([k, a]) => `<option value="${k}" ${v.birim === k ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <button class="big" id="hs" style="margin-top:14px">Kaydet</button>${x ? '<button class="bad" id="hd" style="width:100%;margin-top:8px">Sil</button>' : ''}`);
  $('#hs', m).onclick = () => {
    v.ad = $('#ha', m).value.trim();
    if (!v.ad) return toast('Hizmet adı girin');
    v.fiyat = Number(String($('#hf', m).value).replace(',', '.')) || 0;
    v.kdv = +$('#hk', m).value;
    v.birim = $('#hb', m).value;
    upsert('hizmetler', v);
    m.remove();
    yonlendir();
  };
  if (x) $('#hd', m).onclick = () => { sil('hizmetler', v.id); m.remove(); yonlendir(); };
}

// ================= RAPOR / DÖKÜM =================
let rapor = { donem: 'buay', bas: '', bit: '', taslakDahil: false };
function donemAralik() {
  const n = new Date();
  if (rapor.donem === 'buay') return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59)];
  if (rapor.donem === 'gecenay') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0, 23, 59)];
  if (rapor.donem === 'buyil') return [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear(), 11, 31, 23, 59)];
  return [new Date((rapor.bas || isoGun(new Date(n.getFullYear(), n.getMonth(), 1))) + 'T00:00'), new Date((rapor.bit || isoGun(n)) + 'T23:59')];
}
function raporVeri() {
  const [bas, bit] = donemAralik();
  const liste = db().faturalar
    .filter((f) => f.tarihObj >= bas.toISOString() && f.tarihObj <= bit.toISOString())
    .filter((f) => f.durum === 'onaylandi' || (rapor.taslakDahil && f.durum === 'taslak'))
    .sort((a, b) => a.tarihObj.localeCompare(b.tarihObj));
  const toplam = { matrah: 0, kdv: 0, toplam: 0 };
  const kdvOran = {};
  const musteri = {};
  for (const f of liste) {
    const t = toplamAl(f);
    toplam.matrah += t.matrah; toplam.kdv += t.kdv; toplam.toplam += t.toplam;
    if (f.satirlar && f.satirlar.length) {
      for (const [o, v] of Object.entries(calcTotals(f.satirlar, f.kdvDahil).kdvDokum)) {
        kdvOran[o] = kdvOran[o] || { matrah: 0, kdv: 0 };
        kdvOran[o].matrah += v.matrah; kdvOran[o].kdv += v.kdv;
      }
    }
    const ad = musteriAdi(f.musteri);
    musteri[ad] = (musteri[ad] || 0) + t.toplam;
  }
  for (const k of Object.keys(toplam)) toplam[k] = r2(toplam[k]);
  return { bas, bit, liste, toplam, kdvOran, musteri };
}
rota(/^\/rapor$/, () => {
  const r = raporVeri();
  const chip = (v, t) => `<button data-d="${v}" class="${rapor.donem === v ? 'on' : ''}">${t}</button>`;
  const top = Object.entries(r.musteri).sort((a, b) => b[1] - a[1]).slice(0, 5);
  sayfa('#/daha', `<button class="ghost" onclick="history.back()">← Geri</button><h1>Fatura Dökümü</h1>
    <div class="chips">${chip('buay', 'Bu ay')}${chip('gecenay', 'Geçen ay')}${chip('buyil', 'Bu yıl')}${chip('ozel', 'Tarih aralığı')}</div>
    ${rapor.donem === 'ozel' ? `<div class="grid2" style="margin-top:8px"><input type="date" id="rb" value="${rapor.bas || isoGun(r.bas)}"/><input type="date" id="rt" value="${rapor.bit || isoGun(r.bit)}"/></div>` : ''}
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="td" style="width:auto" ${rapor.taslakDahil ? 'checked' : ''}/> Taslakları da say</label>
    <div class="card" style="margin-top:10px"><div class="sum"><span>Fatura sayısı</span><b>${r.liste.length}</b></div>
      <div class="sum"><span>Matrah</span><span>${para(r.toplam.matrah)}</span></div><div class="sum"><span>KDV</span><span>${para(r.toplam.kdv)}</span></div>
      <div class="sum t"><span>Toplam</span><span>${para(r.toplam.toplam)}</span></div></div>
    ${Object.keys(r.kdvOran).length ? `<h2>KDV dökümü</h2><div class="card">${Object.entries(r.kdvOran).map(([o, v]) => `<div class="sum"><span>%${o} · matrah ${para(v.matrah)}</span><span>${para(v.kdv)}</span></div>`).join('')}</div>` : ''}
    ${top.length ? `<h2>En çok çalışılan müşteriler</h2><div class="card">${top.map(([a, v]) => `<div class="sum"><span>${esc(a)}</span><span>${para(v)}</span></div>`).join('')}</div>` : ''}
    <div class="row"><button id="rpdf">📄 PDF döküm</button><button class="sec" id="rcsv">📊 Excel (CSV)</button></div>
    <h2>Faturalar</h2><div class="card">${r.liste.map(satirHtml).join('') || '<p class="mut">Bu dönemde fatura yok.</p>'}</div>`);
  $$('[data-d]').forEach((b) => (b.onclick = () => { rapor.donem = b.dataset.d; yonlendir(); }));
  $$('[data-fid]').forEach((e) => (e.onclick = () => (location.hash = '#/fatura/' + e.dataset.fid)));
  $('#td').onchange = (e) => { rapor.taslakDahil = e.target.checked; yonlendir(); };
  if ($('#rb')) { $('#rb').onchange = (e) => { rapor.bas = e.target.value; yonlendir(); }; $('#rt').onchange = (e) => { rapor.bit = e.target.value; yonlendir(); }; }
  const satirlar = r.liste.map((f) => { const t = toplamAl(f); return [gunKisa(f.tarihObj), f.belgeNumarasi || '-', musteriAdi(f.musteri), { onaylandi: 'Onaylı', taslak: 'Taslak', iptal: 'İptal' }[f.durum], para(t.matrah), para(t.kdv), para(t.toplam), f.odendi ? 'Ödendi' : 'Bekliyor']; });
  const baslik = `${tarihTR(r.bas)} – ${tarihTR(r.bit)} · ${r.liste.length} fatura`;
  $('#rpdf').onclick = () => pdfPaylas(raporPdfTanimi(baslik, satirlar, `Toplam: ${para(r.toplam.toplam)}  (Matrah ${para(r.toplam.matrah)} + KDV ${para(r.toplam.kdv)})`, db().ayar.firma), `Fatura-Dokumu-${isoGun(r.bas)}.pdf`);
  $('#rcsv').onclick = () => {
    const csv = ['Tarih;Fatura No;Müşteri;TC/VKN;Durum;Matrah;KDV;Toplam;Tahsilat']
      .concat(r.liste.map((f) => { const t = toplamAl(f); return [gunKisa(f.tarihObj), f.belgeNumarasi || '', musteriAdi(f.musteri), f.musteri.vkn || '', f.durum, String(t.matrah).replace('.', ','), String(t.kdv).replace('.', ','), String(t.toplam).replace('.', ','), f.odendi ? 'Ödendi' : 'Bekliyor'].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'); }))
      .join('\n');
    metinPaylas(csv, `fatura-dokumu-${isoGun(r.bas)}.csv`);
  };
});

// ================= AYARLAR =================
rota(/^\/ayarlar$/, () => {
  const a = db().ayar;
  const fr = a.firma;
  const inp = (k, t, ek = '') => `<label>${t}</label><input data-fr="${k}" value="${esc(fr[k])}" ${ek}/>`;
  sayfa('#/daha', `<button class="ghost" onclick="history.back()">← Geri</button><h1>Ayarlar</h1>
    <div class="card"><h2 style="margin-top:0">GİB e-Arşiv Portal</h2>
      <div class="seg"><button data-mode="prod" class="${a.mode === 'prod' ? 'on' : ''}">Gerçek</button><button data-mode="test" class="${a.mode === 'test' ? 'on' : ''}">🧪 Demo</button></div>
      ${a.mode === 'prod' ? `<label>Kullanıcı adı</label><input id="gu" value="${esc(a.user)}" autocomplete="off" /><label>Şifre</label><div class="row"><input id="gp" type="password" value="${esc(a.pass)}" autocomplete="off" autocapitalize="off" spellcheck="false" /><button class="sec auto" id="goz" type="button">👁</button></div>` : '<p class="mut">Demo modu GİB bağlantısı kurmaz; uygulamayı denemek içindir. Kesilen faturalar gerçek DEĞİLDİR.</p>'}
      <p class="mut">Bilgiler yalnızca bu telefonda saklanır, GİB dışında hiçbir yere gönderilmez.</p>
      <button class="sec" id="dene" style="width:100%">🔌 Bağlantıyı dene</button></div>
    <div class="card"><h2 style="margin-top:0">İşletme bilgileriniz (faturada görünür)</h2>
      ${inp('unvan', 'Ünvan / Ad Soyad')}<div class="grid2"><div>${inp('vkn', 'TC / Vergi no', 'inputmode="numeric"')}</div><div>${inp('vergiDairesi', 'Vergi dairesi')}</div></div>
      ${inp('adres', 'Adres')}<div class="grid2"><div>${inp('il', 'İl')}</div><div>${inp('ilce', 'İlçe')}</div></div>
      <div class="grid2"><div>${inp('tel', 'Telefon')}</div><div>${inp('eposta', 'E-posta')}</div></div></div>
    <div class="card"><h2 style="margin-top:0">Fatura varsayılanları</h2>
      <label>Varsayılan KDV</label><select id="vk">${KDV_ORANLARI.map((k) => `<option value="${k}" ${a.varsayilanKdv === k ? 'selected' : ''}>%${k}</option>`).join('')}</select>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="vd" style="width:auto" ${a.kdvDahil ? 'checked' : ''}/> Fiyatlar varsayılan olarak KDV dahil</label>
      <label>Varsayılan fatura notu</label><textarea id="vn" rows="2">${esc(a.notSablonu)}</textarea></div>
    <button class="big" id="kaydet">Kaydet</button>
    <div class="row" style="margin-top:12px"><button class="sec" id="yedek">⬇ Yedek al</button><button class="sec" id="yukle">⬆ Yedekten yükle</button></div>
    <input type="file" id="dosya" accept=".json" hidden />`);
  $$('[data-mode]').forEach((b) => (b.onclick = () => { topla(); a.mode = b.dataset.mode; kaydet(); yonlendir(); }));
  function topla() {
    if ($('#gu')) { a.user = $('#gu').value.trim(); a.pass = $('#gp').value.trim(); }
    $$('[data-fr]').forEach((e) => (fr[e.dataset.fr] = e.value.trim()));
    a.varsayilanKdv = +$('#vk').value;
    a.kdvDahil = $('#vd').checked;
    a.notSablonu = $('#vn').value;
  }
  $('#kaydet').onclick = () => { topla(); kaydet(); toast('✅ Kaydedildi'); };
  $('#dene').onclick = async () => {
    topla(); kaydet();
    const w = bekle('GİB\'e giriş deneniyor…');
    let g;
    try { g = getGib(); g.token = null; await g.login(); w.remove(); toast('✅ Bağlantı başarılı'); } catch (e) {
      w.remove();
      const tani = (g && (g.tumTani || g.sonTani)) || '';
      const m = modal(`<h2 style="margin-top:0">⚠ Bağlantı kurulamadı</h2><p>${esc(e.message)}</p>
        ${tani ? `<label>Teknik ayrıntı (şifre içermez)</label><textarea rows="8" readonly style="font-size:12px">${esc(tani)}</textarea>` : ''}
        <button class="sec big" id="tt" style="margin-top:12px">🔍 GİB giriş sayfasını incele</button>
        <button class="big" id="tm" style="margin-top:10px">Tamam</button>`);
      $('#tm', m).onclick = () => m.remove();
      $('#tt', m).onclick = async () => {
        $('#tt', m).disabled = true; $('#tt', m).textContent = '⏳ İnceleniyor…';
        const sonuc = await g.tani();
        m.remove();
        const m2 = modal(`<h2 style="margin-top:0">Giriş sayfası incelemesi</h2><textarea id="tsonuc" rows="14" readonly style="font-size:11px">${esc((tani ? tani + '\n\n=====\n\n' : '') + sonuc)}</textarea>
          <button class="big" id="kop" style="margin-top:12px">📋 Kopyala (bana yapıştırın)</button><button class="ghost" id="kapa" style="width:100%">Kapat</button>`);
        $('#kapa', m2).onclick = () => m2.remove();
        $('#kop', m2).onclick = async () => { const t = $('#tsonuc', m2); t.select(); try { await navigator.clipboard.writeText(t.value); toast('Kopyalandı'); } catch { document.execCommand('copy'); toast('Kopyalandı'); } };
      };
    }
  };
  if ($('#goz')) $('#goz').onclick = () => { const i = $('#gp'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#yedek').onclick = () => metinPaylas(yedekAl(), `ustafatura-yedek-${isoGun(new Date())}.json`, 'application/json');
  $('#yukle').onclick = () => $('#dosya').click();
  $('#dosya').onchange = async (e) => {
    try { yedekYukle(await e.target.files[0].text()); toast('✅ Yedek yüklendi'); yonlendir(); } catch (er) { toast('⚠ ' + er.message); }
  };
});

yonlendir();
