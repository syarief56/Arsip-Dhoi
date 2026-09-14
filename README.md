# Arsip Saya

Aplikasi web pribadi untuk menyimpan dokumen dan foto, filenya tersimpan langsung di Google Drive-mu sendiri. Bisa ditambahkan ke beranda HP seperti aplikasi biasa (PWA).

## 1. Buat Google Client ID (sekali saja, gratis)

1. Buka https://console.cloud.google.com/ dan login dengan akun Google-mu.
2. Buat project baru (nama bebas, misal "Arsip Saya").
3. Buka menu **APIs & Services > Library**, cari **Google Drive API**, klik **Enable**.
4. Buka **APIs & Services > OAuth consent screen**:
   - Pilih **External**, isi nama app "Arsip Saya" dan email kamu.
   - Di bagian **Test users**, tambahkan email Google kamu sendiri.
   - Simpan (tidak perlu submit untuk verifikasi, karena hanya kamu yang pakai).
5. Buka **APIs & Services > Credentials > Create Credentials > OAuth client ID**:
   - Application type: **Web application**
   - Di **Authorized JavaScript origins**, tambahkan alamat website kamu nanti (contoh: `https://arsip-saya.vercel.app`). Kalau mau coba dulu di HP/komputer secara lokal, tambahkan juga `http://localhost:5500` atau sesuai server lokal yang kamu pakai.
   - Klik **Create**, lalu salin **Client ID** yang muncul (bentuknya seperti `xxxxxxxx.apps.googleusercontent.com`).

## 2. Deploy websitenya (gratis)

Paling gampang pakai **Vercel** atau **Netlify**:

1. Upload folder ini ke GitHub (bikin repo baru, push semua file).
2. Buka https://vercel.com, login pakai GitHub, klik **New Project**, pilih repo tadi, klik **Deploy**.
3. Setelah selesai, kamu akan dapat alamat seperti `https://arsip-saya.vercel.app`.
4. Balik ke Google Cloud Console > Credentials, edit OAuth client ID tadi, pastikan alamat ini sudah ditambahkan di **Authorized JavaScript origins**.

## 3. Pakai aplikasinya

1. Buka alamat website kamu di HP (pakai Chrome).
2. Tempel **Client ID** yang tadi disalin, lalu tekan **Masuk dengan Google**.
3. Login dan izinkan akses ke Google Drive.
4. Aplikasi otomatis membuat folder bernama **"Arsip Saya"** di Drive kamu — semua file yang diunggah lewat aplikasi ini akan masuk ke folder tersebut.
5. Di Chrome, ketuk menu titik tiga di pojok kanan atas > **Add to Home screen** / **Install app**. Icon aplikasi akan muncul di beranda HP kamu seperti aplikasi biasa.

## Struktur file

```
index.html      halaman utama
styles.css      tampilan
app.js          logika: login, unggah, tampilkan, cari file
manifest.json   supaya bisa di-install ke beranda HP
sw.js           service worker (offline shell + caching)
icons/          icon aplikasi
```

## Catatan

- Client ID disimpan di penyimpanan browser HP kamu (localStorage), bukan di server manapun.
- Karena app ini didaftarkan sebagai "Testing" (belum diverifikasi Google), sesi login akan perlu di-refresh ulang setiap 7 hari. Kalau mau permanen, Google punya proses verifikasi app, tapi untuk pemakaian pribadi biasanya tidak perlu.
- Kalau nanti mau nambah fitur (folder custom, preview gambar langsung, dsb), tinggal edit `app.js` dan `index.html`.
