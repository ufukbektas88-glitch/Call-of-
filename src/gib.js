// GİB e-Arşiv Portal istemcisi (ücretsiz portal, kullanıcı adı + şifre ile).
// Not: GİB'in resmi bir API'si yok; portalın web arayüzünün kullandığı uçlar kullanılır.
import { Capacitor } from '@capacitor/core';
import { calcLine, calcTotals, r2 } from './calc.js';

const HOSTS = {
  prod: 'https://earsivportal.efatura.gov.tr',
  test: 'https://earsivportaltest.efatura.gov.tr',
};
const native = Capacitor.isNativePlatform();
// Tarayıcıda (geliştirme) CORS yüzünden vite proxy'si kullanılır; telefonda doğrudan.
const base = (mode) => (native ? HOSTS[mode] : `/gib-${mode}`);

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

// GİB test portalı kapandığı için "test" modu telefonda çalışan yerel bir simülasyondur.
const DEMO_KEY = 'orca.demo.v1';
const demoOku = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { sayac: 0, satirlar: [] }; } catch { return { sayac: 0, satirlar: [] }; } };
const demoYaz = (d) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch {} };
function demoCall(cmd, jp) {
  const d = demoOku();
  if (cmd === 'EARSIV_PORTAL_FATURA_OLUSTUR') {
    d.sayac++;
    const t = new Date();
    d.satirlar.push({
      ettn: jp.faturaUuid,
      belgeNumarasi: `DEMO${t.getFullYear()}${String(d.sayac).padStart(9, '0')}`,
      belgeTarihi: jp.faturaTarihi,
      aliciUnvanAdSoyad: jp.aliciUnvan || `${jp.aliciAdi} ${jp.aliciSoyadi}`.trim(),
      aliciVknTckn: jp.vknTckn,
      onayDurumu: 'Onaylanmadı',
    });
    demoYaz(d);
    return 'DEMO: taslak oluşturuldu';
  }
  if (cmd === 'EARSIV_PORTAL_TASLAKLARI_GETIR') return d.satirlar;
  if (cmd === 'EARSIV_PORTAL_SMSSIFRE_GONDER') return { oid: 'DEMO-OID' };
  if (cmd === 'EARSIV_PORTAL_SMSSIFRE_DOGRULA') {
    const ettnler = (jp.DATA || []).map((x) => x.ettn);
    d.satirlar.forEach((s) => ettnler.includes(s.ettn) && (s.onayDurumu = 'Onaylandı'));
    demoYaz(d);
    return { sonuc: '1', msg: 'DEMO onaylandı' };
  }
  if (cmd === 'EARSIV_PORTAL_FATURA_SIL') {
    const ettnler = (jp.silinecekler || []).map((x) => x.ettn);
    d.satirlar = d.satirlar.filter((s) => !ettnler.includes(s.ettn));
    demoYaz(d);
    return 'DEMO: silindi';
  }
  return {};
}

export class Gib {
  constructor({ mode = 'prod', user = '', pass = '' } = {}) {
    this.mode = mode;
    this.user = user;
    this.pass = pass;
    this.token = null;
    this.sonTani = '';
  }

