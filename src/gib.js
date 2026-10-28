// GİB e-Arşiv Portal istemcisi (ücretsiz portal, kullanıcı adı + şifre ile).
// Not: GİB'in resmi bir API'si yok; portalın web arayüzünün kullandığı uçlar kullanılır.
// Komut adları açık kaynak f/fatura kütüphanesinin canlı portalla doğrulanmış sürümüne göre.
import { Capacitor } from '@capacitor/core';
import { calcLine, calcTotals, yaziyla, r2 } from './calc.js';

const HOSTS = {
  prod: 'https://earsivportal.efatura.gov.tr',
  test: 'https://earsivportaltest.efatura.gov.tr',
};
const native = Capacitor.isNativePlatform();
// Tarayıcıda (geliştirme) CORS yüzünden vite proxy'si kullanılır; telefonda doğrudan.
const base = (mode) => (native ? HOSTS[mode] : `/gib-${mode}`);

const CMD = {
  olustur: ['EARSIV_PORTAL_FATURA_OLUSTUR', 'RG_BASITFATURA'],
  liste: ['EARSIV_PORTAL_TASLAKLARI_GETIR', 'RG_BASITTASLAKLAR'],
  goster: ['EARSIV_PORTAL_FATURA_GOSTER', 'RG_BASITTASLAKLAR'],
  sil: ['EARSIV_PORTAL_FATURA_SIL', 'RG_BASITTASLAKLAR'],
  alici: ['SICIL_VEYA_MERNISTEN_BILGILERI_GETIR', 'RG_BASITFATURA'],
  telefon: ['EARSIV_PORTAL_TELEFONNO_SORGULA', 'RG_SMSONAY'],
  smsGonder: ['EARSIV_PORTAL_SMSSIFRE_GONDER', 'RG_SMSONAY'],
  // GİB imzalama servisini okunabilir addan opak bir kimliğe taşıdı (eski ad "Service Not Found" verir).
  kullanici: ['EARSIV_PORTAL_KULLANICI_BILGILERI_GETIR', 'RG_KULLANICI'],
  smsDogrula: ['0lhozfib5410mp', 'RG_SMSONAY'],
};

const uuid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

export const tarihTR = (d = new Date()) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
export const saatTR = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

