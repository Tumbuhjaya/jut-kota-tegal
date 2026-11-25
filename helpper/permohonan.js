// Query & aturan bersama permohonan izin jaringan utilitas & reklame,
// dipakai oleh halaman vendor (isine/perizinan.js) dan backoffice (isine/manajemen_perizinan.js).
var path = require('path');
var fs = require('fs');
var multer = require('multer');
var ExcelJS = require('exceljs');
var sql_enak = require('../database/mysql_enak.js').connection;

// Disimpan di luar folder public agar KTP/akta tidak bisa diakses tanpa login
var DIR_DOKUMEN = path.join(__dirname, '..', 'uploads', 'permohonan');
fs.mkdirSync(DIR_DOKUMEN, { recursive: true });

// Jenis izin (permohonan.jenis_izin). Alur & tabel sama; reklame tanpa provider & retribusi, digitasinya hanya titik;
// pembukaan jalan tanpa provider, digitasi titik akses berkategori + luas (retribusi per M2). komponen diisi di bawah.
// objek_cetak = objek izin pada dokumen cetak ("Pembangunan/Penempatan <objek_cetak>"), label_titik = nama titik di tabel.
var JENIS_IZIN = {
  jaringan_utilitas: {
    kode: 'jaringan_utilitas', label: 'Jaringan Utilitas', objek: 'jaringan utilitas', objek_cetak: 'Bangunan dan Jaringan Utilitas',
    label_titik: 'Titik',
    url_pemohon: '/perizinan/jaringan_utilitas', url_backoffice: '/manajemen_perizinan',
    digitasi: ['tiang', 'kabel'], pakai_provider: true, pakai_retribusi: true,
    verifikasi_awal: true   // provider + dokumen diverifikasi admin sebelum isi ruas
  },
  reklame: {
    kode: 'reklame', label: 'Reklame', objek: 'reklame', objek_cetak: 'Reklame',
    label_titik: 'Titik Reklame',
    url_pemohon: '/perizinan/reklame', url_backoffice: '/manajemen_reklame',
    digitasi: ['titik'], pakai_provider: false, pakai_retribusi: false,
    verifikasi_awal: false  // tanpa provider, pemohon langsung isi & ajukan; dokumen diperiksa saat verifikasi permohonan
  },
  pembukaan_jalan: {
    kode: 'pembukaan_jalan', label: 'Pembukaan Jalan', objek: 'pembukaan jalan / akses', objek_cetak: 'Pembukaan Jalan / Akses',
    label_titik: 'Titik Akses',
    url_pemohon: '/perizinan/pembukaan_jalan', url_backoffice: '/manajemen_pembukaan_jalan',
    digitasi: ['akses'], pakai_provider: false, pakai_retribusi: true,
    verifikasi_awal: false
  }
};
function jenisIzin(permohonan_atau_kode) {
  var kode = permohonan_atau_kode && typeof permohonan_atau_kode === 'object' ? permohonan_atau_kode.jenis_izin : permohonan_atau_kode;
  return JENIS_IZIN[kode] || JENIS_IZIN.jaringan_utilitas;
}

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
// Reklame memakai jenis dokumen yang sama dengan label sesuai objek iklan, tanpa pernyataan retribusi
var JENIS_DOKUMEN_REKLAME = Object.assign({}, JENIS_DOKUMEN, {
  surat_kuasa: 'Surat Kuasa Pengurusan permohonan izin pembangunan/penempatan Iklan',
  gambar_lokasi: 'Gambar Lokasi Pembangunan/Penempatan Iklan',
  jadwal_pelaksanaan: 'Jadwal Waktu Pelaksanaan',
  rencana_anggaran: 'Rencana Anggaran Biaya (RAB)'
});
delete JENIS_DOKUMEN_REKLAME.pernyataan_retribusi;
var JENIS_DOKUMEN_AKSES = Object.assign({}, JENIS_DOKUMEN, {
  gambar_lokasi: 'Gambar Lokasi Pembukaan Jalan / Akses'
});
function jenisDokumen(jenis) {
  var kode = jenisIzin(jenis).kode;
  if (kode === 'reklame') return JENIS_DOKUMEN_REKLAME;
  if (kode === 'pembukaan_jalan') return JENIS_DOKUMEN_AKSES;
  return JENIS_DOKUMEN;
}
// surat kuasa hanya diperlukan jika surat tidak ditandatangani penanggung jawab
var DOKUMEN_WAJIB = Object.keys(JENIS_DOKUMEN).filter(function (k) { return k !== 'surat_kuasa'; });
function dokumenWajib(jenis) {
  return Object.keys(jenisDokumen(jenis)).filter(function (k) { return k !== 'surat_kuasa'; });
}

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

// Nomor ruas SK status jalan = kode provinsi (Jawa Tengah) | kode kab/kota (Kota Tegal) | master_retribusi.no
var KODE_WILAYAH = { prov: '33', kab: '76' };

// Baris master_retribusi untuk jaringan di luar ruas SK jalan (tarif tetap ada, geometri hanya titik dummy)
var NAMA_RUAS_LAIN = 'Jalan Lain';

