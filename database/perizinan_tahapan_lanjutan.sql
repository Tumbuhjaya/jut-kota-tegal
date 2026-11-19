-- Lanjutan tahapan permohonan izin jaringan utilitas (setelah perizinan_tahapan.sql).
-- Alur: ... -> persetujuan prinsip -> verifikasi persyaratan -> penerbitan izin
--       (perjanjian sewa -> draft izin / SK -> upload izin TTD)
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4), sesudah perizinan_tahapan.sql.

-- Tahap baru verifikasi persyaratan persetujuan prinsip, sebelum penerbitan izin
ALTER TABLE `permohonan`
  MODIFY COLUMN `tahap` enum('verifikasi','peninjauan_lapangan','persetujuan_prinsip','verifikasi_persyaratan','penerbitan_izin')
      COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'verifikasi',
  -- Izin pemanfaatan ruang milik jalan (SK) yang sudah ditandatangani
  ADD COLUMN `file_sk` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'izin / SK bertanda tangan (uploads/permohonan)' AFTER `tanggal_sk`,
  ADD COLUMN `nama_asli_sk` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `file_sk`,
  ADD COLUMN `uploadSkAt` datetime DEFAULT NULL AFTER `nama_asli_sk`;

-- Hasil peninjauan lapangan: hanya yang layak yang BA-nya bisa diupload
ALTER TABLE `permohonan_peninjauan`
  ADD COLUMN `kelayakan` enum('layak','tidak_layak') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `hasil`;

-- Hasil verifikasi persyaratan persetujuan prinsip (keterangan terakhir jika belum terpenuhi)
ALTER TABLE `permohonan_persetujuan_prinsip`
  ADD COLUMN `keterangan_persyaratan` text COLLATE utf8mb4_unicode_ci AFTER `uploadTtdAt`,
  ADD COLUMN `persyaratanAt` datetime DEFAULT NULL COMMENT 'waktu persyaratan dinyatakan terpenuhi' AFTER `keterangan_persyaratan`,
  ADD COLUMN `persyaratan_oleh` int DEFAULT NULL COMMENT 'user.id_user admin' AFTER `persyaratanAt`;

-- Perjanjian sewa ruang milik jalan (satu per permohonan), dibuat di tahap penerbitan izin sebelum SK
CREATE TABLE IF NOT EXISTS `permohonan_perjanjian_sewa` (
  `permohonan_perjanjian_sewa_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_id` int NOT NULL,
  `no_perjanjian` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_perjanjian` date DEFAULT NULL,
  `isi` mediumtext COLLATE utf8mb4_unicode_ci COMMENT 'HTML dari CKEditor (ketentuan / pasal perjanjian)',
  `file_ttd` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'perjanjian sewa bertanda tangan (uploads/permohonan)',
  `nama_asli_ttd` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploadTtdAt` datetime DEFAULT NULL,
  `dibuat_oleh` int DEFAULT NULL COMMENT 'user.id_user admin',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_perjanjian_sewa_id`),
  UNIQUE KEY `uk_perjanjian_sewa_permohonan` (`permohonan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