// ---------- Demo (GİB test portalı kapalı; yerel simülasyon) ----------
const DEMO_KEY = 'orca.demo.v1';
const demoOku = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { sayac: 0, satirlar: [] }; } catch { return { sayac: 0, satirlar: [] }; } };
const demoYaz = (d) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch {} };
function demoCall(cmd, jp) {
  const d = demoOku();
  if (cmd === CMD.olustur[0]) {
    d.sayac++;
    d.satirlar.push({
      ettn: uuid(),
      belgeNumarasi: `DEMO${new Date().getFullYear()}${String(d.sayac).padStart(9, '0')}`,
      belgeTarihi: jp.faturaTarihi.replace(/\//g, '-'),
      aliciUnvanAdSoyad: jp.aliciUnvan || `${jp.aliciAdi} ${jp.aliciSoyadi}`.trim(),
      aliciVknTckn: jp.vknTckn,
      onayDurumu: 'Onaylanmadı',
      _html: `<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;margin:30px"><h2 style="margin:0">DEMO e-ARŞİV FATURA</h2><p style="color:#a00">Bu belge gerçek değildir; GİB'e bağlı değildir.</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Mal / Hizmet</th><th>Tutar</th></tr><tr><td>Demo kalem</td><td>1.000,00 TL</td></tr></table><p>ETTN ve belge numarası resmi belgede GİB tarafından verilir.</p></body></html>`,
    });
    demoYaz(d);
    return { data: 'DEMO: Faturanız başarıyla oluşturulmuştur.' };
  }
  if (cmd === CMD.kullanici[0]) return { data: { vknTckn: '45064396300', unvan: 'DEMO HESAP', ad: 'Demo', soyad: 'Kullanıcı' } };
  if (cmd === CMD.liste[0]) return { data: d.satirlar };
  if (cmd === CMD.telefon[0]) return { data: { telefon: '5XXXXXXXXX' } };
  if (cmd === CMD.smsGonder[0]) return { data: { oid: 'DEMO-OID' } };
  if (cmd === CMD.smsDogrula[0]) {
    const ettnler = (jp.DATA || []).map((x) => x.ettn);
    d.satirlar.forEach((s) => ettnler.includes(s.ettn) && (s.onayDurumu = 'Onaylandı'));
    demoYaz(d);
    return { data: { sonuc: '1', msg: 'DEMO onaylandı' } };
  }
  if (cmd === CMD.sil[0]) {
    const ettnler = (jp.silinecekler || []).map((x) => x.ettn);
    d.satirlar = d.satirlar.filter((s) => !ettnler.includes(s.ettn));
    demoYaz(d);
    return { data: 'DEMO: silindi' };
  }
  if (cmd === CMD.goster[0]) return { data: (d.satirlar.find((s) => s.ettn === jp.ettn) || {})._html || '' };
  return { data: {} };
}

const TOKEN_KEY = 'orca.gibtoken.';
const tokenOku = (mode) => { try { return localStorage.getItem(TOKEN_KEY + mode) || ''; } catch { return ''; } };
const tokenYaz = (mode, t) => { try { t ? localStorage.setItem(TOKEN_KEY + mode, t) : localStorage.removeItem(TOKEN_KEY + mode); } catch {} };

function hataMetni(r) {
  const m = r.messages && r.messages[0];
  const metin = (typeof m === 'string' ? m : m && m.text) || 'GİB işlemi reddetti.';
  if (/aynı anda birden fazla giriş/i.test(metin)) {
    return 'GİB hesabınızda başka bir oturum açık (tarayıcıda veya başka telefonda). earsivportal.efatura.gov.tr\'ye girip sağ üstten "Güvenli Çıkış" yapın, sonra tekrar deneyin. Oturum bir süre sonra kendiliğinden de düşer.';
  }
  if (/e-Ar[şs]iv Portal Fatura.*kesemez/i.test(metin)) {
    return metin + ' → Giriş yaptığınız GİB hesabı bu numaraya ait. Ayarlar\'daki kullanıcı kodunun SİZİN hesabınıza ait olduğunu kontrol edin (Bağlantıyı dene → hesap adını gösterir). Hesap doğruysa bu mükellef e-Fatura mükellefidir ve e-Arşiv portalından fatura kesemez.';
  }
  return metin;
}

export class Gib {
  constructor({ mode = 'prod', user = '', pass = '' } = {}) {
    this.mode = mode;
    this.user = user;
    this.pass = pass;
    this.token = null;
    this.sonTani = '';
    this.tumTani = '';
  }

  async _post(path, params, ekBaslik = {}) {
    const url = base(this.mode) + path;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*', ...ekBaslik },
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) {
      this.sonTani = `AĞ HATASI\n${url}\n${e && e.message ? e.message : e}`;
      throw new Error('GİB sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    const text = typeof res.text === 'function' ? await res.text() : typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    this.sonTani = `HTTP ${res.status}\n${url}\nkomut: ${params.cmd || params.assoscmd}\n\n${String(text).slice(0, 600)}`;
    this.tumTani += this.sonTani + '\n\n';
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`GİB beklenmeyen yanıt verdi (HTTP ${res.status}). Ayrıntı için "Teknik ayrıntı"ya bakın.`);
    }
  }

  // Önceki oturum açık kalmışsa (uygulama kapanmış olabilir) önce onu kapatır.
  async eskiOturumuKapat() {
    const eski = tokenOku(this.mode);
    if (!eski) return;
    for (const komut of ['anologin', 'logout']) {
      try { await this._post('/earsiv-services/assos-login', { assoscmd: komut, rtype: 'json', token: eski }); } catch {}
    }
    tokenYaz(this.mode, '');
  }

  async login() {
    if (this.mode === 'test') { this.token = 'DEMO'; return true; }
    const u = this.user, p = this.pass;
    const kok = base(this.mode);
    const sayfaBaslik = { Referer: kok + '/intragiris.html', Origin: kok, 'X-Requested-With': 'XMLHttpRequest' };
    this.tumTani = '';
    await this.eskiOturumuKapat();
    let ilkHata = '';
    // GİB'in kendi giriş sayfası assoscmd olarak "anologin" gönderir.
    for (const ek of [{}, sayfaBaslik]) {
      const r = await this._post('/earsiv-services/assos-login', { assoscmd: 'anologin', rtype: 'json', userid: u, sifre: p, sifre2: p, parola: '1' }, ek);
      if (r.token) { this.token = r.token; tokenYaz(this.mode, r.token); return true; }
      if (!ilkHata) ilkHata = r.error && r.error !== '0' ? hataMetni(r) : 'Giriş başarısız. Kullanıcı adı/şifre kontrol edin.';
      if (/başka bir oturum/i.test(ilkHata)) break;
    }
    throw new Error(ilkHata);
  }

  // "Güvenli Çıkış": her iş bitince çağrılır ki GİB'de oturum açık kalıp tarayıcı girişini engellemesin.
  async logout() {
    const t = this.token;
    this.token = null;
    if (this.mode === 'test') return;
    tokenYaz(this.mode, '');
    if (!t) return;
    for (const komut of ['anologin', 'logout']) {
      try { await this._post('/earsiv-services/assos-login', { assoscmd: komut, rtype: 'json', token: t }); } catch {}
    }
  }

  // Tam cevabı döner ({data, oid, ...}); hata varsa fırlatır.
  async cagir(komut, jp, retried = false) {
    const [cmd, pageName] = komut;
    if (this.mode === 'test') return demoCall(cmd, jp || {});
    if (!this.token) await this.login();
    const r = await this._post('/earsiv-services/dispatch', {
      cmd,
      callid: uuid(),
      pageName,
      token: this.token,
      jp: JSON.stringify(jp || {}),
    });
    if (r.error && r.error !== '0') {
      const m = hataMetni(r);
      if (!retried && /oturum|token|login|session/i.test(m)) {
        this.token = null;
        return this.cagir(komut, jp, true);
      }
      throw new Error(m);
    }
    return r;
  }

  // Giriş yapılan GİB hesabının kimliği (VKN/TCKN, ünvan)
  async kullanici() {
    const r = await this.cagir(CMD.kullanici, {});
    const d = r.data || {};
    return { vkn: String(d.vknTckn || ''), ad: d.unvan || [d.ad, d.soyad].filter(Boolean).join(' ') };
  }

  async listele(baslangic, bitis) {
    const r = await this.cagir(CMD.liste, { baslangic: tarihTR(baslangic), bitis: tarihTR(bitis), hangiTip: '5000/30000', table: [] });
    return Array.isArray(r.data) ? r.data : [];
  }

  // GİB aralık sınırı nedeniyle 30 günlük parçalarla geriye doğru çeker.
  async listeleAralik(baslangic, bitis) {
    const out = [];
    let end = new Date(bitis);
    while (end >= baslangic) {
      const start = new Date(Math.max(baslangic.getTime(), end.getTime() - 29 * 86400000));
      out.push(...(await this.listele(start, end)));
      end = new Date(start.getTime() - 86400000);
    }
    return out;
  }

  // ETTN'yi GİB atar: oluşturmadan önce/sonra o günün listesi karşılaştırılıp yeni kayıt bulunur.
  async taslakOlustur(jp, tarih = new Date()) {
    const once = new Set((await this.listele(tarih, tarih)).map((x) => x.ettn));
    const r = await this.cagir(CMD.olustur, jp);
    const metin = typeof r.data === 'string' ? r.data : '';
    if (!/başarıyla oluşturulmuştur/i.test(metin)) throw new Error(metin || 'GİB taslak faturayı oluşturmadı.');
    const sonra = await this.listele(tarih, tarih);
    const yeni = sonra.find((x) => !once.has(x.ettn));
    if (!yeni) throw new Error('Taslak oluştu ama GİB listesinde bulunamadı. "GİB ile eşitle" ile kontrol edin.');
    return yeni;
  }

  async satirBul(ettn, tarih = new Date()) {
    const bas = new Date(tarih.getTime() - 2 * 86400000);
    const bit = new Date(Math.max(Date.now(), tarih.getTime()) + 86400000);
    return (await this.listele(bas, bit)).find((x) => x.ettn === ettn);
  }

  // İmza SMS'i GİB'e kayıtlı telefona gider; numara önce sorgulanmalı.
  async smsGonder() {
    const t = await this.cagir(CMD.telefon, {});
    const tel = t.data && t.data.telefon;
    if (!tel) throw new Error('GİB\'e kayıtlı telefon numarası alınamadı.');
    const r = await this.cagir(CMD.smsGonder, { CEPTEL: tel, KCEPTEL: false, TIP: '' });
    const oid = (r.data && r.data.oid) || r.oid;
    if (!oid) throw new Error('SMS gönderilemedi.');
    return { oid, tel };
  }

  // SMS kodunu doğrular ve listedeki faturaları imzalar (mali işlem).
  async onayla(oid, sifre, satirlar) {
    const r = await this.cagir(CMD.smsDogrula, { SIFRE: sifre, OID: oid, OPR: 1, DATA: satirlar });
    if (String((r.data && r.data.sonuc) ?? '') !== '1') throw new Error((r.data && r.data.msg) || 'Onay başarısız (SMS kodu hatalı olabilir).');
    return true;
  }

  async sil(satir, aciklama = 'Hatalı fatura') {
    const r = await this.cagir(CMD.sil, { silinecekler: [satir], aciklama });
    return r.data;
  }

  // GİB'in resmi fatura görünümü (HTML)
  async htmlGetir(ettn, onaylandi = true) {
    const r = await this.cagir(CMD.goster, { ettn, onayDurumu: onaylandi ? 'Onaylandı' : 'Onaylanmadı' });
    return typeof r.data === 'string' ? r.data : '';
  }

  indirmeUrl(ettn, onaylandi = true) {
    return `${base(this.mode)}/earsiv-services/download?token=${this.token}&ettn=${ettn}&belgeTip=FATURA&onayDurumu=${encodeURIComponent(onaylandi ? 'Onaylandı' : 'Onaylanmadı')}&cmd=downloadResource&`;
  }

  // Telefondan GİB giriş sayfasını okuyup giriş çağrısını gösterir (tanı).
  async tani() {
    const kok = base('prod');
    const cikti = [];
    const al = async (u) => {
      const r = await fetch(u, { headers: { Accept: '*/*' } });
      return typeof r.text === 'function' ? r.text() : String(r.data);
    };
    try {
      const html = await al(kok + '/intragiris.html');
      cikti.push(`intragiris.html: ${html.length} karakter`);
      const m = html.match(/assoscmd[^}]{0,300}/);
      cikti.push(m ? m[0].replace(/\s+/g, ' ') : 'Giriş çağrısı bulunamadı.');
    } catch (e) {
      cikti.push('Sayfa okunamadı: ' + (e && e.message));
    }
    return cikti.join('\n\n');
  }
}

