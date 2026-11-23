-- QC perizinan: verifikasi akun pemohon, tim teknis & no. surat permohonan saat verifikasi,
-- master penandatangan, field instansi user.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4), sesudah perizinan_tahapan_lanjutan.sql.

-- Instansi (untuk tim teknis) + verifikasi akun hasil daftar mandiri.
-- Default 'disetujui' agar akun yang sudah ada tetap bisa login; pendaftaran baru diisi 'menunggu'.
ALTER TABLE `user`
  ADD COLUMN `instansi` varchar(150) DEFAULT NULL AFTER `NIP`,
  ADD COLUMN `status_verifikasi` enum('menunggu','disetujui','ditolak') NOT NULL DEFAULT 'disetujui',
  ADD COLUMN `keterangan_verifikasi` text,
  ADD COLUMN `diverifikasiAt` datetime DEFAULT NULL,
  ADD COLUMN `diverifikasi_oleh` int DEFAULT NULL COMMENT 'user.id_user admin';

-- Master penandatangan dokumen perizinan (BA, persetujuan prinsip, SK)
CREATE TABLE IF NOT EXISTS `master_penandatangan` (
  `penandatangan_id` int NOT NULL AUTO_INCREMENT,
  `nama` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nip` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jabatan` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pangkat` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'pangkat / golongan',
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`penandatangan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Diisi saat permohonan lolos verifikasi
ALTER TABLE `permohonan`
  ADD COLUMN `no_surat_permohonan` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `penandatangan_id` int DEFAULT NULL COMMENT 'master_penandatangan';

-- Anggota tim teknis (user is_admin = 4) per permohonan
CREATE TABLE IF NOT EXISTS `permohonan_tim_teknis` (
  `permohonan_id` int NOT NULL,
  `id_user` int NOT NULL,
  PRIMARY KEY (`permohonan_id`, `id_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
