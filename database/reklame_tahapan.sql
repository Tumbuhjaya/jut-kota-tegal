-- Permohonan izin reklame memakai alur & tabel permohonan yang sama dengan jaringan utilitas
-- (verifikasi dokumen awal -> verifikasi -> peninjauan lapangan -> persetujuan prinsip -> penerbitan izin),
-- dibedakan lewat permohonan.jenis_izin. Reklame tanpa retribusi dan isiannya hanya titik per ruas jalan.
-- Tabel lama reklame / reklame_ruas / reklame_titik / reklame_dokumen tidak dipakai lagi.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan`
  ADD COLUMN `jenis_izin` enum('jaringan_utilitas','reklame') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'jaringan_utilitas' AFTER `permohonan_id`,
  ADD KEY `idx_permohonan_jenis_izin` (`jenis_izin`);

-- Jumlah titik reklame per ruas, mengikuti hasil digitasi titik
ALTER TABLE `permohonan_ruas`
  ADD COLUMN `jumlah_titik` int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `permohonan_titik` (
  `permohonan_titik_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_id` int NOT NULL,
  `permohonan_ruas_id` int NOT NULL,
  `SHAPE` geometry NOT NULL,
  `jumlah` int NOT NULL DEFAULT '1',
  `keterangan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_titik_id`),
  KEY `idx_ptk_ruas` (`permohonan_ruas_id`,`deletedAt`),
  KEY `idx_ptk_permohonan` (`permohonan_id`),
  SPATIAL KEY `sp_ptk_shape` (`SHAPE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