// Komponen retribusi per baris ruas. kode = kolom tarif master_retribusi; jumlah & tarif = kolom permohonan_ruas.
// Kabel atas tanah D <= 15 cm memakai panjang_kabel karena jumlahnya diisi dari digitasi kabel;
// jumlah_tiang tetap hasil digitasi tiang dan tidak masuk hitungan retribusi.
var KOMPONEN_RETRIBUSI = [
  { kode: 't_k30cm',    jumlah: 'jml_t_k30cm',    tarif: 'tarif_tiang', satuan: 'Unit',  label: 'Tiang D ≤ 30 cm' },
  { kode: 't_l30cm',    jumlah: 'jml_t_l30cm',    tarif: 't_l30cm',     satuan: 'Unit',  label: 'Tiang D > 30 cm' },
  { kode: 'jr_btk15cm', jumlah: 'jml_jr_btk15cm', tarif: 'jr_btk15cm',  satuan: 'Meter', label: 'Jaringan Utilitas Bawah Tanah D ≤ 15 cm' },
  { kode: 'jr_btl15cm', jumlah: 'jml_jr_btl15cm', tarif: 'jr_btl15cm',  satuan: 'Meter', label: 'Jaringan Utilitas Bawah Tanah D > 15 cm' },
  { kode: 'jr_atk15cm', jumlah: 'panjang_kabel',  tarif: 'tarif_kabel', satuan: 'Meter', label: 'Jaringan Utilitas Atas Tanah D ≤ 15 cm' },
  { kode: 'jr_atl15cm', jumlah: 'jml_jr_atl15cm', tarif: 'jr_atl15cm',  satuan: 'Meter', label: 'Jaringan Utilitas Atas Tanah D > 15 cm' }
];
// Pembukaan jalan / akses: luas (M2) per kategori, tarif Rp/M2/tahun dari master_retribusi (kolom bernama sama)
var KOMPONEN_AKSES = [
  { kode: 'jl_pribadi', jumlah: 'jml_jl_pribadi', tarif: 'jl_pribadi', satuan: 'M2', label: 'Akses Jalan Kepentingan Pribadi' },
  { kode: 'usaha_kcl',  jumlah: 'jml_usaha_kcl',  tarif: 'usaha_kcl',  satuan: 'M2', label: 'Akses Jalan Usaha Kecil' },
  { kode: 'usaha_mngh', jumlah: 'jml_usaha_mngh', tarif: 'usaha_mngh', satuan: 'M2', label: 'Akses Jalan Usaha Menengah' },
  { kode: 'usaha_bsr',  jumlah: 'jml_usaha_bsr',  tarif: 'usaha_bsr',  satuan: 'M2', label: 'Akses Jalan Usaha Besar' }
];
// Semua komponen dipakai di query bersama (kolom jenis lain bernilai 0, jadi tidak menambah retribusi)
var KOMPONEN_SEMUA = KOMPONEN_RETRIBUSI.concat(KOMPONEN_AKSES);
JENIS_IZIN.jaringan_utilitas.komponen = KOMPONEN_RETRIBUSI;
JENIS_IZIN.reklame.komponen = [];
JENIS_IZIN.pembukaan_jalan.komponen = KOMPONEN_AKSES;

// Kategori digitasi = komponen retribusi (kode sama dengan kolom kategori di tabel tiang / kabel).
// Tiang: komponen satuan Unit, kabel: komponen satuan Meter, titik akses: komponen M2.
// bawaan = kategori digitasi lama / baru; nilai = ekspresi jumlah komponen per fitur.
var KATEGORI_DIGITASI = {
  tiang: { tabel: 'permohonan_tiang', bawaan: 't_k30cm', nilai: 'jumlah', daftar: KOMPONEN_RETRIBUSI.filter(function (k) { return k.satuan === 'Unit'; }) },
  kabel: { tabel: 'permohonan_kabel', bawaan: 'jr_atk15cm', nilai: 'ROUND(panjang) * jumlah', daftar: KOMPONEN_RETRIBUSI.filter(function (k) { return k.satuan === 'Meter'; }) },
  akses: { tabel: 'permohonan_akses', bawaan: 'jl_pribadi', nilai: 'luas * jumlah', daftar: KOMPONEN_AKSES }
};
// Untuk view: [{ kode, label }] + bawaan; jenis tanpa kategori (titik) -> daftar kosong
function kategoriDigitasi(jenis) {
  var k = KATEGORI_DIGITASI[jenis];
  if (!k) return { bawaan: null, daftar: [] };
  return { bawaan: k.bawaan, daftar: k.daftar.map(function (x) { return { kode: x.kode, label: x.label }; }) };
}
function kategoriValid(jenis, kategori) {
  var k = KATEGORI_DIGITASI[jenis];
  if (!k) return null;
  return k.daftar.some(function (x) { return x.kode === kategori; }) ? kategori : k.bawaan;
}
// Total panjang kabel semua kategori satu baris permohonan_ruas (a = alias tabel)
function sqlTotalKabel(a) {
  var p = a ? a + '.' : '';
  return KATEGORI_DIGITASI.kabel.daftar.map(function (k) { return 'IFNULL(' + p + k.jumlah + ', 0)'; }).join(' + ');
}

// Ekspresi SQL retribusi satu komponen / seluruh komponen baris permohonan_ruas (a = alias tabel)
function sqlRetribusiKomponen(k, a) {
  var p = a ? a + '.' : '';
  return p + k.jumlah + ' * IFNULL(' + p + k.tarif + ', 0)';
}
function sqlRetribusi(a) {
  return KOMPONEN_SEMUA.map(function (k) { return sqlRetribusiKomponen(k, a); }).join(' + ');
}

async function getIdRuasLain() {
  var [rows] = await sql_enak.raw(`SELECT id FROM master_retribusi WHERE nm_ruas = ? ORDER BY id LIMIT 1`, [NAMA_RUAS_LAIN]);
  return rows.length ? rows[0].id : null;
}

// Pengisi permohonan (vendor sendiri / admin atas nama vendor) hanya boleh mengubah
// permohonan yang belum diajukan atau dikembalikan untuk revisi
// Admin boleh mengubah permohonan di status apa pun kecuali yang sudah disetujui / ditolak (ditolak = final)
// (SK terbit & digitasi sudah disalin ke data utama; kembalikan ke revisi dulu lewat proses)
function bisaUbah(permohonan, admin) {
  if (!permohonan) return false;
  if (admin) return ['disetujui', 'ditolak'].indexOf(permohonan.status) === -1;
  return permohonan.status === 'draft' || permohonan.status === 'revisi';
}

// Tahap awal (jaringan utilitas): provider (diketik pemohon) + dokumen persyaratan diverifikasi admin bersamaan.
// Ruas jalan, simpan & ajukan baru terbuka setelah terverifikasi (status_provider mencakup provider & persyaratan).
// Jenis tanpa verifikasi awal (reklame) selalu dianggap lolos.
function providerTerverifikasi(permohonan) {
  if (!permohonan) return false;
  if (!jenisIzin(permohonan).verifikasi_awal) return true;
  return permohonan.status_provider === 'terverifikasi' && !!permohonan.provider_id;
}

// Pemohon hanya boleh mengubah provider & dokumen persyaratan sebelum dikirim verifikasi / setelah ditolak;
// tanpa verifikasi awal, dokumen bisa diubah selama permohonan masih draft / revisi
function bisaIsiAwal(permohonan) {
  if (!jenisIzin(permohonan).verifikasi_awal) return bisaUbah(permohonan);
  return bisaUbah(permohonan) && ['menunggu', 'terverifikasi'].indexOf(permohonan.status_provider) === -1;
}

