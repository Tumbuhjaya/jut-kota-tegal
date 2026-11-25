-- Kategori digitasi permohonan jaringan utilitas (= komponen retribusi):
--   tiang: t_k30cm (D <= 30 cm), t_l30cm (D > 30 cm)
--   kabel: jr_btk15cm / jr_btl15cm (bawah tanah D <= / > 15 cm), jr_atk15cm / jr_atl15cm (atas tanah D <= / > 15 cm)
-- Saat SK terbit, kategori disalin ke kolom bernama sama di tabel tiang / kabel dengan format data survey
-- (kolom kategori terisi kodenya sendiri, mis. t_k30cm = 't_k30cm', kolom lain NULL).
-- Digitasi lama dianggap t_k30cm & jr_atk15cm, sama seperti perlakuan sebelumnya.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan_tiang`
  ADD COLUMN `kategori` enum('t_k30cm','t_l30cm') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 't_k30cm' AFTER `jumlah`;

ALTER TABLE `permohonan_kabel`
  ADD COLUMN `kategori` enum('jr_btk15cm','jr_btl15cm','jr_atk15cm','jr_atl15cm') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'jr_atk15cm' AFTER `jumlah`;

-- Tabel kabel baru punya kolom kategori atas tanah; tambah kategori bawah tanah
ALTER TABLE `kabel`
  ADD COLUMN `jr_btk15cm` varchar(254) DEFAULT NULL AFTER `jr_atl15cm`,
  ADD COLUMN `jr_btl15cm` varchar(254) DEFAULT NULL AFTER `jr_btk15cm`;
