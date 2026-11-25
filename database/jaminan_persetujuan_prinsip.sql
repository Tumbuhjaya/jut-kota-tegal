-- Data jaminan pada draft persetujuan prinsip (helpper/tahapan_perizinan.js: JAMINAN).
-- Daftar Izin Pemanfaatan Rumija memberi keterangan bila tanggal akhir jaminan tersisa <= 2 bulan.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan_persetujuan_prinsip`
  ADD COLUMN `jaminan_pelaksanaan_bank` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `persyaratan`,
  ADD COLUMN `jaminan_pelaksanaan_nomor` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `jaminan_pelaksanaan_bank`,
  ADD COLUMN `jaminan_pelaksanaan_nominal` decimal(18,2) DEFAULT NULL AFTER `jaminan_pelaksanaan_nomor`,
  ADD COLUMN `jaminan_pelaksanaan_tgl_awal` date DEFAULT NULL AFTER `jaminan_pelaksanaan_nominal`,
  ADD COLUMN `jaminan_pelaksanaan_tgl_akhir` date DEFAULT NULL AFTER `jaminan_pelaksanaan_tgl_awal`,

  ADD COLUMN `jaminan_pemeliharaan_bank` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `jaminan_pelaksanaan_tgl_akhir`,
  ADD COLUMN `jaminan_pemeliharaan_nomor` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `jaminan_pemeliharaan_bank`,
  ADD COLUMN `jaminan_pemeliharaan_nominal` decimal(18,2) DEFAULT NULL AFTER `jaminan_pemeliharaan_nomor`,
  ADD COLUMN `jaminan_pemeliharaan_tgl_awal` date DEFAULT NULL AFTER `jaminan_pemeliharaan_nominal`,
  ADD COLUMN `jaminan_pemeliharaan_tgl_akhir` date DEFAULT NULL AFTER `jaminan_pemeliharaan_tgl_awal`,

  -- Asuransi kerugian pihak ketiga (polis asuransi public liability)
  ADD COLUMN `asuransi_pihak_ketiga_bank` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `jaminan_pemeliharaan_tgl_akhir`,
  ADD COLUMN `asuransi_pihak_ketiga_nomor` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `asuransi_pihak_ketiga_bank`,
  ADD COLUMN `asuransi_pihak_ketiga_nominal` decimal(18,2) DEFAULT NULL AFTER `asuransi_pihak_ketiga_nomor`,
  ADD COLUMN `asuransi_pihak_ketiga_tgl_awal` date DEFAULT NULL AFTER `asuransi_pihak_ketiga_nominal`,
  ADD COLUMN `asuransi_pihak_ketiga_tgl_akhir` date DEFAULT NULL AFTER `asuransi_pihak_ketiga_tgl_awal`;