// Rekap ruas per permohonan (dipakai list vendor & list backoffice)
var SQL_REKAP = `
  SELECT p.permohonan_id, p.jenis_izin, p.id_user, p.provider_id, p.status, p.tahap, p.keterangan, p.no_sk, p.tanggal_sk,
         p.nama_pemohon, p.insertedAt, p.diajukanAt, p.diprosesAt, p.dibuat_oleh,
         pr.provider, u.fullname AS nama_vendor, u.username AS username_vendor,
         (p.dibuat_oleh IS NOT NULL AND p.dibuat_oleh <> p.id_user) AS diisi_admin,
         IFNULL(t.jml_ruas, 0) AS jml_ruas,
         IFNULL(t.jml_tiang, 0) AS jml_tiang,
         IFNULL(t.jml_kabel, 0) AS jml_kabel,
         IFNULL(t.jml_titik, 0) AS jml_titik,
         IFNULL(t.retribusi, 0) AS retribusi
    FROM permohonan p
    LEFT JOIN provider pr ON pr.provider_id = p.provider_id
    LEFT JOIN user u ON u.id_user = p.id_user
    LEFT JOIN (
      SELECT permohonan_id,
             COUNT(*) AS jml_ruas,
             SUM(jumlah_tiang) AS jml_tiang,
             SUM(${sqlTotalKabel()}) AS jml_kabel,
             SUM(jumlah_titik) AS jml_titik,
             SUM(${sqlRetribusi()}) AS retribusi
        FROM permohonan_ruas
       WHERE deletedAt IS NULL
       GROUP BY permohonan_id
    ) t ON t.permohonan_id = p.permohonan_id
   WHERE p.deletedAt IS NULL`;

// Draft baru atas nama vendor `pemohon`; dibuat_oleh = vendor sendiri atau admin yang mengisi
async function buatDraft(pemohon, dibuat_oleh, jenis) {
  var [hasil] = await sql_enak.raw(
    `INSERT INTO permohonan (jenis_izin, id_user, dibuat_oleh, nama_pemohon, telp_pemohon, email_pemohon, status, insertedAt, lastUpdateAt)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`,
    [jenisIzin(jenis).kode, pemohon.id_user, dibuat_oleh, pemohon.fullname || null, pemohon.telp || null, pemohon.email || null]
  );
  return hasil.insertId;
}

// jenis (opsional): hanya permohonan dengan jenis_izin tersebut, agar menu utilitas & reklame tidak saling membuka data
async function getPermohonan(permohonan_id, id_user, jenis) {
  var sql = `SELECT * FROM permohonan WHERE permohonan_id = ? AND deletedAt IS NULL`;
  var val = [permohonan_id];
  if (id_user) { sql += ` AND id_user = ?`; val.push(id_user); }
  if (jenis) { sql += ` AND jenis_izin = ?`; val.push(jenisIzin(jenis).kode); }
  var [rows] = await sql_enak.raw(sql + ` LIMIT 1`, val);
  return rows[0] || null;
}

async function getRuas(permohonan_id) {
  var [rows] = await sql_enak.raw(
    `SELECT r.permohonan_ruas_id, r.ruas_id, r.jumlah_tiang, r.panjang_kabel, r.jumlah_titik, r.tarif_tiang, r.tarif_kabel,
            ${sqlTotalKabel('r')} AS total_kabel,
            ${KOMPONEN_SEMUA.map(function (k) { return 'r.' + k.jumlah + ', ' + sqlRetribusiKomponen(k, 'r') + ' AS retribusi_' + k.kode; }).join(', ')},
            r.jml_t_k30cm * r.tarif_tiang AS retribusi_tiang,
            r.panjang_kabel * r.tarif_kabel AS retribusi_kabel,
            ${sqlRetribusi('r')} AS retribusi_total,
            ${KOLOM_SALINAN_RUAS.map(function (k) { return 'IFNULL(r.' + k + ', mr.' + k + ') AS ' + k; }).join(', ')},
            kc.kecamatan, kl.desa AS kelurahan,
            (r.ruas_id IS NULL OR mr.nm_ruas = '${NAMA_RUAS_LAIN}') AS luar_ruas,
            (SELECT COUNT(*) FROM permohonan_tiang pt WHERE pt.permohonan_ruas_id = r.permohonan_ruas_id AND pt.deletedAt IS NULL) AS digitasi_tiang,
            (SELECT COUNT(*) FROM permohonan_kabel pk WHERE pk.permohonan_ruas_id = r.permohonan_ruas_id AND pk.deletedAt IS NULL) AS digitasi_kabel,
            (SELECT COUNT(*) FROM permohonan_titik px WHERE px.permohonan_ruas_id = r.permohonan_ruas_id AND px.deletedAt IS NULL) AS digitasi_titik,
            (SELECT COUNT(*) FROM permohonan_akses pa WHERE pa.permohonan_ruas_id = r.permohonan_ruas_id AND pa.deletedAt IS NULL) AS digitasi_akses
       FROM permohonan_ruas r
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
       LEFT JOIN kecamatan kc ON kc.kec_id = IFNULL(r.id_kec, mr.id_kec)
       LEFT JOIN kelurahan kl ON kl.kel_id = IFNULL(r.id_kel, mr.id_kel)
      WHERE r.permohonan_id = ? AND r.deletedAt IS NULL
      ORDER BY r.permohonan_ruas_id ASC`,
    [permohonan_id]
  );
  // Label tampilan: luar ruas memakai nama jalan isian pengisi bila ada
  rows.forEach(function (r) {
    var nama = r.nm_ruas && r.nm_ruas !== NAMA_RUAS_LAIN ? r.nm_ruas : '';
    r.label_ruas = Number(r.luar_ruas) ? 'Di luar ruas' + (nama ? ': ' + nama : ' (Jalan Lain)') : (nama || '-');
  });
  return rows;
}

// jenis: jenis_izin permohonan, menentukan label dokumen
async function getDokumen(permohonan_id, jenis) {
  var label = jenisDokumen(jenis);
  var [rows] = await sql_enak.raw(
    `SELECT permohonan_dokumen_id, jenis_dokumen, nama_asli, lastUpdateAt
       FROM permohonan_dokumen WHERE permohonan_id = ?`,
    [permohonan_id]
  );
  return rows.map(function (d) {
    d.label = label[d.jenis_dokumen] || d.jenis_dokumen;
    return d;
  });
}

