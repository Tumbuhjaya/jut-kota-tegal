-- Permohonan izin pembukaan jalan / akses (permohonan.jenis_izin = 'pembukaan_jalan').
-- Alur sama dengan jaringan utilitas (tanpa provider & verifikasi awal); isiannya titik akses per ruas jalan.
-- Setiap titik punya kategori + luas (M2): jl_pribadi / usaha_kcl / usaha_mngh / usaha_bsr (tarif Rp/M2/tahun di master_retribusi).
-- Retribusi per ruas = luas tiap kategori x tarif kategori ruas tersebut.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan`
  MODIFY COLUMN `jenis_izin` enum('jaringan_utilitas','reklame','pembukaan_jalan') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'jaringan_utilitas';

-- Tarif (disalin dari master_retribusi saat ruas disimpan) & luas hasil digitasi per kategori
ALTER TABLE `permohonan_ruas`
  ADD COLUMN `jl_pribadi` double(19,11) DEFAULT NULL,
  ADD COLUMN `jml_jl_pribadi` decimal(14,2) NOT NULL DEFAULT '0.00',
  ADD COLUMN `usaha_kcl` double(19,11) DEFAULT NULL,
  ADD COLUMN `jml_usaha_kcl` decimal(14,2) NOT NULL DEFAULT '0.00',
  ADD COLUMN `usaha_mngh` double(19,11) DEFAULT NULL,
  ADD COLUMN `jml_usaha_mngh` decimal(14,2) NOT NULL DEFAULT '0.00',
  ADD COLUMN `usaha_bsr` double(19,11) DEFAULT NULL,
  ADD COLUMN `jml_usaha_bsr` decimal(14,2) NOT NULL DEFAULT '0.00';

CREATE TABLE IF NOT EXISTS `permohonan_akses` (
  `permohonan_akses_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_id` int NOT NULL,
  `permohonan_ruas_id` int NOT NULL,
  `SHAPE` geometry NOT NULL,
  `jumlah` int NOT NULL DEFAULT '1',
  `kategori` enum('jl_pribadi','usaha_kcl','usaha_mngh','usaha_bsr') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'jl_pribadi',
  `luas` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'M2',
  `keterangan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_akses_id`),
  KEY `idx_pak_ruas` (`permohonan_ruas_id`,`deletedAt`),
  KEY `idx_pak_permohonan` (`permohonan_id`),
  SPATIAL KEY `sp_pak_shape` (`SHAPE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
