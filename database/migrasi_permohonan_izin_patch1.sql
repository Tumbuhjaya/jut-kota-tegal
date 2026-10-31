-- ============================================================
-- Patch untuk database yang SUDAH menjalankan versi awal
-- migrasi_permohonan_izin.sql (tabel permohonan* sudah ada).
-- Target: MySQL 5.7. Jalankan sekali saja.
--
-- Menambahkan:
--   1) permohonan.dibuat_oleh         -> admin mengisi atas nama vendor
--   2) tiang/kabel.permohonan_id dll. -> salinan digitasi saat permohonan disetujui
-- ============================================================

ALTER TABLE `permohonan`
  ADD COLUMN `dibuat_oleh` INT(11) DEFAULT NULL
      COMMENT 'user.id_user pengisi; beda dgn id_user = diisi admin atas nama vendor' AFTER `id_user`;

-- Permohonan yang sudah ada dianggap diisi oleh vendornya sendiri
UPDATE `permohonan` SET `dibuat_oleh` = `id_user` WHERE `dibuat_oleh` IS NULL;

ALTER TABLE `tiang`
  ADD COLUMN `permohonan_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan.permohonan_id jika berasal dari izin vendor',
  ADD COLUMN `permohonan_tiang_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan_tiang.permohonan_tiang_id',
  ADD KEY `idx_tiang_permohonan` (`permohonan_id`);

ALTER TABLE `kabel`
  ADD COLUMN `permohonan_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan.permohonan_id jika berasal dari izin vendor',
  ADD COLUMN `permohonan_kabel_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan_kabel.permohonan_kabel_id',
  ADD KEY `idx_kabel_permohonan` (`permohonan_id`);
