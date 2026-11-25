-- Foto dokumentasi peninjauan lapangan tidak lagi dibatasi 6 slot.
-- urutan semula tinyint (maks. 127); diperbesar agar foto bisa terus ditambah.
-- Jalankan sekali di database 2026_jut_tegal (MySQL 8.4).

ALTER TABLE `permohonan_peninjauan_foto`
  MODIFY COLUMN `urutan` smallint unsigned NOT NULL;
