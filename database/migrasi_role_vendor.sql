-- ============================================================
-- Migrasi: role Vendor (is_admin = 3)
--   is_admin 1 = Administrator
--   is_admin 2 = Perusahaan
--   is_admin 3 = Vendor  -> jenis_vendor 'internal' (milik perusahaan) / 'outsource' (luar)
--
-- Tabel `vendor` yang sudah ada dipakai sebagai tabel KEMITRAAN
-- (perusahaan_id <-> id_user vendor). Baris lama dengan id_user = 0
-- ("Vendor Perusahaan") tetap dipertahankan karena dirujuk oleh
-- perusahaan_provider.vendor_id.
-- ============================================================

-- 1) Kolom tambahan di tabel user
--    Nama kolom sengaja bukan `perusahaan_id` karena query login melakukan
--    `SELECT *, u.* FROM user u LEFT JOIN perusahaan p ...` sehingga kolom
--    user akan menimpa p.perusahaan_id milik akun perusahaan.
ALTER TABLE `user`
  ADD COLUMN `jenis_vendor` ENUM('internal','outsource') NULL DEFAULT NULL
      COMMENT 'Hanya untuk is_admin=3. internal = vendor milik perusahaan, outsource = vendor luar' AFTER `is_admin`,
  ADD COLUMN `perusahaan_asal_id` BIGINT(20) UNSIGNED NULL DEFAULT NULL
      COMMENT 'Diisi jika jenis_vendor = internal (perusahaan.perusahaan_id)' AFTER `jenis_vendor`,
  ADD COLUMN `created_by` INT(11) NULL DEFAULT NULL
      COMMENT 'id_user pembuat akun (perusahaan / admin)' AFTER `perusahaan_asal_id`,
  ADD KEY `idx_user_is_admin` (`is_admin`),
  ADD KEY `idx_user_perusahaan_asal` (`perusahaan_asal_id`),
  ADD KEY `idx_user_created_by` (`created_by`);

-- 2) Tabel kemitraan perusahaan <-> vendor
--    Untuk instalasi baru (tabel belum ada):
CREATE TABLE IF NOT EXISTS `vendor` (
  `vendor_id` int(11) NOT NULL AUTO_INCREMENT,
  `perusahaan_id` int(11) DEFAULT NULL COMMENT 'perusahaan.perusahaan_id',
  `id_user` int(11) DEFAULT '0' COMMENT 'user.id_user vendor (is_admin=3); 0 = Vendor Perusahaan (diri sendiri)',
  `insertedAt` datetime DEFAULT NULL,
  `lastUpdateAt` datetime DEFAULT NULL,
  `deletedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`vendor_id`),
  KEY `idx_vendor_perusahaan_user` (`perusahaan_id`, `id_user`),
  KEY `idx_vendor_user` (`id_user`),
  KEY `idx_vendor_deletedAt` (`deletedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--    Untuk database yang tabel `vendor`-nya sudah ada (kondisi sekarang):
ALTER TABLE `vendor`
  ADD KEY `idx_vendor_perusahaan_user` (`perusahaan_id`, `id_user`),
  ADD KEY `idx_vendor_user` (`id_user`),
  ADD KEY `idx_vendor_deletedAt` (`deletedAt`);
