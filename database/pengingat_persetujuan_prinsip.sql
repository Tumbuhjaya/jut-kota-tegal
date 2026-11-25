-- Pengingat permohonan yang belum selesai 21-28 hari setelah tanggal persetujuan prinsip (helpper/pengingat_pp.js).
-- Email dikirim maksimal sekali per hari per permohonan; kolom ini mencatat pengiriman terakhir.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan_persetujuan_prinsip`
  ADD COLUMN `pengingat_terakhir` date DEFAULT NULL COMMENT 'tanggal email pengingat terakhir dikirim' AFTER `uploadTtdAt`,
  ADD COLUMN `pengingat_jumlah` int NOT NULL DEFAULT 0 COMMENT 'jumlah email pengingat yang sudah dikirim' AFTER `pengingat_terakhir`;
