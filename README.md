# 🔧 Usta Fatura

Tesisatçılar ve küçük esnaf için telefondan **GİB e-Arşiv Portal (ücretsiz)** üzerinden fatura kesme uygulaması.

## Özellikler
- GİB kullanıcı adı/şifre ile giriş, taslak oluşturma, **SMS ile onay**
- Müşteri kartları (şahıs/firma, TC/VKN, adres, telefon) ve hazır **hizmet listesi**
- KDV %0/1/10/20, iskonto, **KDV dahil/hariç** fiyat, birden çok kalem
- Faturayı **PDF olarak WhatsApp'tan** gönderme
- Fatura geçmişi, arama/filtre, **GİB ile eşitleme** (eski faturaları çekme)
- Tahsilat takibi (ödendi/bekliyor), ana sayfa özeti
- **Fatura dökümü**: aylık/yıllık/özel tarih, KDV dökümü, PDF ve Excel (CSV) dışa aktarma
- Test modu (GİB test portalı), yedek alma/yükleme

## APK nasıl alınır
GitHub → **Actions** → son "APK Derle" çalışması → **Artifacts → UstaFatura-apk** → `app-debug.apk` telefona kurulur
(Android'de "bilinmeyen kaynaklardan yükleme"ye izin vermek gerekir).

## Geliştirme
```
npm install
npm run dev      # tarayıcıda (GİB istekleri vite proxy'den geçer)
npm test
npm run android:sync
```

## Önemli notlar
- GİB'in ücretsiz portalı için resmi API yoktur; uygulama portalın web arayüzünün kullandığı uçları kullanır. GİB değişiklik yaparsa güncelleme gerekebilir.
- Uygulamadaki PDF bir **fatura görünümüdür**; resmi belge GİB e-Arşiv Portal'daki kayıttır.
- Şifre yalnızca telefonda, uygulamaya özel alanda saklanır.
