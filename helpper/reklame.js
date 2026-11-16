// Query & aturan bersama permohonan izin reklame, dipakai oleh halaman vendor (isine/perizinan.js).
// Status, hak ubah & ruas "Jalan Lain" mengikuti permohonan jaringan utilitas (helpper/permohonan.js).
var path = require('path');
var fs = require('fs');
var multer = require('multer');
var sql_enak = require('../database/mysql_enak.js').connection;
var permohonan = require('./permohonan.js');

// Disimpan di luar folder public agar KTP/akta tidak bisa diakses tanpa login
var DIR_DOKUMEN = path.join(__dirname, '..', 'uploads', 'reklame');
fs.mkdirSync(DIR_DOKUMEN, { recursive: true });

var JENIS_DOKUMEN = {
  ktp: 'Foto copy Kartu Tanda Penduduk (KTP) Pemohon',
  akta_pendirian: 'Foto Copy akte pendirian Badan Usaha/Badan Hukum',
  surat_kuasa: 'Surat Kuasa Pengurusan permohonan izin pembangunan/penempatan Iklan',
  pernyataan_kesanggupan: 'Surat Pernyataan kesanggupan memenuhi dan mematuhi persyaratan',
  pernyataan_retribusi: 'Surat pernyataan kesanggupan pembayaran Retribusi',
  gambar_lokasi: 'Gambar Lokasi Pembangunan/Penempatan Iklan',
  rencana_teknis: 'Rencana Teknis',
  jadwal_pelaksanaan: 'Jadwal Waktu Pelaksanaan',
  rencana_anggaran: 'Rencana Anggaran Biaya (RAB)'
};
// surat kuasa hanya diperlukan jika surat tidak ditandatangani penanggung jawab
var DOKUMEN_WAJIB = Object.keys(JENIS_DOKUMEN).filter(function (k) { return k !== 'surat_kuasa'; });

var EKSTENSI_DOKUMEN = ['.pdf', '.jpg', '.jpeg', '.png'];

var upload_dokumen = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) { cb(null, DIR_DOKUMEN); },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.fieldname + path.extname(file.originalname).toLowerCase());
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!JENIS_DOKUMEN[file.fieldname]) return cb(new Error('Jenis dokumen tidak dikenal'));
    if (EKSTENSI_DOKUMEN.indexOf(path.extname(file.originalname).toLowerCase()) === -1) {
      return cb(new Error('File harus PDF / JPG / PNG'));
    }
    cb(null, true);
  }
}).fields(Object.keys(JENIS_DOKUMEN).map(function (k) { return { name: k, maxCount: 1 }; }));

// Kolom tarif master_retribusi untuk reklame: "Peralatan / Barang Lainnya" (Rp/tahun)
var KOLOM_TARIF = 'brng_lain';

// Retribusi satu baris reklame_ruas (a = alias tabel)
function sqlRetribusi(a) {
  var p = a ? a + '.' : '';
  return p + 'tarif * ' + p + 'jumlah_titik * ' + p + 'jangka_waktu';
}

var SQL_REKAP = `
  SELECT k.reklame_id, k.id_user, k.status, k.keterangan, k.no_sk, k.tanggal_sk,
         k.nama_pemohon, k.insertedAt, k.diajukanAt, k.diprosesAt, k.dibuat_oleh,
         u.fullname AS nama_vendor, u.username AS username_vendor,
         IFNULL(t.jml_ruas, 0) AS jml_ruas,
         IFNULL(t.jml_titik, 0) AS jml_titik,
         IFNULL(t.retribusi, 0) AS retribusi
    FROM reklame k
    LEFT JOIN user u ON u.id_user = k.id_user
    LEFT JOIN (
      SELECT reklame_id,
             COUNT(*) AS jml_ruas,
             SUM(jumlah_titik) AS jml_titik,
             SUM(${sqlRetribusi()}) AS retribusi
        FROM reklame_ruas
       WHERE deletedAt IS NULL
       GROUP BY reklame_id
    ) t ON t.reklame_id = k.reklame_id
   WHERE k.deletedAt IS NULL`;

// Draft baru atas nama vendor `pemohon`; dibuat_oleh = vendor sendiri atau admin yang mengisi
async function buatDraft(pemohon, dibuat_oleh) {
  var [hasil] = await sql_enak.raw(
    `INSERT INTO reklame (id_user, dibuat_oleh, nama_pemohon, alamat_pemohon, telp_pemohon, email_pemohon, status, insertedAt, lastUpdateAt)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`,
    [pemohon.id_user, dibuat_oleh, pemohon.fullname || null, pemohon.alamat || null, pemohon.telp || null, pemohon.email || null]
  );
  return hasil.insertId;
}

