import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLine, calcTotals, yaziyla } from '../src/calc.js';

test('KDV hariç satır', () => {
  const c = calcLine({ miktar: 2, birimFiyat: 100, kdvOrani: 20, iskontoOrani: 10 });
  assert.equal(c.net, 180); assert.equal(c.kdv, 36); assert.equal(c.toplam, 216);
});
test('KDV dahil fiyat', () => {
  const t = calcTotals([{ miktar: 1, birimFiyat: 120, kdvOrani: 20 }], true);
  assert.equal(t.matrah, 100); assert.equal(t.kdv, 20); assert.equal(t.toplam, 120);
});
test('Karışık KDV dökümü', () => {
  const t = calcTotals([{ miktar: 1, birimFiyat: 100, kdvOrani: 20 }, { miktar: 1, birimFiyat: 100, kdvOrani: 10 }]);
  assert.equal(t.kdv, 30); assert.deepEqual(Object.keys(t.kdvDokum), ['10', '20']);
});
test('Yazıyla', () => {
  assert.equal(yaziyla(120.5), 'Yüz Yirmi Türk Lirası Elli Kuruş');
  assert.equal(yaziyla(2345), 'İki Bin Üç Yüz Kırk Beş Türk Lirası');
  assert.equal(yaziyla(1000), 'Bin Türk Lirası');
  assert.equal(yaziyla(0), 'Sıfır Türk Lirası');
});
