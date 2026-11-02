-- ============================================================
-- Migrasi: pendaftaran mandiri akun Vendor (/perizinan/daftar_akun)
-- Target: MySQL 5.7. Jalankan sekali saja, SEBELUM fitur daftar dipakai.
--
-- Akun hasil daftar: is_admin = 3, jenis_vendor = 'outsource', created_by = NULL
-- ============================================================

ALTER TABLE `user`
  ADD COLUMN `alamat` VARCHAR(255) NULL DEFAULT NULL
      COMMENT 'Alamat vendor (diisi saat daftar akun vendor)' AFTER `telp`;
