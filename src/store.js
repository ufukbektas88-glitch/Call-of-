// Yerel veri deposu (telefonda uygulamaya özel alanda saklanır).
const KEY = 'ustafatura.v1';

const varsayilan = () => ({
  ayar: {
    mode: 'prod', // prod | test
    user: '',
    pass: '',
    hatirla: true,
    firma: { unvan: 'CEMİL DUR - ORCA TESİSAT', vkn: '45064396300', vergiDairesi: '', adres: 'İçerenköy Mahallesi Karslı Ahmet Caddesi Meskenler Girişi Sokak No: 2 Dükkan 2', il: 'İstanbul', ilce: 'Ataşehir', tel: '', eposta: '' },
    varsayilanKdv: 20,
    kdvDahil: false,
    notSablonu: '',
  },
  musteriler: [],
  hizmetler: [
    { id: 'h1', ad: 'Tesisat işçiliği', birim: 'C62', fiyat: 0, kdv: 20 },
    { id: 'h2', ad: 'Kaçak tamiri', birim: 'C62', fiyat: 0, kdv: 20 },
    { id: 'h3', ad: 'Musluk / batarya değişimi', birim: 'C62', fiyat: 0, kdv: 20 },
  ],
  faturalar: [],
});

let data;
function yukle() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const v = varsayilan();
      return { ...v, ...d, ayar: { ...v.ayar, ...d.ayar, firma: { ...v.ayar.firma, ...((d.ayar || {}).firma || {}) } } };
    }
  } catch {}
  return varsayilan();
}
data = yukle();

export const db = () => data;
export function kaydet() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
export function yedekAl() {
  const kopya = JSON.parse(JSON.stringify(data));
  kopya.ayar.pass = '';
  return JSON.stringify(kopya, null, 2);
}
export function yedekYukle(json) {
  const d = JSON.parse(json);
  if (!d || !Array.isArray(d.faturalar)) throw new Error('Geçersiz yedek dosyası.');
  const eskiPass = data.ayar.pass;
  data = { ...varsayilan(), ...d };
  data.ayar.pass = eskiPass;
  kaydet();
}

export const yeniId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function upsert(liste, kayit) {
  const i = data[liste].findIndex((x) => x.id === kayit.id);
  if (i >= 0) data[liste][i] = kayit;
  else data[liste].unshift(kayit);
  kaydet();
}
export function sil(liste, id) {
  data[liste] = data[liste].filter((x) => x.id !== id);
  kaydet();
}
