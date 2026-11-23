-- Kelengkapan persyaratan persetujuan prinsip yang dikirim pemohon (satu file ZIP).
-- Alur: upload persetujuan prinsip TTD -> email ke pemohon berisi link -> pemohon upload ZIP persyaratan
--       -> admin download ZIP & verifikasi persyaratan.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4), sesudah perizinan_tahapan_lanjutan.sql.

ALTER TABLE `permohonan_persetujuan_prinsip`
  ADD COLUMN `file_persyaratan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ZIP persyaratan dari pemohon (uploads/permohonan)' AFTER `uploadTtdAt`,
  ADD COLUMN `nama_asli_persyaratan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `file_persyaratan`,
  ADD COLUMN `uploadPersyaratanAt` datetime DEFAULT NULL COMMENT 'waktu kiriman terakhir yang belum diverifikasi; dikosongkan jika belum terpenuhi' AFTER `nama_asli_persyaratan`;
