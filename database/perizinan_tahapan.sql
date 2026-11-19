-- Tahapan proses permohonan izin jaringan utilitas di backoffice.
-- Alur: diajukan -> verifikasi -> peninjauan lapangan (BA) -> persetujuan prinsip -> penerbitan izin (SK, proses lama)
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

-- Tahap berjalan permohonan berstatus 'diajukan'. Revisi / pengajuan ulang mengembalikan ke 'verifikasi'.
ALTER TABLE `permohonan`
  ADD COLUMN `tahap` enum('verifikasi','peninjauan_lapangan','persetujuan_prinsip','penerbitan_izin')
      COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'verifikasi' AFTER `status`,
  ADD COLUMN `diverifikasiAt` datetime DEFAULT NULL AFTER `diajukanAt`,
  ADD COLUMN `diverifikasi_oleh` int DEFAULT NULL COMMENT 'user.id_user admin yang memverifikasi' AFTER `diverifikasiAt`,
  ADD KEY `idx_permohonan_tahap` (`tahap`);

-- Permohonan yang sudah diproses sebelum tahapan ini ada dianggap sudah di tahap penerbitan izin
UPDATE `permohonan` SET `tahap` = 'penerbitan_izin' WHERE `status` IN ('disetujui','ditolak');

-- Berita acara peninjauan lapangan (satu per permohonan)
CREATE TABLE IF NOT EXISTS `permohonan_peninjauan` (
  `permohonan_peninjauan_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_id` int NOT NULL,
  `tim_teknis` text COLLATE utf8mb4_unicode_ci COMMENT 'nama anggota tim teknis, satu per baris',
  `no_ba` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_ba` date DEFAULT NULL,
  `no_surat_permohonan` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_surat_permohonan` date DEFAULT NULL,
  `hasil` mediumtext COLLATE utf8mb4_unicode_ci COMMENT 'HTML dari CKEditor',
  `file_ba` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'BA yang sudah ditandatangani (uploads/permohonan)',
  `nama_asli_ba` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploadBaAt` datetime DEFAULT NULL,
  `dibuat_oleh` int DEFAULT NULL COMMENT 'user.id_user admin',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_peninjauan_id`),
  UNIQUE KEY `uk_peninjauan_permohonan` (`permohonan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Foto dokumentasi peninjauan lapangan, slot 1..6 (upload ulang mengganti slot yang sama)
CREATE TABLE IF NOT EXISTS `permohonan_peninjauan_foto` (
  `permohonan_peninjauan_foto_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_peninjauan_id` int NOT NULL,
  `urutan` tinyint NOT NULL,
  `nama_file` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nama_asli` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_peninjauan_foto_id`),
  UNIQUE KEY `uk_peninjauan_foto_urutan` (`permohonan_peninjauan_id`, `urutan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persetujuan prinsip (satu per permohonan)
CREATE TABLE IF NOT EXISTS `permohonan_persetujuan_prinsip` (
  `permohonan_persetujuan_prinsip_id` int NOT NULL AUTO_INCREMENT,
  `permohonan_id` int NOT NULL,
  `no_pp` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_pp` date DEFAULT NULL,
  `persyaratan` mediumtext COLLATE utf8mb4_unicode_ci COMMENT 'HTML dari CKEditor',
  `file_ttd` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'persetujuan prinsip bertanda tangan (uploads/permohonan)',
  `nama_asli_ttd` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploadTtdAt` datetime DEFAULT NULL,
  `dibuat_oleh` int DEFAULT NULL COMMENT 'user.id_user admin',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  PRIMARY KEY (`permohonan_persetujuan_prinsip_id`),
  UNIQUE KEY `uk_persetujuan_prinsip_permohonan` (`permohonan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
