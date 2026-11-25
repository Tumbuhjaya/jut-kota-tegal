-- Nomor SKRD (Surat Ketetapan Retribusi Daerah) pada draft persetujuan prinsip.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan_persetujuan_prinsip`
  ADD COLUMN `no_skrd` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tanggal_pp`;
