-- Jalankan SEKALI di server MySQL 8.4 setelah data di-restore dari MySQL 5.7.
--
-- Semua geometri (tiang, kabel, kelurahan, kecamatan, master_retribusi, dst.)
-- tersimpan dengan SRID 1. MySQL 5.7 mengabaikan SRID (semua dihitung Cartesian),
-- sedangkan MySQL 8.x menolak SRID yang tidak terdaftar:
--   ERROR 3548 (SR001): There's no spatial reference system with SRID 1.
--
-- Script ini mendaftarkan SRID 1 sebagai SRS Cartesian (proyeksi), sehingga
-- koordinat tetap dibaca X = longitude, Y = latitude dan semua perhitungan
-- (ST_Contains, ST_Intersects, MBRContains, ...) sama persis dengan MySQL 5.7.
-- Butuh privilege CREATE_SPATIAL_REFERENCE_SYSTEM atau SUPER (mis. user root).

CREATE SPATIAL REFERENCE SYSTEM IF NOT EXISTS 1
NAME 'Legacy SRID 1 (Cartesian, MySQL 5.7)'
DEFINITION 'PROJCS["Legacy SRID 1 (Cartesian, MySQL 5.7)",GEOGCS["WGS 84",DATUM["World Geodetic System 1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.017453292519943278,AUTHORITY["EPSG","9122"]],AXIS["Lat",NORTH],AXIS["Lon",EAST],AUTHORITY["EPSG","4326"]],PROJECTION["Popular Visualisation Pseudo Mercator",AUTHORITY["EPSG","1024"]],PARAMETER["Latitude of natural origin",0,AUTHORITY["EPSG","8801"]],PARAMETER["Longitude of natural origin",0,AUTHORITY["EPSG","8802"]],PARAMETER["False easting",0,AUTHORITY["EPSG","8806"]],PARAMETER["False northing",0,AUTHORITY["EPSG","8807"]],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["X",EAST],AXIS["Y",NORTH]]';

-- Cek: harus mengembalikan satu baris dengan SRS_ID = 1
SELECT SRS_ID, SRS_NAME FROM INFORMATION_SCHEMA.ST_SPATIAL_REFERENCE_SYSTEMS WHERE SRS_ID = 1;

-- Cek: harus mengembalikan WKT "POINT(109.xxx -6.xxx)" (bukan error)
SELECT ST_AsText(SHAPE) FROM tiang LIMIT 1;
