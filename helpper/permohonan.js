// Query & aturan bersama permohonan izin jaringan utilitas,
// dipakai oleh halaman vendor (isine/perizinan.js) dan backoffice (isine/manajemen_perizinan.js).
var path = require('path');
var fs = require('fs');
var multer = require('multer');
var sql_enak = require('../database/mysql_enak.js').connection;

// Disimpan di luar folder public agar KTP/akta tidak bisa diakses tanpa login
var DIR_DOKUMEN = path.join(__dirname, '..', 'uploads', 'permohonan');
fs.mkdirSync(DIR_DOKUMEN, { recursive: true });

var JENIS_DOKUMEN = {
  ktp: 'Foto copy Kartu Tanda Penduduk (KTP) Pemohon',
  akta_pendirian: 'Foto Copy akte pendirian Badan Usaha/Badan Hukum',
  surat_kuasa: 'Surat Kuasa Pengurusan permohonan izin',
  pernyataan_kesanggupan: 'Surat Pernyataan kesanggupan memenuhi dan mematuhi persyaratan',
  pernyataan_retribusi: 'Surat pernyataan kesanggupan pembayaran Retribusi',
  gambar_lokasi: 'Gambar Lokasi Pembangunan/Penempatan Bangunan dan Jaringan Utilitas',
  rencana_teknis: 'Rencana Teknis',
  jadwal_pelaksanaan: 'Jadwal Pelaksanaan Kegiatan',
  rencana_anggaran: 'Rencana Anggaran Biaya'
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

// Baris master_retribusi untuk jaringan di luar ruas SK jalan (tarif tetap ada, geometri hanya titik dummy)
var NAMA_RUAS_LAIN = 'Jalan Lain';

async function getIdRuasLain() {
  var [rows] = await sql_enak.raw(`SELECT id FROM master_retribusi WHERE nm_ruas = ? ORDER BY id LIMIT 1`, [NAMA_RUAS_LAIN]);
  return rows.length ? rows[0].id : null;
}

// Pengisi permohonan (vendor sendiri / admin atas nama vendor) hanya boleh mengubah
// permohonan yang belum diajukan atau dikembalikan untuk revisi
function bisaUbah(permohonan) {
  return !!permohonan && (permohonan.status === 'draft' || permohonan.status === 'revisi');
}

// Rekap ruas per permohonan (dipakai list vendor & list backoffice)
var SQL_REKAP = `
  SELECT p.permohonan_id, p.id_user, p.provider_id, p.status, p.keterangan, p.no_sk, p.tanggal_sk,
         p.nama_pemohon, p.insertedAt, p.diajukanAt, p.diprosesAt, p.dibuat_oleh,
         pr.provider, u.fullname AS nama_vendor, u.username AS username_vendor,
         (p.dibuat_oleh IS NOT NULL AND p.dibuat_oleh <> p.id_user) AS diisi_admin,
         IFNULL(t.jml_ruas, 0) AS jml_ruas,
         IFNULL(t.jml_tiang, 0) AS jml_tiang,
         IFNULL(t.jml_kabel, 0) AS jml_kabel,
         IFNULL(t.retribusi, 0) AS retribusi
    FROM permohonan p
    LEFT JOIN provider pr ON pr.provider_id = p.provider_id
    LEFT JOIN user u ON u.id_user = p.id_user
    LEFT JOIN (
      SELECT permohonan_id,
             COUNT(*) AS jml_ruas,
             SUM(jumlah_tiang) AS jml_tiang,
             SUM(panjang_kabel) AS jml_kabel,
             SUM(jumlah_tiang * tarif_tiang + panjang_kabel * tarif_kabel) AS retribusi
        FROM permohonan_ruas
       WHERE deletedAt IS NULL
       GROUP BY permohonan_id
    ) t ON t.permohonan_id = p.permohonan_id
   WHERE p.deletedAt IS NULL`;

async function getPermohonan(permohonan_id, id_user) {
  var sql = `SELECT * FROM permohonan WHERE permohonan_id = ? AND deletedAt IS NULL`;
  var val = [permohonan_id];
  if (id_user) { sql += ` AND id_user = ?`; val.push(id_user); }
  var [rows] = await sql_enak.raw(sql + ` LIMIT 1`, val);
  return rows[0] || null;
}

async function getRuas(permohonan_id) {
  var [rows] = await sql_enak.raw(
    `SELECT r.permohonan_ruas_id, r.ruas_id, r.jumlah_tiang, r.panjang_kabel, r.tarif_tiang, r.tarif_kabel,
            r.jumlah_tiang * r.tarif_tiang AS retribusi_tiang,
            r.panjang_kabel * r.tarif_kabel AS retribusi_kabel,
            r.jumlah_tiang * r.tarif_tiang + r.panjang_kabel * r.tarif_kabel AS retribusi_total,
            mr.no, mr.nm_ruas, mr.tk_ruas_aw, mr.tk_ruas_ak, mr.panjang,
            (r.ruas_id IS NULL OR mr.nm_ruas = '${NAMA_RUAS_LAIN}') AS luar_ruas,
            (SELECT COUNT(*) FROM permohonan_tiang pt WHERE pt.permohonan_ruas_id = r.permohonan_ruas_id AND pt.deletedAt IS NULL) AS digitasi_tiang,
            (SELECT COUNT(*) FROM permohonan_kabel pk WHERE pk.permohonan_ruas_id = r.permohonan_ruas_id AND pk.deletedAt IS NULL) AS digitasi_kabel
       FROM permohonan_ruas r
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE r.permohonan_id = ? AND r.deletedAt IS NULL
      ORDER BY r.permohonan_ruas_id ASC`,
    [permohonan_id]
  );
  return rows;
}

async function getDokumen(permohonan_id) {
  var [rows] = await sql_enak.raw(
    `SELECT permohonan_dokumen_id, jenis_dokumen, nama_asli, lastUpdateAt
       FROM permohonan_dokumen WHERE permohonan_id = ?`,
    [permohonan_id]
  );
  return rows.map(function (d) {
    d.label = JENIS_DOKUMEN[d.jenis_dokumen] || d.jenis_dokumen;
    return d;
  });
}

// Detail lengkap satu permohonan: header + provider + dokumen + ruas
async function getDetail(permohonan) {
  var [prov] = await sql_enak.raw(`SELECT provider FROM provider WHERE provider_id = ?`, [permohonan.provider_id || 0]);
  var [vendor] = await sql_enak.raw(`SELECT fullname, username, email, telp FROM user WHERE id_user = ?`, [permohonan.id_user]);
  return {
    permohonan: Object.assign({}, permohonan, {
      provider: prov[0] ? prov[0].provider : null,
      vendor: vendor[0] || null,
      bisa_ubah: bisaUbah(permohonan)
    }),
    dokumen: await getDokumen(permohonan.permohonan_id),
    ruas: await getRuas(permohonan.permohonan_id)
  };
}

// Hasil digitasi tiang & kabel satu permohonan (opsional: satu ruas saja) sebagai GeoJSON
async function getDigitasi(permohonan_id, permohonan_ruas_id) {
  var filter = permohonan_ruas_id ? ` AND x.permohonan_ruas_id = ?` : ``;
  var val = permohonan_ruas_id ? [permohonan_id, permohonan_ruas_id] : [permohonan_id];
  var [tiang] = await sql_enak.raw(
    `SELECT x.permohonan_tiang_id AS id, x.permohonan_ruas_id, x.jumlah, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_tiang x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_tiang_id`,
    val
  );
  var [kabel] = await sql_enak.raw(
    `SELECT x.permohonan_kabel_id AS id, x.permohonan_ruas_id, x.jumlah, x.panjang, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_kabel x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_kabel_id`,
    val
  );
  [tiang, kabel].forEach(function (list) {
    list.forEach(function (f) { f.geojson = JSON.parse(f.geojson); });
  });
  return { tiang: tiang, kabel: kabel };
}

// Total ruas mengikuti hasil digitasi setiap kali digitasi disimpan
async function sinkronTotalRuas(permohonan_ruas_id) {
  await sql_enak.raw(
    `UPDATE permohonan_ruas r
        SET r.jumlah_tiang = (SELECT IFNULL(SUM(jumlah), 0) FROM permohonan_tiang
                               WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL),
            r.panjang_kabel = (SELECT IFNULL(SUM(panjang * jumlah), 0) FROM permohonan_kabel
                                WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL),
            r.lastUpdateAt = NOW()
      WHERE r.permohonan_ruas_id = ?`,
    [permohonan_ruas_id]
  );
}

// Salin digitasi permohonan yang disetujui ke data utama `tiang` & `kabel`.
// Salinan lama permohonan ini dihapus dulu agar persetujuan ulang tidak dobel.
// Format kolom mengikuti data survey: kode_ruas = master_retribusi.no,
// t_k30cm / jr_atk15cm berisi penanda kelas tarif, kd_kec/kd_kel dari poligon kelurahan.
async function salinKeDataUtama(permohonan_id) {
  await hapusDariDataUtama(permohonan_id);
  var [tiang] = await sql_enak.raw(
    `INSERT INTO tiang (SHAPE, kode_ruas, kode_gps, jumlah_tia, provider, t_k30cm, ciri_tiang, surveyor,
                        kd_kec, kd_kel, provider_id, insertedAt, lastUpdateAt, permohonan_id, permohonan_tiang_id)
     SELECT pt.SHAPE, mr.no, CONCAT('IZIN-', p.permohonan_id, '-', pt.permohonan_tiang_id), pt.jumlah, pr.provider,
            't_k30cm', pt.keterangan, u.fullname,
            (SELECT kl.kec_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, pt.SHAPE) LIMIT 1),
            (SELECT kl.kel_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, pt.SHAPE) LIMIT 1),
            p.provider_id, NOW(), NOW(), p.permohonan_id, pt.permohonan_tiang_id
       FROM permohonan_tiang pt
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = pt.permohonan_ruas_id AND r.deletedAt IS NULL
       JOIN permohonan p ON p.permohonan_id = pt.permohonan_id
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
       LEFT JOIN provider pr ON pr.provider_id = p.provider_id
       LEFT JOIN user u ON u.id_user = p.id_user
      WHERE pt.permohonan_id = ? AND pt.deletedAt IS NULL`,
    [permohonan_id]
  );
  var [kabel] = await sql_enak.raw(
    `INSERT INTO kabel (SHAPE, kode_ruas, kode_gps_p, kode_gps_u, provider, ciri_kabel, jumlah, jr_atk15cm, surveyor, panjang,
                        kd_kec, kd_kel, provider_id, insertedAt, lastUpdateAt, permohonan_id, permohonan_kabel_id)
     SELECT pk.SHAPE, mr.no,
            CONCAT('IZIN-', p.permohonan_id, '-', pk.permohonan_kabel_id, '-A'),
            CONCAT('IZIN-', p.permohonan_id, '-', pk.permohonan_kabel_id, '-B'),
            pr.provider, pk.keterangan, pk.jumlah, 'jr_atk15cm', u.fullname, pk.panjang,
            (SELECT kl.kec_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_StartPoint(pk.SHAPE)) LIMIT 1),
            (SELECT kl.kel_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_StartPoint(pk.SHAPE)) LIMIT 1),
            IFNULL(p.provider_id, 0), NOW(), NOW(), p.permohonan_id, pk.permohonan_kabel_id
       FROM permohonan_kabel pk
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = pk.permohonan_ruas_id AND r.deletedAt IS NULL
       JOIN permohonan p ON p.permohonan_id = pk.permohonan_id
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
       LEFT JOIN provider pr ON pr.provider_id = p.provider_id
       LEFT JOIN user u ON u.id_user = p.id_user
      WHERE pk.permohonan_id = ? AND pk.deletedAt IS NULL`,
    [permohonan_id]
  );
  return { tiang: tiang.affectedRows, kabel: kabel.affectedRows };
}

// Hanya menghapus baris hasil salinan permohonan ini; data survey (permohonan_id NULL) tidak tersentuh
async function hapusDariDataUtama(permohonan_id) {
  await sql_enak.raw(`DELETE FROM tiang WHERE permohonan_id = ?`, [permohonan_id]);
  await sql_enak.raw(`DELETE FROM kabel WHERE permohonan_id = ?`, [permohonan_id]);
}

// Identitas instansi & penandatangan pada cetakan SK — sesuaikan dengan data resmi
var KONFIG_SK = {
  pemerintah: 'PEMERINTAH KOTA TEGAL',
  instansi: 'DINAS PEKERJAAN UMUM DAN PENATAAN RUANG',
  alamat: 'Jl. ................................ Kota Tegal',
  kontak: 'Telp. (0283) ......... | Email: .........................',
  logo: '/images/template/logo_kota_tegal.png',
  tempat: 'Tegal',
  jabatan_ttd: 'KEPALA DINAS PEKERJAAN UMUM DAN PENATAAN RUANG KOTA TEGAL',
  nama_ttd: '.........................................',
  pangkat_ttd: 'Pembina Utama Muda',
  nip_ttd: '.........................................'
};

var SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh ' + terbilang(n % 10);
  if (n < 200) return 'seratus ' + terbilang(n - 100);
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus ' + terbilang(n % 100);
  if (n < 2000) return 'seribu ' + terbilang(n - 1000);
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu ' + terbilang(n % 1000);
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta ' + terbilang(n % 1e6);
  if (n < 1e12) return terbilang(Math.floor(n / 1e9)) + ' miliar ' + terbilang(n % 1e9);
  return terbilang(Math.floor(n / 1e12)) + ' triliun ' + terbilang(n % 1e12);
}