// Detail lengkap satu permohonan: header + provider + dokumen + ruas
async function getDetail(permohonan) {
  var [prov] = await sql_enak.raw(
    `SELECT pv.provider, ps.perusahaan_id, ps.nama_perusahaan, ps.alamat, ps.no_telepon, ps.email
       FROM provider pv
       LEFT JOIN perusahaan ps ON ps.perusahaan_id = pv.perusahaan_id AND ps.deletedAt IS NULL
      WHERE pv.provider_id = ?`,
    [permohonan.provider_id || 0]
  );
  var [vendor] = await sql_enak.raw(`SELECT fullname, username, email, telp FROM user WHERE id_user = ?`, [permohonan.id_user]);
  var pr = prov[0];
  return {
    permohonan: Object.assign({}, permohonan, {
      provider: pr ? pr.provider : null,
      // Perusahaan pemilik provider yang dipilih pada permohonan
      perusahaan: pr && pr.perusahaan_id ? {
        perusahaan_id: pr.perusahaan_id,
        nama_perusahaan: pr.nama_perusahaan,
        alamat: pr.alamat,
        no_telepon: pr.no_telepon,
        email: pr.email
      } : null,
      vendor: vendor[0] || null,
      bisa_ubah: bisaUbah(permohonan)
    }),
    dokumen: await getDokumen(permohonan.permohonan_id, permohonan.jenis_izin),
    ruas: await getRuas(permohonan.permohonan_id)
  };
}

// Hasil digitasi tiang, kabel & titik reklame satu permohonan (opsional: satu ruas saja) sebagai GeoJSON
async function getDigitasi(permohonan_id, permohonan_ruas_id) {
  var filter = permohonan_ruas_id ? ` AND x.permohonan_ruas_id = ?` : ``;
  var val = permohonan_ruas_id ? [permohonan_id, permohonan_ruas_id] : [permohonan_id];
  var [tiang] = await sql_enak.raw(
    `SELECT x.permohonan_tiang_id AS id, x.permohonan_ruas_id, x.jumlah, x.kategori, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_tiang x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_tiang_id`,
    val
  );
  var [kabel] = await sql_enak.raw(
    `SELECT x.permohonan_kabel_id AS id, x.permohonan_ruas_id, x.jumlah, x.kategori, x.panjang, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_kabel x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_kabel_id`,
    val
  );
  var [titik] = await sql_enak.raw(
    `SELECT x.permohonan_titik_id AS id, x.permohonan_ruas_id, x.jumlah, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_titik x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_titik_id`,
    val
  );
  var [akses] = await sql_enak.raw(
    `SELECT x.permohonan_akses_id AS id, x.permohonan_ruas_id, x.jumlah, x.kategori, x.luas, x.keterangan,
            ST_AsGeoJSON(x.SHAPE) AS geojson, mr.nm_ruas
       FROM permohonan_akses x
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = x.permohonan_ruas_id AND r.deletedAt IS NULL
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE x.permohonan_id = ? AND x.deletedAt IS NULL` + filter + ` ORDER BY x.permohonan_akses_id`,
    val
  );
  [tiang, kabel, titik, akses].forEach(function (list) {
    list.forEach(function (f) { if (typeof f.geojson === 'string') f.geojson = JSON.parse(f.geojson); });
  });
  return { tiang: tiang, kabel: kabel, titik: titik, akses: akses };
}

// Jumlah fitur digitasi satu ruas (kabel baru boleh didigitasi setelah ada tiang)
async function hitungDigitasi(permohonan_ruas_id) {
  var [rows] = await sql_enak.raw(
    `SELECT (SELECT COUNT(*) FROM permohonan_tiang WHERE permohonan_ruas_id = ? AND deletedAt IS NULL) AS tiang,
            (SELECT COUNT(*) FROM permohonan_kabel WHERE permohonan_ruas_id = ? AND deletedAt IS NULL) AS kabel`,
    [permohonan_ruas_id, permohonan_ruas_id]
  );
  return { tiang: Number(rows[0].tiang), kabel: Number(rows[0].kabel) };
}

// Kolom master_retribusi yang disalin ke permohonan_ruas agar data ruas saat permohonan tetap utuh walau master berubah
// (tarif t_k30cm & jr_atk15cm disimpan sebagai tarif_tiang & tarif_kabel)
var KOLOM_SALINAN_RUAS = ['no', 'nm_ruas', 'tk_ruas_aw', 'tk_ruas_ak', 'lbr_keras', 'panjang', 'id_kec', 'id_kel']
  .concat(KOMPONEN_SEMUA.filter(function (k) { return k.tarif === k.kode; }).map(function (k) { return k.kode; }));

async function salinDataRuas(permohonan_ruas_id) {
  await sql_enak.raw(
    `UPDATE permohonan_ruas r
       JOIN master_retribusi mr ON mr.id = r.ruas_id
        SET ${KOLOM_SALINAN_RUAS.map(function (k) { return 'r.' + k + ' = mr.' + k; }).join(', ')}
      WHERE r.permohonan_ruas_id = ?`,
    [permohonan_ruas_id]
  );
}

// Total ruas mengikuti hasil digitasi setiap kali digitasi disimpan
async function sinkronTotalRuas(permohonan_ruas_id) {
  await sql_enak.raw(
    `UPDATE permohonan_ruas r
        SET r.jumlah_tiang = (SELECT IFNULL(SUM(jumlah), 0) FROM permohonan_tiang
                               WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL),
            -- titik reklame / titik akses (satu ruas hanya punya salah satunya)
            r.jumlah_titik = (SELECT IFNULL(SUM(jumlah), 0) FROM permohonan_titik
                               WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL)
                           + (SELECT COUNT(*) FROM permohonan_akses
                               WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL),
            r.lastUpdateAt = NOW()
      WHERE r.permohonan_ruas_id = ?`,
    [permohonan_ruas_id]
  );
  await sinkronKomponenDigitasi(permohonan_ruas_id);
}