const para2 = (n) => Number(n || 0).toFixed(2);

// Uygulama içi fatura kaydı → GİB "jp" gövdesi (alan seti canlı portalla doğrulanmış kütüphaneye uygun)
export function gibFaturaGovdesi(f) {
  const dahil = !!f.kdvDahil;
  const t = calcTotals(f.satirlar, dahil);
  const m = f.musteri;
  const d = f.tarihObj ? new Date(f.tarihObj) : new Date();
  const kisi = !m.unvan;
  const sifirOran = ['komisyon', 'navlun', 'hammaliye', 'nakliye'];
  const ekler = {};
  for (const k of sifirOran) {
    ekler[k + 'Orani'] = 0; ekler[k + 'Tutari'] = '0';
    ekler[k + 'KDVOrani'] = 0; ekler[k + 'KDVTutari'] = '0';
  }
  for (const k of ['halRusumu', 'ticaretBorsasi', 'milliSavunmaFonu', 'diger']) {
    ekler[k + 'Orani'] = 0; ekler[k + 'Tutari'] = '0';
    ekler[k + 'KDVOrani'] = 0; ekler[k + 'KDVTutari'] = '0';
  }
  const yalniz = `Yalnız ${yaziyla(t.toplam)}`;
  return {
    faturaUuid: '',
    belgeNumarasi: '',
    faturaTarihi: tarihTR(d),
    saat: saatTR(d),
    paraBirimi: 'TRY',
    dovzTLkur: '0',
    faturaTipi: '5000/30000',
    hangiTip: 'Buyuk',
    siparisNumarasi: '',
    siparisTarihi: '',
    irsaliyeNumarasi: '',
    irsaliyeTarihi: '',
    fisNo: '',
    fisTarihi: '',
    fisSaati: ' ',
    fisTipi: ' ',
    zRaporNo: '',
    okcSeriNo: '',
    vknTckn: m.vkn || '11111111111',
    aliciUnvan: kisi ? '' : m.unvan,
    aliciAdi: kisi ? m.ad || '' : '',
    aliciSoyadi: kisi ? m.soyad || '' : '',
    bulvarcaddesokak: m.adres || '',
    binaAdi: '',
    binaNo: '',
    kapiNo: '',
    kasabaKoy: '',
    mahalleSemtIlce: m.ilce || '',
    sehir: m.il || ' ',
    ulke: 'Türkiye',
    postaKodu: '',
    tel: m.tel || '',
    fax: '',
    eposta: m.eposta || '',
    websitesi: '',
    vergiDairesi: m.vergiDairesi || '',
    ...ekler,
    gelirVergisiOrani: 0,
    bagkurTevkifatiOrani: 0,
    gelirVergisiTevkifatiTutari: '0',
    bagkurTevkifatiTutari: '0',
    iadeTable: [],
    ozelMatrahTutari: '0',
    ozelMatrahOrani: 0,
    ozelMatrahVergiTutari: '0.00',
    vergiCesidi: ' ',
    malHizmetTable: f.satirlar.map((l) => {
      const c = calcLine(l, dahil);
      return {
        iskontoArttm: 'İskonto',
        malHizmet: l.ad,
        miktar: Number(l.miktar) || 0,
        birim: l.birim || 'C62',
        birimFiyat: para2(c.birimFiyatNet),
        fiyat: para2(c.net),
        iskontoOrani: Number(l.iskontoOrani) || 0,
        iskontoTutari: para2(c.iskonto),
        iskontoNedeni: c.iskonto ? 'İskonto' : '',
        malHizmetTutari: para2(c.brut),
        kdvOrani: String(Number(l.kdvOrani) || 0),
        vergiOrani: 0,
        kdvTutari: para2(c.kdv),
        vergininKdvTutari: '0.00',
      };
    }),
    tip: 'İskonto',
    matrah: para2(t.matrah),
    malhizmetToplamTutari: para2(t.brut),
    toplamIskonto: para2(t.iskonto),
    hesaplanankdv: para2(t.kdv),
    vergilerToplami: para2(t.kdv),
    vergilerDahilToplamTutar: para2(t.toplam),
    toplamMasraflar: '0',
    odenecekTutar: para2(t.toplam),
    not: f.not ? `${f.not}\n${yalniz}` : yalniz,
  };
}

export { uuid, r2 };