// Data untuk halaman cetak SK (hanya permohonan yang sudah disetujui)
async function getDataSk(permohonan) {
  var detail = await getDetail(permohonan);
  var total = { tiang: 0, kabel: 0, retribusi_tiang: 0, retribusi_kabel: 0, retribusi: 0 };
  detail.ruas.forEach(function (r) {
    total.tiang += Number(r.jumlah_tiang);
    total.kabel += Number(r.panjang_kabel);
    total.retribusi_tiang += Number(r.retribusi_tiang);
    total.retribusi_kabel += Number(r.retribusi_kabel);
    total.retribusi += Number(r.retribusi_total);
  });
  var kata = terbilang(total.retribusi).replace(/\s+/g, ' ').trim() || 'nol';
  total.terbilang = kata.charAt(0).toUpperCase() + kata.slice(1) + ' rupiah';
  detail.total = total;
  detail.konfig = KONFIG_SK;
  return detail;
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
  NAMA_RUAS_LAIN: NAMA_RUAS_LAIN,
  getIdRuasLain: getIdRuasLain,
  getDataSk: getDataSk,
  bisaUbah: bisaUbah,
  SQL_REKAP: SQL_REKAP,
  getPermohonan: getPermohonan,
  getRuas: getRuas,
  getDokumen: getDokumen,
  getDetail: getDetail,
  getDigitasi: getDigitasi,
  sinkronTotalRuas: sinkronTotalRuas,
  salinKeDataUtama: salinKeDataUtama,
  hapusDariDataUtama: hapusDariDataUtama,
  kirimDokumen: kirimDokumen
};