async function getReklame(reklame_id, id_user) {
  var sql = `SELECT * FROM reklame WHERE reklame_id = ? AND deletedAt IS NULL`;
  var val = [reklame_id];
  if (id_user) { sql += ` AND id_user = ?`; val.push(id_user); }
  var [rows] = await sql_enak.raw(sql + ` LIMIT 1`, val);
  return rows[0] || null;
}

async function getRuas(reklame_id) {
  var [rows] = await sql_enak.raw(
    `SELECT r.reklame_ruas_id, r.ruas_id, IFNULL(r.no, mr.no) AS no, IFNULL(r.nm_ruas, mr.nm_ruas) AS nm_ruas,
            r.tarif, r.jumlah_titik, r.jangka_waktu, ${sqlRetribusi('r')} AS retribusi,
            (r.ruas_id IS NULL OR mr.nm_ruas = ?) AS luar_ruas,
            (SELECT COUNT(*) FROM reklame_titik t WHERE t.reklame_ruas_id = r.reklame_ruas_id AND t.deletedAt IS NULL) AS digitasi_titik
       FROM reklame_ruas r
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE r.reklame_id = ? AND r.deletedAt IS NULL
      ORDER BY r.reklame_ruas_id ASC`,
    [permohonan.NAMA_RUAS_LAIN, reklame_id]
  );
  return rows;
}

async function getDokumen(reklame_id) {
  var [rows] = await sql_enak.raw(
    `SELECT reklame_dokumen_id, jenis_dokumen, nama_asli, lastUpdateAt FROM reklame_dokumen WHERE reklame_id = ?`,
    [reklame_id]
  );
  return rows.map(function (d) {
    d.label = JENIS_DOKUMEN[d.jenis_dokumen] || d.jenis_dokumen;
    return d;
  });
}

async function getDetail(reklame) {
  return {
    reklame: Object.assign({}, reklame, { bisa_ubah: permohonan.bisaUbah(reklame) }),
    dokumen: await getDokumen(reklame.reklame_id),
    ruas: await getRuas(reklame.reklame_id)
  };
}

// Titik reklame satu ruas sebagai GeoJSON
async function getTitik(reklame_ruas_id) {
  var [rows] = await sql_enak.raw(
    `SELECT reklame_titik_id AS id, keterangan, ST_AsGeoJSON(SHAPE) AS geojson
       FROM reklame_titik WHERE reklame_ruas_id = ? AND deletedAt IS NULL ORDER BY reklame_titik_id`,
    [reklame_ruas_id]
  );
  // MySQL 8 mengembalikan tipe JSON (sudah berupa objek), MySQL 5.7 berupa teks
  rows.forEach(function (f) { if (typeof f.geojson === 'string') f.geojson = JSON.parse(f.geojson); });
  return rows;
}

// Jumlah titik ruas mengikuti hasil digitasi setiap kali digitasi disimpan
async function sinkronJumlahTitik(reklame_ruas_id) {
  await sql_enak.raw(
    `UPDATE reklame_ruas r
        SET r.jumlah_titik = (SELECT COUNT(*) FROM reklame_titik
                               WHERE reklame_ruas_id = r.reklame_ruas_id AND deletedAt IS NULL),
            r.lastUpdateAt = NOW()
      WHERE r.reklame_ruas_id = ?`,
    [reklame_ruas_id]
  );
}

function kirimDokumen(res, dokumen) {
  if (!dokumen) return res.status(404).send('Dokumen tidak ditemukan');
  var file = path.join(DIR_DOKUMEN, path.basename(dokumen.nama_file));
  if (!fs.existsSync(file)) return res.status(404).send('File tidak ditemukan');
  res.download(file, dokumen.nama_asli || dokumen.nama_file);
}

module.exports = {
  JENIS_DOKUMEN: JENIS_DOKUMEN,
  DOKUMEN_WAJIB: DOKUMEN_WAJIB,
  upload_dokumen: upload_dokumen,
  KOLOM_TARIF: KOLOM_TARIF,
  SQL_REKAP: SQL_REKAP,
  buatDraft: buatDraft,
  getReklame: getReklame,
  getRuas: getRuas,
  getDokumen: getDokumen,
  getDetail: getDetail,
  getTitik: getTitik,
  sinkronJumlahTitik: sinkronJumlahTitik,
  kirimDokumen: kirimDokumen
};