// Jumlah tiap komponen retribusi mengikuti kategori hasil digitasi: tiang (unit) per kategori t_*,
// kabel (meter = panjang bulat x jumlah) per kategori jr_*. Ruas tanpa digitasi tiang / kabel tetap memakai isian manual.
async function sinkronKomponenDigitasi(permohonan_ruas_id) {
  var set = [];
  Object.keys(KATEGORI_DIGITASI).forEach(function (jenis) {
    var cfg = KATEGORI_DIGITASI[jenis];
    var nilai = cfg.nilai;
    var ada = `EXISTS (SELECT 1 FROM ${cfg.tabel} WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL)`;
    cfg.daftar.forEach(function (k) {
      set.push(`r.${k.jumlah} = IF(${ada}, (SELECT IFNULL(SUM(${nilai}), 0) FROM ${cfg.tabel}
                 WHERE permohonan_ruas_id = r.permohonan_ruas_id AND deletedAt IS NULL AND kategori = '${k.kode}'), r.${k.jumlah})`);
    });
  });
  await sql_enak.raw(
    `UPDATE permohonan_ruas r SET ${set.join(',\n        ')}, r.lastUpdateAt = NOW() WHERE r.permohonan_ruas_id = ?`,
    [permohonan_ruas_id]
  );
}

// Salin digitasi permohonan yang disetujui ke data utama `tiang` & `kabel`.
// Salinan lama permohonan ini dihapus dulu agar persetujuan ulang tidak dobel.
// Format kolom mengikuti data survey: kode_ruas = master_retribusi.no,
// kolom kategori (t_k30cm / t_l30cm, jr_btk15cm / jr_btl15cm / jr_atk15cm / jr_atl15cm) berisi kodenya sendiri
// sesuai kategori digitasi (lainnya NULL), kd_kec/kd_kel dari poligon kelurahan.
// Digitasi permohonan tersimpan SRID 0, sedangkan tiang/kabel/kelurahan SRID 1 -> dikonversi saat disalin.
// Salin tiang permohonan ke tabel `tiang`; dipakai saat persetujuan & sinkron manual (tambah filter AND ...)
var SQL_SALIN_TIANG = `
  INSERT INTO tiang (SHAPE, kode_ruas, kode_gps, jumlah_tia, provider, t_k30cm, t_l30cm, ciri_tiang, surveyor,
                     kd_kec, kd_kel, provider_id, insertedAt, lastUpdateAt, permohonan_id, permohonan_tiang_id)
  SELECT ST_GeomFromWKB(ST_AsWKB(pt.SHAPE), 1), mr.no, CONCAT('IZIN-', p.permohonan_id, '-', pt.permohonan_tiang_id), pt.jumlah, pr.provider,
         IF(pt.kategori = 't_k30cm', 't_k30cm', NULL), IF(pt.kategori = 't_l30cm', 't_l30cm', NULL), pt.keterangan, u.fullname,
         (SELECT kl.kec_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_GeomFromWKB(ST_AsWKB(pt.SHAPE), 1)) LIMIT 1),
         (SELECT kl.kel_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_GeomFromWKB(ST_AsWKB(pt.SHAPE), 1)) LIMIT 1),
         p.provider_id, NOW(), NOW(), p.permohonan_id, pt.permohonan_tiang_id
    FROM permohonan_tiang pt
    JOIN permohonan_ruas r ON r.permohonan_ruas_id = pt.permohonan_ruas_id AND r.deletedAt IS NULL
    JOIN permohonan p ON p.permohonan_id = pt.permohonan_id
    LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
    LEFT JOIN provider pr ON pr.provider_id = p.provider_id
    LEFT JOIN user u ON u.id_user = p.id_user
   WHERE pt.deletedAt IS NULL`;

// Tiang permohonan (selain draft) beserta id salinannya di tabel tiang, untuk halaman sinkron
async function daftarSinkronTiang(status) {
  var filter = status ? ` AND p.status = ?` : ` AND p.status <> 'draft'`;
  var [data] = await sql_enak.raw(
    `SELECT pt.permohonan_tiang_id AS id, pt.permohonan_id, pt.jumlah, pt.keterangan,
            ST_AsGeoJSON(pt.SHAPE) AS geojson, p.status, mr.no AS no_ruas, mr.nm_ruas,
            pr.provider, u.fullname AS nama_vendor,
            (SELECT t.id FROM tiang t WHERE t.permohonan_tiang_id = pt.permohonan_tiang_id AND t.deletedAt IS NULL LIMIT 1) AS tiang_id
       FROM permohonan_tiang pt
       JOIN permohonan_ruas r ON r.permohonan_ruas_id = pt.permohonan_ruas_id AND r.deletedAt IS NULL
       JOIN permohonan p ON p.permohonan_id = pt.permohonan_id
       LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
       LEFT JOIN provider pr ON pr.provider_id = p.provider_id
       LEFT JOIN user u ON u.id_user = p.id_user
      WHERE pt.deletedAt IS NULL` + filter + ` ORDER BY pt.permohonan_id DESC, pt.permohonan_tiang_id`,
    status ? [status] : []
  );
  data.forEach(function (d) { if (typeof d.geojson === 'string') d.geojson = JSON.parse(d.geojson); });
  return data;
}

// Data utama tiang di dalam kotak peta [barat, selatan, timur, utara] sebagai pembanding di halaman sinkron
var BATAS_TIANG_AREA = 3000;
async function tiangDalamArea(bbox) {
  var b = (bbox || []).map(Number);
  if (b.length !== 4 || b.some(isNaN)) return [];
  var kotak = 'POLYGON((' + [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]
    .map(function (p) { return p[0] + ' ' + p[1]; }).join(', ') + '))';
  var [data] = await sql_enak.raw(
    `SELECT id, ST_X(SHAPE) AS lng, ST_Y(SHAPE) AS lat, kode_gps, kode_ruas, provider, jumlah_tia, permohonan_tiang_id
       FROM tiang
      WHERE MBRContains(ST_GeomFromText(?, 1), SHAPE) AND deletedAt IS NULL
      LIMIT ${BATAS_TIANG_AREA + 1}`,
    [kotak]
  );
  return data;
}

