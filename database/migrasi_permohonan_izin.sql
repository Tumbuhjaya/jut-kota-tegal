-- ============================================================
-- Migrasi: Permohonan Izin Jaringan Utilitas oleh Vendor
-- Target  : MySQL 5.7 (tes di 5.7.35)
--
-- Perubahan alur:
--   * Perusahaan TIDAK lagi berhubungan dengan vendor. Vendor (is_admin = 3)
--     login cukup username + password, tanpa memilih perusahaan.
--   * Vendor membuat permohonan sendiri:
--       permohonan  -> provider + data pemohon + dokumen syarat
--         └ permohonan_ruas   -> ruas jalan (master_retribusi) / luar ruas
--             ├ permohonan_tiang -> digitasi titik tiang
--             └ permohonan_kabel -> digitasi garis kabel
--   * Admin backoffice (is_admin = 1) melihat & memproses permohonan
--     (setujui / tolak / minta revisi + No. SK).
--
-- Status permohonan:
--   draft     = baru dibuat vendor, belum diajukan
--   diajukan  = sudah diajukan, menunggu verifikasi admin
--   revisi    = dikembalikan admin, vendor wajib perbaiki lalu ajukan ulang
--   disetujui = disetujui admin (No. SK terisi)
--   ditolak   = ditolak admin
-- Vendor hanya bisa ubah/hapus saat status draft / revisi.
-- Admin juga bisa mengisi permohonan atas nama vendor (permohonan.dibuat_oleh).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Header permohonan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permohonan` (
  `permohonan_id`   INT(11) NOT NULL AUTO_INCREMENT,
  `id_user`         INT(11) NOT NULL COMMENT 'user.id_user vendor pemohon (is_admin=3)',
  `dibuat_oleh`     INT(11) DEFAULT NULL COMMENT 'user.id_user pengisi; beda dgn id_user = diisi admin atas nama vendor',
  `provider_id`     INT(11) DEFAULT NULL COMMENT 'provider.provider_id',
  `nama_pemohon`    VARCHAR(150) DEFAULT NULL,
  `jabatan_pemohon` VARCHAR(100) DEFAULT NULL,
  `telp_pemohon`    VARCHAR(30)  DEFAULT NULL,
  `email_pemohon`   VARCHAR(100) DEFAULT NULL,
  `status`          ENUM('draft','diajukan','revisi','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  `keterangan`      TEXT COMMENT 'catatan admin saat approve / tolak / revisi',
  `no_sk`           VARCHAR(100) DEFAULT NULL,
  `tanggal_sk`      DATE DEFAULT NULL,
  `diajukanAt`      DATETIME DEFAULT NULL,
  `diprosesAt`      DATETIME DEFAULT NULL,
  `diproses_oleh`   INT(11) DEFAULT NULL COMMENT 'user.id_user admin yang memproses',
  `insertedAt`      DATETIME DEFAULT NULL,
  `lastUpdateAt`    DATETIME DEFAULT NULL,
  `deletedAt`       DATETIME DEFAULT NULL,
  PRIMARY KEY (`permohonan_id`),
  KEY `idx_permohonan_user` (`id_user`),
  KEY `idx_permohonan_provider` (`provider_id`),
  KEY `idx_permohonan_status` (`status`),
  KEY `idx_permohonan_deletedAt` (`deletedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2) Dokumen persyaratan administrasi & teknis (modal "Upload")
--    jenis_dokumen:
--      ktp, akta_pendirian, surat_kuasa, pernyataan_kesanggupan,
--      pernyataan_retribusi, gambar_lokasi, rencana_teknis,
--      jadwal_pelaksanaan, rencana_anggaran
--    Satu file per jenis per permohonan; upload ulang = ganti file.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permohonan_dokumen` (
  `permohonan_dokumen_id` INT(11) NOT NULL AUTO_INCREMENT,
  `permohonan_id`         INT(11) NOT NULL,
  `jenis_dokumen`         VARCHAR(50) NOT NULL,
  `nama_file`             VARCHAR(255) NOT NULL COMMENT 'nama file tersimpan di public/dokumen/permohonan/',
  `nama_asli`             VARCHAR(255) DEFAULT NULL COMMENT 'nama file asli dari pengguna',
  `insertedAt`            DATETIME DEFAULT NULL,
  `lastUpdateAt`          DATETIME DEFAULT NULL,
  PRIMARY KEY (`permohonan_dokumen_id`),
  UNIQUE KEY `uq_permohonan_dokumen_jenis` (`permohonan_id`, `jenis_dokumen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3) Ruas jalan yang dikerjakan
