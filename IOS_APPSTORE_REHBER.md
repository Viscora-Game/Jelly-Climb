# Jelly Climb — iOS App Store & TestFlight Yayınlama Rehberi (Mac Gerekmez!)

Bu projede **Capacitor 8 + Swift Package Manager** iOS projesi (`ios/App/App.xcodeproj`) ve **GitHub Actions macOS 15 bulut derleme** akışı (`.github/workflows/ios-appstore.yml`) tamamen hazır durumda.

---

## Şimdiden Hazır Olanlar
- **Bundle ID:** `com.jellyclimb.arcade`
- **Cihaz Hedefi:** iPhone (dikey kilitli, tam ekran, çentik/Dynamic Island uyumlu; iPad'de otomatik uyumluluk modunda çalışır)
- **App Icon & Splash:** `1024×1024` şeffaflıksız (RGB opak, sıfır alpha) App Store ikonu + `#141838` lacivert açılış ekranı
- **Native Eklentiler:**
  - `@capacitor/haptics` — iPhone Taptic Engine gerçek titreşimleri (`src/haptics.js` ile otomatik bağlı)
  - `@capacitor-community/in-app-review` — İlk Boss zaferi veya 3.+ oyunda yeni rekor sonrası Apple'ın resmi 5 yıldız penceresi (`src/review.js`)
  - `@capacitor-community/admob` — iOS + Android ayrı reklam ID'leri + Apple ATT izin desteği (`src/ads.js`, şu an `ENABLED: false`)
  - `CapacitorHttp` — Canlı MongoDB Liderlik Tablosu (`https://jelly-climb.netlify.app`) CORS sorunu olmadan doğrudan çalışır
- **Export Compliance:** `ITSAppUsesNonExemptEncryption = false` (her yüklemede şifreleme sorusunu atlar)

---

## Apple Developer Hesabın `Active` Olunca Yapılacak 3 Adım (~5 Dakika)

### Adım 1 — App Store Connect'te Uygulamayı Oluştur
1. https://appstoreconnect.apple.com adresine gir → **Apps** → **`+` → New App**.
2. Ayarlar:
   - **Platform:** iOS
   - **Name:** `Jelly Climb`
   - **Primary Language:** Turkish (veya English U.S.)
   - **Bundle ID:** `com.jellyclimb.arcade` *(listede yoksa önce `developer.apple.com/account/resources/identifiers` bölümünden `+` → App IDs → Explicit `com.jellyclimb.arcade` olarak ekle)*
   - **SKU:** `jelly-climb-ios-01`

### Adım 2 — App Store Connect API Anahtarı Oluştur (`.p12` veya Mac Gerekmez!)
1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **`+` (Generate API Key)**.
2. **Name:** `GitHub Actions`, **Access:** `Admin` (veya `App Manager`).
3. Oluşan anahtarın `.p8` dosyasını indir ve şu 4 bilgiyi not al:
   - **`APPLE_TEAM_ID`**: https://developer.apple.com/account → Membership Details içindeki 10 haneli Team ID
   - **`APPLE_API_KEY_ID`**: Oluşturduğun anahtarın Key ID'si
   - **`APPLE_API_ISSUER_ID`**: Sayfanın üstündeki Issuer ID (UUID)
   - **`APPLE_API_PRIVATE_KEY`**: İndirdiğin `.p8` dosyasını Not Defteri ile açıp içindeki tüm metin (`-----BEGIN PRIVATE KEY-----` ... `-----END PRIVATE KEY-----`)

### Adım 3 — GitHub Secrets Ekle & Tek Tıkla TestFlight'a Yükle
1. GitHub reposuna git: **Settings → Secrets and variables → Actions → New repository secret** ve yukarıdaki 4 gizli değişkeni ekle.
2. **Actions** sekmesine gir → **iOS Build & App Store Connect Upload** → **Run workflow** → `mode`: **`upload-testflight`** seçip çalıştır!
3. ~4–5 dakika sonra imzalı derleme otomatik olarak **App Store Connect → TestFlight** sekmesine düşer. Kendi iPhone'unda TestFlight ile açıp oynayabilir ve aynı derlemeyi **Submit for Review** ile App Store'a gönderebilirsin!

---

## App Store Connect Form Bilgileri (Kopyala-Yapıştır)
- **Privacy Policy URL:** `https://jelly-climb.netlify.app/privacy-policy.html`
- **Support URL:** `https://jelly-climb.netlify.app/`
- **Age Rating:** `4+` (şiddet, kumar, kullanıcı sohbeti yok)
- **App Privacy:** Reklamlar kapalıyken (`ENABLED: false`) sadece anonim liderlik tablosu takma adı/skoru vardır; AdMob aktif edildiğinde **Device ID / Advertising Data** işaretlenir.

## Reklamları (AdMob) iOS'ta Aktif Etmek İstediğinde
1. Google AdMob panelinde **Jelly Climb (iOS)** uygulaması oluştur.
2. `ios/App/App/Info.plist` içindeki `GADApplicationIdentifier` değerini kendi gerçek iOS AdMob App ID'n ile değiştir.
3. `src/ads.js` içinde `UNIT_IDS.ios` altına kendi gerçek iOS Rewarded ve Interstitial Unit ID'lerini yazıp `ENABLED: true`, `TEST_MODE: false` yap.
