-- Tahap awal permohonan izin jaringan utilitas: pemohon mengetik nama provider (teks bebas) + upload dokumen persyaratan,
-- lalu admin memverifikasi keduanya sekaligus di backoffice (memilihkan provider dari master).
-- Alur status_provider: belum -> (pemohon klik Verifikasi) menunggu -> (admin) terverifikasi / ditolak
-- Pengisian ruas jalan, simpan & ajukan baru bisa dilakukan setelah terverifikasi.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan`
  ADD COLUMN `provider_usulan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'nama provider yang diketik pemohon' AFTER `provider_id`,
  ADD COLUMN `status_provider` enum('belum','menunggu','terverifikasi','ditolak')
      COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'belum' AFTER `provider_usulan`,
  ADD COLUMN `keterangan_provider` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'alasan admin menolak usulan provider' AFTER `status_provider`,
  ADD COLUMN `provider_diusulkanAt` datetime DEFAULT NULL AFTER `keterangan_provider`,
  ADD COLUMN `provider_diverifikasiAt` datetime DEFAULT NULL AFTER `provider_diusulkanAt`,
  ADD COLUMN `provider_diverifikasi_oleh` int DEFAULT NULL COMMENT 'user.id_user admin yang memilihkan provider' AFTER `provider_diverifikasiAt`,
  ADD KEY `idx_permohonan_status_provider` (`status_provider`);

-- Permohonan lama yang sudah punya provider dianggap sudah terverifikasi
UPDATE `permohonan` SET `status_provider` = 'terverifikasi' WHERE `provider_id` IS NOT NULL;