// Duplikat tiang permohonan terpilih ke tabel tiang; yang sudah punya salinan dilewati
async function sinkronTiang(ids) {
  ids = (ids || []).map(function (i) { return parseInt(i); }).filter(function (i) { return i > 0; });
  if (!ids.length) return 0;
  var [hasil] = await sql_enak.raw(
    SQL_SALIN_TIANG + ` AND pt.permohonan_tiang_id IN (${ids.map(function () { return '?'; }).join(', ')})
      AND NOT EXISTS (SELECT 1 FROM tiang t WHERE t.permohonan_tiang_id = pt.permohonan_tiang_id AND t.deletedAt IS NULL)`,
    ids
  );
  return hasil.affectedRows;
}

async function salinKeDataUtama(permohonan_id) {
  await hapusDariDataUtama(permohonan_id);
  var [tiang] = await sql_enak.raw(SQL_SALIN_TIANG + ` AND pt.permohonan_id = ?`, [permohonan_id]);
  var [kabel] = await sql_enak.raw(
    `INSERT INTO kabel (SHAPE, kode_ruas, kode_gps_p, kode_gps_u, provider, ciri_kabel, jumlah,
                        jr_btk15cm, jr_btl15cm, jr_atk15cm, jr_atl15cm, surveyor, panjang,
                        kd_kec, kd_kel, provider_id, insertedAt, lastUpdateAt, permohonan_id, permohonan_kabel_id)
     SELECT ST_GeomFromWKB(ST_AsWKB(pk.SHAPE), 1), mr.no,
            CONCAT('IZIN-', p.permohonan_id, '-', pk.permohonan_kabel_id, '-A'),
            CONCAT('IZIN-', p.permohonan_id, '-', pk.permohonan_kabel_id, '-B'),
            pr.provider, pk.keterangan, pk.jumlah,
            IF(pk.kategori = 'jr_btk15cm', 'jr_btk15cm', NULL), IF(pk.kategori = 'jr_btl15cm', 'jr_btl15cm', NULL),
            IF(pk.kategori = 'jr_atk15cm', 'jr_atk15cm', NULL), IF(pk.kategori = 'jr_atl15cm', 'jr_atl15cm', NULL),
            u.fullname, pk.panjang,
            (SELECT kl.kec_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_StartPoint(ST_GeomFromWKB(ST_AsWKB(pk.SHAPE), 1))) LIMIT 1),
            (SELECT kl.kel_id FROM kelurahan kl WHERE ST_Contains(kl.SHAPE, ST_StartPoint(ST_GeomFromWKB(ST_AsWKB(pk.SHAPE), 1))) LIMIT 1),
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
  alamat: 'Jl. Proklamasi No. 11 Kota Tegal Kode Pos 52111',
  kontak: 'Telp./Fax. (0283) 356353, e-mail :  dpukotategal@gmail.com',
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
  var total = { tiang: 0, kabel: 0, titik: 0, retribusi_tiang: 0, retribusi_kabel: 0, retribusi: 0, komponen: {} };
  KOMPONEN_SEMUA.forEach(function (k) { total.komponen[k.kode] = { jumlah: 0, retribusi: 0 }; });
  detail.ruas.forEach(function (r) {
    total.titik += Number(r.jumlah_titik || 0);
    KOMPONEN_SEMUA.forEach(function (k) {
      total.komponen[k.kode].jumlah += Number(r[k.jumlah] || 0);
      total.komponen[k.kode].retribusi += Number(r['retribusi_' + k.kode] || 0);
    });
    total.tiang += Number(r.jml_t_k30cm);
    total.kabel += Number(r.total_kabel || 0);
    total.retribusi_tiang += Number(r.retribusi_tiang);
    total.retribusi_kabel += Number(r.retribusi_kabel);
    total.retribusi += Number(r.retribusi_total);
  });
  var kata = terbilang(total.retribusi).replace(/\s+/g, ' ').trim() || 'nol';
  total.terbilang = kata.charAt(0).toUpperCase() + kata.slice(1) + ' rupiah';
  detail.total = total;
  detail.jenis = jenisIzin(permohonan);
  detail.konfig = Object.assign({}, KONFIG_SK);
  // Penandatangan dipilih saat permohonan lolos verifikasi (master_penandatangan); tanpa itu memakai KONFIG_SK
  var [ttd] = await sql_enak.raw(`SELECT nama, nip, jabatan, pangkat FROM master_penandatangan WHERE penandatangan_id = ?`, [permohonan.penandatangan_id || 0]);
  if (ttd.length) {
    detail.konfig.jabatan_ttd = ttd[0].jabatan;
    detail.konfig.nama_ttd = ttd[0].nama;
    detail.konfig.pangkat_ttd = ttd[0].pangkat || '';
    detail.konfig.nip_ttd = ttd[0].nip;
  }
  detail.tim_teknis = await getTimTeknis(permohonan.permohonan_id);
  return detail;
}

// Anggota tim teknis permohonan (dipilih admin saat verifikasi)
async function getTimTeknis(permohonan_id) {
  var [rows] = await sql_enak.raw(
    `SELECT u.id_user, u.fullname, u.username, u.NIP, u.instansi FROM permohonan_tim_teknis t
       JOIN user u ON u.id_user = t.id_user
      WHERE t.permohonan_id = ? ORDER BY u.fullname ASC`,
    [permohonan_id]
  );
  return rows;
}

var STATUS_LABEL = { draft: 'Draft', diajukan: 'Menunggu Verifikasi', revisi: 'Perlu Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak' };
// Posisi permohonan berstatus 'diajukan' di backoffice (permohonan.tahap)
var TAHAP_LABEL = {
  verifikasi: 'Permohonan Izin (Verifikasi)', peninjauan_lapangan: 'Peninjauan Lapangan', persetujuan_prinsip: 'Persetujuan Prinsip',
  verifikasi_persyaratan: 'Verifikasi Persyaratan', penerbitan_izin: 'Penerbitan Izin'
};

function tglIndo(d) {
  if (!d) return '-';
  d = new Date(d);
  function dua(n) { return (n < 10 ? '0' : '') + n; }
  return dua(d.getDate()) + '/' + dua(d.getMonth() + 1) + '/' + d.getFullYear();
}

// Reklame: rincian ruas & jumlah titik (tanpa retribusi). data = hasil getDataSk()
function buatExcelReklame(data) {
  var p = data.permohonan;
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Permohonan ' + p.permohonan_id);
  ws.columns = [6, 40, 10, 12, 12, 16, 16].map(function (w) { return { width: w }; });
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'Rincian Permohonan Izin Reklame';
  ws.getCell('A1').font = { bold: true, size: 14 };
  [
    ['Vendor', (p.vendor && (p.vendor.fullname || p.vendor.username)) || '-'],
    ['Pemohon', (p.nama_pemohon || '-') + (p.jabatan_pemohon ? ' (' + p.jabatan_pemohon + ')' : '')],
    ['Telp / Email', (p.telp_pemohon || '-') + ' / ' + (p.email_pemohon || '-')],
    ['Status', p.status === 'diajukan' && TAHAP_LABEL[p.tahap] ? 'Diproses - ' + TAHAP_LABEL[p.tahap] : (STATUS_LABEL[p.status] || p.status)],
    ['Tgl. Diajukan', tglIndo(p.diajukanAt)],
    ['No. / Tgl. SK', (p.no_sk || '-') + (p.tanggal_sk ? ' / ' + tglIndo(p.tanggal_sk) : '')]
  ].forEach(function (info, i) {
    var r = i + 2;
    ws.getCell('A' + r).value = info[0];
    ws.mergeCells('A' + r + ':B' + r);
    ws.getCell('C' + r).value = ': ' + info[1];
    ws.mergeCells('C' + r + ':G' + r);
  });
  var H = 9;
  ws.getRow(H).values = ['No.', 'Ruas Jalan', 'Prov', 'Kab/Kota', 'No. Ruas', 'Panjang SK (Km)', 'Jumlah Titik'];
  var r = H + 1;
  data.ruas.forEach(function (x, i) {
    var luar = Number(x.luar_ruas);
    ws.getRow(r++).values = [i + 1, x.label_ruas,
      luar || !x.no ? '-' : KODE_WILAYAH.prov, luar || !x.no ? '-' : KODE_WILAYAH.kab, luar ? '-' : (x.no || '-'),
      luar || x.panjang == null ? null : Number(x.panjang), Number(x.jumlah_titik || 0)];
  });
  ws.mergeCells('A' + r + ':F' + r);
  ws.getCell('A' + r).value = 'Total';
  ws.getCell('A' + r).alignment = { horizontal: 'right' };
  ws.getCell('G' + r).value = data.total.titik;
  [H, r].forEach(function (n) {
    ws.getRow(n).eachCell({ includeEmpty: true }, function (c) {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: n === H ? 'FFD9E1F2' : 'FFFFF2CC' } };
    });
  });
  for (var b = H; b <= r; b++) {
    for (var c = 1; c <= 7; c++) {
      ws.getRow(b).getCell(c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
  }
  return wb;
}

// Workbook rincian ruas & retribusi satu permohonan; kolom mengikuti tabel ruas di form pengisian.
// data = hasil getDataSk()
async function buatExcel(data) {
  if (data.jenis && data.jenis.kode === 'reklame') return buatExcelReklame(data);
  var p = data.permohonan;
  var K = data.jenis ? data.jenis.komponen : KOMPONEN_RETRIBUSI;
  var nKolom = 6 + K.length * 3 + 1;           // No..Panjang, 3 kolom per komponen, total
  function huruf(n) { var h = ''; while (n > 0) { var m = (n - 1) % 26; h = String.fromCharCode(65 + m) + h; n = (n - m - 1) / 26; } return h; }
  function kolKomponen(i, j) { return huruf(7 + i * 3 + j); }   // j: 0 jumlah, 1 nilai retribusi, 2 total
  var AKHIR = huruf(nKolom);

  var wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  var ws = wb.addWorksheet('Permohonan ' + p.permohonan_id);
  ws.columns = [6, 35, 10, 18, 18, 12].concat(K.reduce(function (a) { return a.concat([12, 15, 16]); }, []), [20])
    .map(function (w) { return { width: w }; });

  ws.mergeCells('A1:' + AKHIR + '1');
  ws.getCell('A1').value = 'Rincian Permohonan Izin ' + (data.jenis ? data.jenis.label : 'Jaringan Utilitas');
  ws.getCell('A1').font = { bold: true, size: 14 };
  [
    ['Vendor', (p.vendor && (p.vendor.fullname || p.vendor.username)) || '-'],
    ['Pemohon', (p.nama_pemohon || '-') + (p.jabatan_pemohon ? ' (' + p.jabatan_pemohon + ')' : '')],
    ['Telp / Email', (p.telp_pemohon || '-') + ' / ' + (p.email_pemohon || '-')],
    ['Provider', p.provider || '-'],
    ['Status', p.status === 'diajukan' && TAHAP_LABEL[p.tahap] ? 'Diproses - ' + TAHAP_LABEL[p.tahap] : (STATUS_LABEL[p.status] || p.status)],
    ['Tgl. Diajukan', tglIndo(p.diajukanAt)],
    ['No. / Tgl. SK', (p.no_sk || '-') + (p.tanggal_sk ? ' / ' + tglIndo(p.tanggal_sk) : '')]
  ].forEach(function (info, i) {
    var r = i + 2;
    ws.getCell('A' + r).value = info[0];
    ws.mergeCells('A' + r + ':B' + r);
    ws.getCell('C' + r).value = ': ' + info[1];
    ws.mergeCells('C' + r + ':' + AKHIR + r);
  });

  // Header tabel 3 baris (baris 10-12)
  var H = 10;
  var header = [
    ['A10:A12', 'No.'], ['B10:B12', 'Ruas Jalan'], ['C10:E11', 'Nomor Ruas'], ['F10', 'Panjang SK Jalan'],
    [AKHIR + '10:' + AKHIR + '12', 'Jumlah Total Retribusi (Rp)'],
    ['F11:F12', 'Km'], ['C12', 'Prov'], ['D12', 'Kab/Kota'], ['E12', 'No. Ruas']
  ];
  K.forEach(function (k, i) {
    header.push(
      [kolKomponen(i, 0) + '10:' + kolKomponen(i, 2) + '10', k.label],
      [kolKomponen(i, 0) + '11', 'Jumlah'], [kolKomponen(i, 1) + '11', 'Nilai Retribusi'], [kolKomponen(i, 2) + '11', 'Total'],
      [kolKomponen(i, 0) + '12', k.satuan], [kolKomponen(i, 1) + '12', 'Rp/' + k.satuan + '/Tahun'], [kolKomponen(i, 2) + '12', 'Rp/Tahun']
    );
  });
  header.forEach(function (h) {
    if (h[0].indexOf(':') > -1) ws.mergeCells(h[0]);
    ws.getCell(h[0].split(':')[0]).value = h[1];
  });
  for (var hr = H; hr <= H + 2; hr++) {
    ws.getRow(hr).eachCell({ includeEmpty: true }, function (c) {
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });
  }

  var awal = H + 3, r = awal;
  data.ruas.forEach(function (x, i) {
    var luar = Number(x.luar_ruas);
    var nilai = [
      i + 1,
      x.label_ruas,
      luar || !x.no ? '-' : KODE_WILAYAH.prov,
      luar || !x.no ? '-' : KODE_WILAYAH.kab,
      luar ? '-' : (x.no || '-'),
      luar || x.panjang == null ? null : Number(x.panjang)
    ];
    K.forEach(function (k, j) {
      nilai.push(Number(x[k.jumlah] || 0), Number(x[k.tarif] || 0),
        { formula: kolKomponen(j, 0) + r + '*' + kolKomponen(j, 1) + r, result: Number(x['retribusi_' + k.kode] || 0) });
    });
    nilai.push({ formula: K.map(function (k, j) { return kolKomponen(j, 2) + r; }).join('+'), result: Number(x.retribusi_total) });
    ws.getRow(r).values = nilai;
    ws.getCell('A' + r).alignment = { horizontal: 'center' };
    ['C', 'D', 'E'].forEach(function (k) { ws.getCell(k + r).alignment = { horizontal: 'center' }; });
    r++;
  });
  if (!data.ruas.length) {
    ws.mergeCells('A' + r + ':' + AKHIR + r);
    ws.getCell('A' + r).value = 'Belum ada ruas jalan';
    ws.getCell('A' + r).alignment = { horizontal: 'center' };
    r++;
  }
  var akhir = r - 1, t = data.total;
  function jumlah(k, hasil) {
    return data.ruas.length ? { formula: 'SUM(' + k + awal + ':' + k + akhir + ')', result: hasil } : 0;
  }
  ws.mergeCells('A' + r + ':F' + r);
  ws.getCell('A' + r).value = 'Total';
  ws.getCell('A' + r).alignment = { horizontal: 'right' };
  K.forEach(function (k, i) {
    ws.getCell(kolKomponen(i, 0) + r).value = jumlah(kolKomponen(i, 0), t.komponen[k.kode].jumlah);
    ws.getCell(kolKomponen(i, 2) + r).value = jumlah(kolKomponen(i, 2), t.komponen[k.kode].retribusi);
  });
  ws.getCell(AKHIR + r).value = jumlah(AKHIR, t.retribusi);
  ws.getRow(r).eachCell({ includeEmpty: true }, function (c) {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  });
  r++;
  ws.mergeCells('A' + r + ':B' + r);
  ws.getCell('A' + r).value = 'Terbilang';
  ws.getCell('A' + r).font = { bold: true };
  ws.mergeCells('C' + r + ':' + AKHIR + r);
  ws.getCell('C' + r).value = t.terbilang;
  ws.getCell('C' + r).font = { italic: true };

  for (var b = H; b <= r; b++) {
    for (var c = 1; c <= nKolom; c++) {
      ws.getRow(b).getCell(c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
  }
  for (var n = awal; n < r; n++) {
    ws.getCell('F' + n).numFmt = '#,##0.00';
    K.forEach(function (k, i) {
      ws.getCell(kolKomponen(i, 0) + n).numFmt = k.satuan === 'Unit' ? '#,##0' : '#,##0.00';
      ws.getCell(kolKomponen(i, 1) + n).numFmt = '#,##0';
      ws.getCell(kolKomponen(i, 2) + n).numFmt = '#,##0';
    });
    ws.getCell(AKHIR + n).numFmt = '#,##0';
  }
  ws.views = [{ state: 'frozen', ySplit: H + 2 }];
  return wb;
}

function kirimDokumen(res, dokumen) {
  if (!dokumen) return res.status(404).send('Dokumen tidak ditemukan');
  var file = path.join(DIR_DOKUMEN, path.basename(dokumen.nama_file));
  if (!fs.existsSync(file)) return res.status(404).send('File tidak ditemukan');
  res.download(file, dokumen.nama_asli || dokumen.nama_file);
}

module.exports = {
  JENIS_IZIN: JENIS_IZIN,
  jenisIzin: jenisIzin,
  jenisDokumen: jenisDokumen,
  JENIS_DOKUMEN: JENIS_DOKUMEN,
  DOKUMEN_WAJIB: DOKUMEN_WAJIB,
  dokumenWajib: dokumenWajib,
  upload_dokumen: upload_dokumen,
  KODE_WILAYAH: KODE_WILAYAH,
  NAMA_RUAS_LAIN: NAMA_RUAS_LAIN,
  getIdRuasLain: getIdRuasLain,
  getDataSk: getDataSk,
  getTimTeknis: getTimTeknis,
  KONFIG_SK: KONFIG_SK,
  buatExcel: buatExcel,
  bisaUbah: bisaUbah,
  providerTerverifikasi: providerTerverifikasi,
  bisaIsiAwal: bisaIsiAwal,
  SQL_REKAP: SQL_REKAP,
  buatDraft: buatDraft,
  getPermohonan: getPermohonan,
  getRuas: getRuas,
  getDokumen: getDokumen,
  getDetail: getDetail,
  getDigitasi: getDigitasi,
  hitungDigitasi: hitungDigitasi,
  sinkronTotalRuas: sinkronTotalRuas,
  sinkronKomponenDigitasi: sinkronKomponenDigitasi,
  kategoriDigitasi: kategoriDigitasi,
  kategoriValid: kategoriValid,
  salinDataRuas: salinDataRuas,
  KOLOM_SALINAN_RUAS: KOLOM_SALINAN_RUAS,
  KOMPONEN_RETRIBUSI: KOMPONEN_RETRIBUSI,
  KOMPONEN_AKSES: KOMPONEN_AKSES,
  salinKeDataUtama: salinKeDataUtama,
  daftarSinkronTiang: daftarSinkronTiang,
  tiangDalamArea: tiangDalamArea,
  BATAS_TIANG_AREA: BATAS_TIANG_AREA,
  sinkronTiang: sinkronTiang,
  hapusDariDataUtama: hapusDariDataUtama,
  kirimDokumen: kirimDokumen
};