--    "Di luar ruas" = baris master_retribusi dengan nm_ruas 'Jalan Lain'
--    (tarif untuk jaringan di luar SK jalan), jadi ruas_id selalu terisi.
--    tarif_* disalin dari master_retribusi saat disimpan supaya nilai
--    retribusi tidak berubah jika master tarif diubah kemudian.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permohonan_ruas` (
  `permohonan_ruas_id` INT(11) NOT NULL AUTO_INCREMENT,
  `permohonan_id`      INT(11) NOT NULL,
  `ruas_id`            INT(11) DEFAULT NULL COMMENT 'master_retribusi.id; luar ruas = id baris Jalan Lain',
  `jumlah_tiang`       INT(11) NOT NULL DEFAULT '0' COMMENT 'unit',
  `panjang_kabel`      DECIMAL(14,2) NOT NULL DEFAULT '0.00' COMMENT 'meter',
  `tarif_tiang`        DECIMAL(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Rp/unit/tahun (master_retribusi.t_k30cm)',
  `tarif_kabel`        DECIMAL(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Rp/meter/tahun (master_retribusi.jr_atk15cm)',
  `insertedAt`         DATETIME DEFAULT NULL,
  `lastUpdateAt`       DATETIME DEFAULT NULL,
  `deletedAt`          DATETIME DEFAULT NULL,
  PRIMARY KEY (`permohonan_ruas_id`),
  KEY `idx_pr_permohonan` (`permohonan_id`, `deletedAt`),
  KEY `idx_pr_ruas` (`ruas_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4) Digitasi tiang (POINT)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permohonan_tiang` (
  `permohonan_tiang_id` INT(11) NOT NULL AUTO_INCREMENT,
  `permohonan_id`       INT(11) NOT NULL,
  `permohonan_ruas_id`  INT(11) NOT NULL,
  `SHAPE`               GEOMETRY NOT NULL,
  `jumlah`              INT(11) NOT NULL DEFAULT '1',
  `keterangan`          VARCHAR(255) DEFAULT NULL,
  `insertedAt`          DATETIME DEFAULT NULL,
  `lastUpdateAt`        DATETIME DEFAULT NULL,
  `deletedAt`           DATETIME DEFAULT NULL,
  PRIMARY KEY (`permohonan_tiang_id`),
  KEY `idx_pt_ruas` (`permohonan_ruas_id`, `deletedAt`),
  KEY `idx_pt_permohonan` (`permohonan_id`),
  SPATIAL KEY `sp_pt_shape` (`SHAPE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5) Digitasi kabel (LINESTRING)
--    panjang = panjang garis dalam meter (dihitung geodesic di peta)
--    jumlah  = jumlah kabel sejajar pada garis tsb.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permohonan_kabel` (
  `permohonan_kabel_id` INT(11) NOT NULL AUTO_INCREMENT,
  `permohonan_id`       INT(11) NOT NULL,
  `permohonan_ruas_id`  INT(11) NOT NULL,
  `SHAPE`               GEOMETRY NOT NULL,
  `panjang`             DECIMAL(14,2) NOT NULL DEFAULT '0.00' COMMENT 'meter',
  `jumlah`              INT(11) NOT NULL DEFAULT '1',
  `keterangan`          VARCHAR(255) DEFAULT NULL,
  `insertedAt`          DATETIME DEFAULT NULL,
  `lastUpdateAt`        DATETIME DEFAULT NULL,
  `deletedAt`           DATETIME DEFAULT NULL,
  PRIMARY KEY (`permohonan_kabel_id`),
  KEY `idx_pk_ruas` (`permohonan_ruas_id`, `deletedAt`),
  KEY `idx_pk_permohonan` (`permohonan_id`),
  SPATIAL KEY `sp_pk_shape` (`SHAPE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6) Penghubung data utama tiang / kabel ke permohonan
--    Saat admin menyetujui permohonan, digitasi permohonan_tiang /
--    permohonan_kabel disalin ke tabel `tiang` / `kabel` dengan kolom ini
--    terisi. Jika status disetujui dicabut (revisi / tolak), baris dengan
--    permohonan_id tsb dihapus lagi dari tabel utama.
--    Data survey lama tetap NULL di kedua kolom.
-- ------------------------------------------------------------
ALTER TABLE `tiang`
  ADD COLUMN `permohonan_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan.permohonan_id jika berasal dari izin vendor',
  ADD COLUMN `permohonan_tiang_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan_tiang.permohonan_tiang_id',
  ADD KEY `idx_tiang_permohonan` (`permohonan_id`);

ALTER TABLE `kabel`
  ADD COLUMN `permohonan_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan.permohonan_id jika berasal dari izin vendor',
  ADD COLUMN `permohonan_kabel_id` INT(11) NULL DEFAULT NULL COMMENT 'permohonan_kabel.permohonan_kabel_id',
  ADD KEY `idx_kabel_permohonan` (`permohonan_id`);

-- ------------------------------------------------------------
-- 7) Lepas hubungan perusahaan <-> vendor
--    Kode sudah TIDAK membaca tabel `vendor`, `perusahaan_provider.vendor_id`,
--    `user.jenis_vendor` maupun `user.perusahaan_asal_id` untuk vendor.
--    Kolom/tabel lama sengaja tidak di-drop agar data historis aman.
--    Jika sudah yakin, jalankan blok di bawah (buat backup dulu):
-- ------------------------------------------------------------
-- RENAME TABLE `vendor` TO `vendor_hapus_31102026`;
-- ALTER TABLE `perusahaan_provider` DROP KEY `idx_pp_vendor`, DROP COLUMN `vendor_id`;
-- ALTER TABLE `user`
--   DROP KEY `idx_user_perusahaan_asal`,
--   DROP COLUMN `jenis_vendor`,
--   DROP COLUMN `perusahaan_asal_id`;
