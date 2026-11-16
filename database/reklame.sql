-- Tabel permohonan izin reklame oleh vendor (user.is_admin = 3).
-- Alur: daftar permohonan -> ruas jalan (+ dokumen persyaratan) -> digitasi titik reklame per ruas -> ajukan -> diproses admin
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

CREATE TABLE IF NOT EXISTS `reklame` (
  `reklame_id` int NOT NULL AUTO_INCREMENT,
  `id_user` int NOT NULL COMMENT 'user.id_user vendor pemohon (is_admin=3)',
  `dibuat_oleh` int DEFAULT NULL COMMENT 'user.id_user pengisi (vendor sendiri / admin)',
  `nama_pemohon` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alamat_pemohon` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telp_pemohon` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_pemohon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','diajukan','revisi','disetujui','ditolak') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `keterangan` text COLLATE utf8mb4_unicode_ci COMMENT 'catatan admin saat approve / tolak / revisi',
  `no_sk` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_sk` date DEFAULT NULL,
  `diajukanAt` datetime DEFAULT NULL,
  `diprosesAt` datetime DEFAULT NULL,
  `diproses_oleh` int DEFAULT NULL COMMENT 'user.id_user admin yang memproses',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`reklame_id`),
  KEY `idx_reklame_user` (`id_user`),
  KEY `idx_reklame_status` (`status`),
  KEY `idx_reklame_deletedAt` (`deletedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reklame_ruas` (
  `reklame_ruas_id` int NOT NULL AUTO_INCREMENT,
  `reklame_id` int NOT NULL,
  `ruas_id` int DEFAULT NULL COMMENT 'master_retribusi.id (baris Jalan Lain = di luar ruas)',
  `no` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'master_retribusi.no (no ruas SK)',
  `nm_ruas` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'master_retribusi.nm_ruas',
  `tarif` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Rp/titik/tahun, disalin dari master_retribusi saat disimpan',
  `jumlah_titik` int NOT NULL DEFAULT '0' COMMENT 'titik reklame, mengikuti digitasi jika sudah didigitasi',
  `jangka_waktu` int NOT NULL DEFAULT '1' COMMENT 'tahun',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`reklame_ruas_id`),
  KEY `idx_rr_reklame` (`reklame_id`,`deletedAt`),
  KEY `idx_rr_ruas` (`ruas_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reklame_titik` (
  `reklame_titik_id` int NOT NULL AUTO_INCREMENT,
  `reklame_id` int NOT NULL,
  `reklame_ruas_id` int NOT NULL,
  `SHAPE` geometry NOT NULL,
  `keterangan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`reklame_titik_id`),
  KEY `idx_rt_ruas` (`reklame_ruas_id`,`deletedAt`),
  KEY `idx_rt_reklame` (`reklame_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reklame_dokumen` (
  `reklame_dokumen_id` int NOT NULL AUTO_INCREMENT,
  `reklame_id` int NOT NULL,
  `jenis_dokumen` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nama_file` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'nama file tersimpan di uploads/reklame/',
  `nama_asli` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'nama file asli dari pengguna',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  PRIMARY KEY (`reklame_dokumen_id`),
  UNIQUE KEY `uq_reklame_dokumen_jenis` (`reklame_id`,`jenis_dokumen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
