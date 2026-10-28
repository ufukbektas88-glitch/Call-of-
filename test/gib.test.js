import test from 'node:test';
import assert from 'node:assert/strict';
import { gibFaturaGovdesi } from '../src/gib.js';

const f = {
  tarihObj: '2026-10-28T10:00:00',
  musteri: { ad: 'Ali', soyad: 'Veli', vkn: '', unvan: '', adres: 'X', il: 'İstanbul', ilce: 'Ataşehir' },
  kdvDahil: false,
  not: '',
  satirlar: [{ ad: 'Tesisat işçiliği', miktar: 2, birim: 'C62', birimFiyat: 500, kdvOrani: 20, iskontoOrani: 0 }],
};

test('GİB gövdesi: ETTN boş, toplamlar tutarlı', () => {
  const j = gibFaturaGovdesi(f);
  assert.equal(j.faturaUuid, '');
  assert.equal(j.faturaTipi, '5000/30000');
  assert.equal(j.vknTckn, '11111111111');
  assert.equal(j.matrah, '1000.00');
  assert.equal(j.hesaplanankdv, '200.00');
  assert.equal(j.odenecekTutar, '1200.00');
  assert.equal(j.malHizmetTable[0].kdvOrani, '20');
  assert.equal(j.malHizmetTable[0].malHizmetTutari, '1000.00');
  assert.match(j.not, /Yalnız Bin İki Yüz Türk Lirası/);
});
