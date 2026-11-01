# PC Wake — EMQX MQTT PWA (v2.0)

Bu klasör, gönderdiğiniz `wol-main.zip` projesinin **mevcut görünümünü koruyan MQTT sürümüdür**. Google Apps Script istekleri kaldırıldı; GitHub Pages üzerinde doğrudan EMQX Cloud Serverless'a bağlanır. Yeni bir servis veya ayrı backend gerektirmez.

## Bağlantı

- MQTT broker: `mfc1e7d3.ala.us-east-1.emqxsl.com`
- iPhone PWA: `wss://mfc1e7d3.ala.us-east-1.emqxsl.com:8084/mqtt`
- ESP32: aynı broker üzerinde TLS portu `8883`
- iPhone kullanıcı adı: `iphone_wol` (şifre uygulamanın Ayarlar ekranında girilir)
- Her PWA oturumu kendine benzersiz bir MQTT Client ID oluşturur.

### Topic ve yükler

| Topic | iPhone izni | ESP32 izni | Yük |
| --- | --- | --- | --- |
| `ev/wol/command` | Publish | Subscribe | `WAKE` — retain **false**, QoS 1 publish |
| `ev/wol/pc/status` | Subscribe | Publish | `ON`, `OFF`, `UNKNOWN` — retain **true** |
| `ev/wol/esp/status` | Subscribe | Publish | `online`, `offline` (LWT) — retain **true** |

Bu topic ve yükler önceki `ESP32_WOL_EMQX_v1_0.ino` sürümüyle uyumludur. MQTT ile yalnızca mesaj durum değiştiğinde ve ESP32 tarafından 5 dakikada bir periyodik olarak yayınlanır; ESP32 PC'yi yerel ağda 5 saniyede bir ping'lemeye devam eder. PWA artık 5 saniyede bir Apps Script isteği göndermez.

`esp/status` isteğe bağlı olarak `{"online":true,"rssi":-68}` biçiminde JSON da yayınlayabilir. Bu durumda eski PWA'daki RSSI sayısal göstergesi tekrar kullanılır. Önceki ESP32 MQTT v1.0 sadece `online`/`offline` gönderdiğinden RSSI bilinmiyorsa gösterge `ON / MQTT` olarak görünür. Ölçülmeyen bir RSSI değeri uydurulmaz.

## GitHub Pages yayınlama

1. GitHub'daki mevcut `wol` projenin **depo kökündeki** dosyaları bu klasördeki güncellenmiş dosyalarla değiştir (resim dosyaları dahil).
2. GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**.
3. Adres genellikle `https://KULLANICIADI.github.io/wol/` şeklinde olacaktır. Repo adı farklıysa URL de farklıdır.
4. iPhone Safari ile aç. **Paylaş → Ana Ekrana Ekle**.
5. İlk açılışta **Ayarlar** içinde `iphone_wol` ve EMQX'te oluşturduğun bu kullanıcıya ait şifreyi yaz, **Kaydet ve bağlan**.
6. ESP32 çevrimiçi, PC `OFF` durumunda görünüyorsa **Wake** düğmesi aktif olur.

## Güvenlik

- MQTT kullanıcı adı varsayılandır; **şifre hiç bir GitHub kaynak dosyasına yazılmaz**.
- **Bu cihazda giriş bilgilerini hatırla** seçeneği varsayılan olarak kapalıdır. Açılırsa kullanıcı adı ve şifre iPhone'un bu PWA'ya ait `localStorage` alanına düz metin olarak kaydedilir; paylaşılan cihazlarda kullanmayın. Kaydetmezsen şifre sadece aktif sayfa belleğinde tutulur ve sayfa yeniden yüklenince tekrar gerekir.
- Eskiden kalan `pc-wake-settings-v1` anahtarındaki Apps Script PHONE_TOKEN artık kullanılmadığı için ilk çalıştırmada yerel tarayıcı depolamasından silinir.
- `WAKE` komutu **retained değildir**. PWA yalnızca mevcut bağlantı sırasında broker'a gönderir; **broker PUBACK**, PC'nin gerçekten açıldığını değil, komutun broker tarafından alındığını doğrular.
- PC durumu retained mesaj olarak geldiğinde gerçek kontrol zamanı bilinmez. Ekrandaki "Son MQTT alımı" saati **mesajın PWA'ya geldiği zamanı** gösterir, ESP32 ping zamanını değil. ESP çevrimdışıysa PC'nin önceki retained hali güncel olarak sunulmaz.
- EMQX Authorization'da `iphone_wol` için yalnızca `ev/wol/command` publish ve diğer iki topic subscribe izni verin; `All Users # Publish & Subscribe Deny` fallback kuralı açık kalsın.

## Dosya listesi

- `index.html`: orijinal görsel tasarım, MQTT ayarları
- `app.js`: arayüz/kimlik bilgileri/MQTT durum ve Wake işleyişi
- `mqtt-wss.js`: dış CDN gerektirmeyen küçük MQTT 3.1.1 WebSocket istemcisi
- `state.js`: durum etiketleri ve gösterimi
- `service-worker.js`: önbellek güncellemesi
- `manifest.json`, `icon-*.png`: mevcut PWA ana ekran yapılandırması ve ikonlar

## Notlar

- iPhone uygulaması **arka plana geçince MQTT bağlantısını kapatır**, yeniden açılınca şifre hâlâ bellekteyse tekrar bağlanıp retained durumları alır. iOS'ta arka planda sürekli WebSocket tutmak güvenilir değildir.
- İnternet erişimi ve MQTT TLS sertifikası gerekli. Tarayıcı ve EMQX arasındaki WSS bağlantısı `8084` portunu kullanır.
- MQTT üzerinden gerçek bağlantı kullanıcı şifresi olmadan doğrulanamaz. Kod MQTT paket ve UI durum işleyişiyle yerel test edilmiştir; yayınlandıktan sonra telefon + ESP32 ile son test yapılmalıdır.