  async _post(path, params, ekBaslik = {}) {
    const url = base(this.mode) + path;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json, text/plain, */*', ...ekBaslik },
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) {
      this.sonTani = `AĞ HATASI\n${url}\n${e && e.message ? e.message : e}`;
      throw new Error('GİB sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    const text = typeof res.text === 'function' ? await res.text() : typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    this.sonTani = `HTTP ${res.status}\n${url}\nkomut: ${params.cmd || params.assoscmd}\n\n${String(text).slice(0, 600)}`;
    this.tumTani = (this.tumTani || '') + this.sonTani + '\n\n';
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`GİB beklenmeyen yanıt verdi (HTTP ${res.status}). Ayrıntı için "Teknik ayrıntı"ya bakın.`);
    }
  }

  async login() {
    if (this.mode === 'test') { this.token = 'DEMO'; return true; }
    const u = this.user, p = this.pass;
    const kok = base(this.mode);
    const sayfaBaslik = { Referer: kok + '/intragiris.html', Origin: kok, 'X-Requested-With': 'XMLHttpRequest' };
    // GİB giriş biçimi değişmiş olabilir; bilinen biçimleri sırayla dener, ilk token'ı kullanır.
    const varyantlar = [
      // GİB'in kendi giriş sayfası (intragiris.html) assoscmd olarak "anologin" gönderir.
      [{ assoscmd: 'anologin', rtype: 'json', userid: u, sifre: p, sifre2: p, parola: '1' }, sayfaBaslik],
      [{ assoscmd: 'anologin', rtype: 'json', userid: u, sifre: p, sifre2: p, parola: '1' }, {}],
      [{ assoscmd: 'login', rtype: 'json', userid: u, sifre: p, sifre2: p, parola: '1' }, {}],
      [{ assoscmd: 'login', rtype: 'json', userid: u, sifre: p, sifre2: p, parola: '1' }, sayfaBaslik],
      [{ assoscmd: 'login', rtype: 'json', userid: u, sifre: p, parola: '1' }, sayfaBaslik],
      [{ assoscmd: 'login', rtype: 'json', userid: u, sifre: p, sifre2: p }, sayfaBaslik],
      [{ assoscmd: 'login', userid: u, sifre: p, sifre2: p, parola: '1' }, sayfaBaslik],
    ];
    this.tumTani = '';
    let ilkHata = '';
    for (let i = 0; i < varyantlar.length; i++) {
      const r = await this._post('/earsiv-services/assos-login', varyantlar[i][0], varyantlar[i][1]);
      if (r.token) {
        this.token = r.token;
        this.calisanVaryant = i + 1;
        return true;
      }
      if (!ilkHata) ilkHata = (r.messages && r.messages[0] && r.messages[0].text) || r.error || 'Giriş başarısız. Kullanıcı adı/şifre kontrol edin.';
    }
    throw new Error(ilkHata);
  }

  // Telefondan GİB giriş sayfasını ve betiklerini okuyup giriş çağrısını gösterir (tanı).
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
      const betikler = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
      cikti.push('betikler: ' + betikler.join(' , '));
      const kaynaklar = [['intragiris.html', html]];
      for (const s of betikler.slice(0, 15)) {
        try { kaynaklar.push([s, await al(new URL(s, kok + '/intragiris.html').href)]); } catch (e) { cikti.push('okunamadı: ' + s); }
      }
      let n = 0;
      for (const [ad, t] of kaynaklar) {
        const re = /assos-login|assoscmd/g;
        let m;
        let k = 0;
        while ((m = re.exec(t)) && k < 2 && n < 6) {
          cikti.push(`--- ${ad} @${m.index}\n` + t.slice(Math.max(0, m.index - 300), m.index + 400).replace(/\s+/g, ' '));
          k++; n++;
        }
      }
      if (!n) cikti.push('Giriş çağrısı bulunamadı.');
    } catch (e) {
      cikti.push('Sayfa okunamadı: ' + (e && e.message));
    }
    return cikti.join('\n\n');
  }

  async logout() {
    if (!this.token || this.mode === 'test') { this.token = null; return; }
    try {
      await this._post('/earsiv-services/assos-login', { assoscmd: 'logout', rtype: 'json', token: this.token });
    } catch {}
    this.token = null;
  }

  async call(cmd, pageName, jp, retried = false) {
    if (this.mode === 'test') return demoCall(cmd, jp);
    if (!this.token) await this.login();
    const r = await this._post('/earsiv-services/dispatch', {
      cmd,
      callid: uuid(),
      pageName,
      token: this.token,
      jp: JSON.stringify(jp || {}),
    });
    if (r.error || (r.data && r.data.error)) {
      const m = String(r.messages && r.messages[0] ? r.messages[0].text : r.error || '');
      if (!retried && /oturum|token|login/i.test(m + r.error)) {
        this.token = null;
        return this.call(cmd, pageName, jp, true);
      }
      throw new Error(m || 'GİB işlemi reddetti.');
    }
    return r.data;
  }

  // Alıcı bilgisini VKN/TCKN ile sorgula (ünvan, vergi dairesi vb.)
  async sorgula(vknTckn) {
    return this.call('SICIL_VEYA_MERNISTEN_BILGILERI_GETIR', 'RG_BASITTASLAKLAR', { vknTcknn: vknTckn });
  }

  async taslakOlustur(fatura) {
    return this.call('EARSIV_PORTAL_FATURA_OLUSTUR', 'RG_BASITFATURA', fatura);
  }

  async listele(baslangic, bitis) {
    const d = await this.call('EARSIV_PORTAL_TASLAKLARI_GETIR', 'RG_TASLAKLAR', {
      baslangic: tarihTR(baslangic),
      bitis: tarihTR(bitis),
      hangiTip: '5000/30000',
      table: [],
    });
    return Array.isArray(d) ? d : [];
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

  async telefonSorgula() {
    const d = await this.call('EARSIV_PORTAL_TELEFONNO_SORGULA', 'RG_BASITTASLAKLAR', {});
    return d && d.telefon;
  }

  async smsGonder(telNo = '') {
    const d = await this.call('EARSIV_PORTAL_SMSSIFRE_GONDER', 'RG_SMSONAY', { CEPTEL: telNo, KCEPTEL: false, TIP: '' });
    if (!d || !d.oid) throw new Error('SMS gönderilemedi.');
    return d.oid;
  }

  async onayla(oid, sifre, taslaklar) {
    const d = await this.call('EARSIV_PORTAL_SMSSIFRE_DOGRULA', 'RG_SMSONAY', {
      SIFRE: sifre,
      OID: oid,
      OPR: 1,
      DATA: taslaklar,
    });
    if (d && String(d.sonuc) === '0') throw new Error(d.msg || 'Onay başarısız (SMS kodu hatalı olabilir).');
    return d;
  }

  async sil(taslak, aciklama = 'Hatalı fatura') {
    return this.call('EARSIV_PORTAL_FATURA_SIL', 'RG_TASLAKLAR', { silinecekler: [taslak], aciklama });
  }

  async htmlGetir(ettn, onayDurumu = 'Onaylandı') {
    return this.call('EARSIV_PORTAL_FATURA_GOSTER', 'RG_TASLAKLAR', { ettn, onayDurumu });
  }
}

// Uygulama içi fatura kaydı → GİB "jp" gövdesi
export function gibFaturaGovdesi(f) {
  const dahil = !!f.kdvDahil;
  const t = calcTotals(f.satirlar, dahil);
  const m = f.musteri;
  const d = f.tarihObj ? new Date(f.tarihObj) : new Date();
  const kisi = !m.unvan;
  return {
    faturaUuid: f.id,
    belgeNumarasi: '',
    faturaTarihi: tarihTR(d),
    saat: saatTR(d),
    paraBirimi: 'TRY',
    dovzTLkur: '0',
    faturaTipi: 'SATIS',
    vknTckn: m.vkn || '11111111111',
    aliciUnvan: kisi ? '' : m.unvan,
    aliciAdi: kisi ? m.ad || '' : '',
    aliciSoyadi: kisi ? m.soyad || '' : '',
    binaAdi: '',
    binaNo: '',
    kapiNo: '',
    kasabaKoy: '',
    vergiDairesi: m.vergiDairesi || '',
    ulke: 'Türkiye',
    bulvarcaddesokak: m.adres || '',
    mahalleSemtIlce: m.ilce || '',
    sehir: m.il || ' ',
    postaKodu: '',
    tel: m.tel || '',
    fax: '',
    eposta: m.eposta || '',
    websitesi: '',
    iadeTable: [],
    ozelMatrahTutari: '0',
    ozelMatrahOrani: 0,
    ozelMatrahVergiTutari: '0',
    vergiCesidi: ' ',
    malHizmetTable: f.satirlar.map((l) => {
      const c = calcLine(l, dahil);
      return {
        malHizmet: l.ad,
        miktar: Number(l.miktar) || 0,
        birim: l.birim || 'C62',
        birimFiyat: String(c.birimFiyatNet),
        fiyat: String(c.birimFiyatNet),
        iskontoOrani: Number(l.iskontoOrani) || 0,
        iskontoTutari: String(c.iskonto),
        iskontoNedeni: c.iskonto ? 'İskonto' : '',
        malHizmetTutari: String(c.net),
        kdvOrani: Number(l.kdvOrani) || 0,
        vergiOrani: 0,
        kdvTutari: String(c.kdv),
        vergininKdvTutari: '0',
      };
    }),
    tip: 'İskonto',
    matrah: String(t.matrah),
    malhizmetToplamTutari: String(t.brut),
    toplamIskonto: String(t.iskonto),
    hesaplanankdv: String(t.kdv),
    vergilerToplami: String(t.kdv),
    vergilerDahilToplamTutar: String(t.toplam),
    odenecekTutar: String(t.toplam),
    not: f.not || '',
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
  };
}

export { uuid, r2 };
