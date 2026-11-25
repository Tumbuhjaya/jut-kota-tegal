var express = require('express');
var passport = require('passport')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser');
var sql_enak = require('../database/mysql_enak.js').connection;
var helper = require('../helpper/permohonan.js');
var tahapan = require('../helpper/tahapan_perizinan.js');
var pengingat = require('../helpper/pengingat_pp.js');

function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

// Hanya administrator (is_admin = 1) yang memproses permohonan
function cek_admin(req, res, next) {
  var user = getUser(req);
  if (req.isAuthenticated() && user && Number(user.is_admin) === 1) return next();
  if (req.xhr || req.method !== 'GET') return res.status(403).json({ status: 403, message: 'Khusus administrator', data: null });
  res.redirect('/');
}

function gagal(res, err, status) {
  if (err) console.log(err);
  res.status(status || 500).json({ status: status || 500, message: (err && err.message) || err || 'gagal', data: null });
}

var AKSI = { setujui: 'disetujui', tolak: 'ditolak', revisi: 'revisi' };
// Status yang masih boleh diproses admin
// Ditolak = final, tidak bisa diproses ulang (pemohon mengajukan permohonan baru)
var BISA_DIPROSES = ['diajukan', 'disetujui'];

// Router backoffice satu jenis izin: jaringan utilitas di /manajemen_perizinan, reklame di /manajemen_reklame.
// Alur & tabel sama; setiap permohonan diambil dengan filter jenis_izin agar kedua menu tidak saling membuka data.
function buatRouter(kode_jenis) {
var router = express.Router();
var JENIS = helper.jenisIzin(kode_jenis);
var BASE = JENIS.url_backoffice;
// Komponen retribusi per ruas; reklame tanpa retribusi
var KOMPONEN = JENIS.pakai_retribusi ? helper.KOMPONEN_RETRIBUSI : [];

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());
// Dipakai semua view: base = awalan URL menu, jenis_izin = konfigurasi jenis (label, provider, retribusi, digitasi)
router.use(function (req, res, next) {
  res.locals.base = BASE;
  res.locals.jenis_izin = JENIS;
  next();
});

function ambil(id) {
  return helper.getPermohonan(id, null, JENIS.kode);
}

// ---------------- VIEW ----------------
router.get('/', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/list', { user: getUser(req) });
});

// Admin mengisi permohonan atas nama vendor (?id_user=): buat draft lalu ke halaman edit.
// API simpan / syarat / digitasi memakai /perizinan/jaringan_utilitas/api yang juga melayani admin.
router.get('/insert', cek_admin, async function (req, res) {
  try {
    var [v] = await sql_enak.raw(
      `SELECT id_user, fullname, telp, email FROM user WHERE id_user = ? AND is_admin = 3 AND deleted = 0`,
      [req.query.id_user || 0]
    );
    if (!v.length) return res.redirect(BASE);
    var id = await helper.buatDraft(v[0], getUser(req).id_user, JENIS.kode);
    res.redirect(BASE + '/edit/' + id);
  } catch (err) {
    console.log(err);
    res.redirect(BASE);
  }
});

async function localsPengisian(p) {
  var [v] = await sql_enak.raw(`SELECT fullname, username FROM user WHERE id_user = ?`, [p.id_user]);
  return {
    permohonan: p,
    bisa_ubah: helper.bisaUbah(p, true),
    bisa_ajukan: helper.bisaUbah(p),
    kode_wilayah: helper.KODE_WILAYAH,
    komponen: KOMPONEN,
    atas_nama: v[0] ? (v[0].fullname || v[0].username) : '-'
  };
}

router.get('/edit/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p) return res.redirect(BASE);
  var locals = await localsPengisian(p);
  locals.user = getUser(req);
  res.render('content-backoffice/manajemen_perizinan/edit', locals);
});

function viewDigitasi(jenis) {
  return async function (req, res) {
    var p = await ambil(req.params.id);
    if (!p) return res.redirect(BASE);
    var [ruas] = await sql_enak.raw(
      `SELECT r.permohonan_ruas_id, r.ruas_id, mr.nm_ruas FROM permohonan_ruas r
         LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
        WHERE r.permohonan_ruas_id = ? AND r.permohonan_id = ? AND r.deletedAt IS NULL`,
      [req.params.id_ruas, p.permohonan_id]
    );
    if (!ruas.length) return res.redirect(BASE + '/edit/' + p.permohonan_id);
    // Jalan Lain hanya punya titik dummy: peta tidak di-zoom ke sana
    if (ruas[0].nm_ruas === helper.NAMA_RUAS_LAIN) ruas[0].ruas_id = null;
    var locals = await localsPengisian(p);
    locals.user = getUser(req);
    locals.ruas = ruas[0];
    locals.jenis = jenis;
    res.render('content-backoffice/manajemen_perizinan/digitasi', locals);
  };
}
// Utilitas: tiang & kabel; reklame: titik
JENIS.digitasi.forEach(function (jenis) {
  router.get('/' + jenis + '/:id/:id_ruas', cek_admin, viewDigitasi(jenis));
});

// Unduh rincian ruas & retribusi satu permohonan sebagai file Excel (.xlsx)
router.get('/export_excel/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p) return res.status(404).send('Permohonan tidak ditemukan');
    var wb = await helper.buatExcel(await helper.getDataSk(p));
    var nama = 'Permohonan_Izin_' + p.permohonan_id + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nama + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { gagal(res, err); }
});

// Sinkron tiang permohonan ke tabel tiang: peta + list, admin memilih tiang yang diduplikat (khusus jaringan utilitas)
if (JENIS.kode === 'jaringan_utilitas') {
router.get('/sinkron_tiang', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/sinkron_tiang', { user: getUser(req) });
});

router.get('/sinkron_tiang/data', cek_admin, async function (req, res) {
  try {
    res.json({ status: 200, message: 'sukses', data: await helper.daftarSinkronTiang(req.query.status) });
  } catch (err) { gagal(res, err); }
});

// ?bbox=barat,selatan,timur,utara -> data utama tiang di area peta (penuh = melebihi batas)
router.get('/sinkron_tiang/tiang', cek_admin, async function (req, res) {
  try {
    var data = await helper.tiangDalamArea(String(req.query.bbox || '').split(','));
    var penuh = data.length > helper.BATAS_TIANG_AREA;
    res.json({ status: 200, message: 'sukses', data: { tiang: data.slice(0, helper.BATAS_TIANG_AREA), penuh: penuh } });
  } catch (err) { gagal(res, err); }
});

// body: { ids: [permohonan_tiang_id, ...] }
router.post('/sinkron_tiang', cek_admin, async function (req, res) {
  try {
    var ids = (req.body && req.body.ids) || [];
    if (!ids.length) return gagal(res, 'Pilih tiang yang akan diduplikat', 400);
    res.json({ status: 200, message: 'sukses', data: { masuk: await helper.sinkronTiang(ids) } });
  } catch (err) { gagal(res, err); }
});
}

router.get('/detail/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p || p.status === 'draft') return res.redirect(BASE);
  res.render('content-backoffice/manajemen_perizinan/detail', { user: getUser(req), permohonan_id: p.permohonan_id, komponen: KOMPONEN });
});

// ---------------- API ----------------
// Draft hanya tampil jika difilter status 'draft' (draft vendor yang belum diajukan + isian admin)
router.post('/list', cek_admin, async function (req, res) {
  try {
    var sql = helper.SQL_REKAP + ` AND p.jenis_izin = ?`;
    var val = [JENIS.kode];
    if (req.body.status) { sql += ` AND p.status = ?`; val.push(req.body.status); }
    else sql += ` AND p.status <> 'draft'`;
    // Status langkah penerbitan izin per baris: draft perjanjian sewa -> perjanjian TTD -> draft SK -> SK TTD
    var [data] = await sql_enak.raw(
      `SELECT x.*, (ps.permohonan_id IS NOT NULL) AS ada_sewa, (ps.file_ttd IS NOT NULL) AS ada_sewa_ttd,
              ps.no_perjanjian, (pk.file_sk IS NOT NULL) AS ada_sk_ttd, pk.uploadSkAt,
              pp.tanggal_pp, pp.pengingat_terakhir, pp.pengingat_jumlah,
              IF(pp.uploadTtdAt IS NULL, NULL, DATEDIFF(CURDATE(), pp.tanggal_pp)) AS hari_pp,
              ${tahapan.JAMINAN.map(function (j) {
                return `pp.${j.kode}_tgl_akhir, DATEDIFF(pp.${j.kode}_tgl_akhir, CURDATE()) AS ${j.kode}_sisa_hari,
                        (pp.${j.kode}_tgl_akhir <= DATE_ADD(CURDATE(), INTERVAL ${Number(tahapan.BULAN_PERINGATAN_JAMINAN)} MONTH)) AS ${j.kode}_dekat`;
              }).join(',\n              ')}
         FROM (${sql}) x
         JOIN permohonan pk ON pk.permohonan_id = x.permohonan_id
         LEFT JOIN permohonan_perjanjian_sewa ps ON ps.permohonan_id = x.permohonan_id
         LEFT JOIN permohonan_persetujuan_prinsip pp ON pp.permohonan_id = x.permohonan_id
        ORDER BY FIELD(x.status, 'diajukan') DESC, IFNULL(x.diajukanAt, x.insertedAt) DESC`, val);
    data.forEach(function (d) {
      d.bisa_ubah = helper.bisaUbah(d);
      d.bisa_edit = helper.bisaUbah(d, true);
      // Sudah >= 21 hari sejak persetujuan prinsip terbit tapi permohonan belum selesai
      d.terlambat_pp = d.status === 'diajukan' && d.hari_pp != null && d.hari_pp >= pengingat.HARI_MULAI;
      // Surat jaminan yang tanggal akhirnya tersisa <= 2 bulan (atau sudah lewat); permohonan ditolak tidak diperhatikan
      d.jaminan_habis = d.status === 'ditolak' ? [] : tahapan.JAMINAN.filter(function (j) {
        return d[j.kode + '_tgl_akhir'] && Number(d[j.kode + '_dekat']);
      }).map(function (j) {
        return { label: j.label, tgl_akhir: d[j.kode + '_tgl_akhir'], sisa_hari: Number(d[j.kode + '_sisa_hari']) };
      });
    });
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// Pilihan vendor saat admin mengisi permohonan atas nama vendor
router.get('/vendor', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT id_user, username, fullname FROM user WHERE is_admin = 3 AND deleted = 0 AND status_verifikasi = 'disetujui' ORDER BY fullname ASC, username ASC`
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get('/cetak_sk/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  // Disetujui, atau draft SK (No. SK) sudah disimpan di tahap penerbitan izin
  var draft = p && p.status === 'diajukan' && p.tahap === 'penerbitan_izin' && p.no_sk;
  if (!p || !(p.status === 'disetujui' || draft)) return res.status(404).send('SK belum tersedia');
  // getDataCetak = getDataSk + persetujuan prinsip + perjanjian sewa (dirujuk di surat izin)
  res.render('content-backoffice/manajemen_perizinan/cetak_sk', await tahapan.getDataCetak(p));
});

router.get('/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p || p.status === 'draft') return gagal(res, 'Permohonan tidak ditemukan', 404);
    var detail = await helper.getDetail(p);
    detail.digitasi = await helper.getDigitasi(p.permohonan_id);
    detail.perjanjian_sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
    detail.tim_teknis = await helper.getTimTeknis(p.permohonan_id);
    res.json({ status: 200, message: 'sukses', data: detail });
  } catch (err) { gagal(res, err); }
});

// Pilihan anggota tim teknis saat verifikasi: akun ber-role Tim Teknis (is_admin = 4)
router.get('/tim_teknis', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT id_user, username, fullname, NIP, instansi FROM user WHERE is_admin = 4 AND deleted = 0 ORDER BY fullname ASC, username ASC`
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get('/dokumen/:id_dokumen', cek_admin, async function (req, res) {
  try {
    var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_dokumen WHERE permohonan_dokumen_id = ?`, [req.params.id_dokumen]);
    helper.kirimDokumen(res, rows[0]);
  } catch (err) { gagal(res, err); }
});

// body: { aksi: setujui | tolak | revisi, no_sk, tanggal_sk, keterangan }
// Draft SK boleh disimpan di tahap penerbitan izin setelah perjanjian sewa TTD diupload, atau untuk SK yang sudah disetujui
async function simpanDraftSk(req, res, b) {
  var p = await ambil(req.params.id);
  var penerbitan = p && p.status === 'diajukan' && p.tahap === 'penerbitan_izin';
  if (!p || !(penerbitan || p.status === 'disetujui')) return gagal(res, 'Draft SK tidak bisa disimpan untuk permohonan ini', 400);
  if (penerbitan) {
    var sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
    if (!sewa || !sewa.file_ttd) return gagal(res, 'Upload perjanjian sewa yang sudah ditandatangani terlebih dahulu', 400);
  }
  if (!b.no_sk) return gagal(res, 'No. SK wajib diisi', 400);
  await sql_enak.raw(
    `UPDATE permohonan SET no_sk = ?, tanggal_sk = ?, keterangan = ?, lastUpdateAt = NOW() WHERE permohonan_id = ?`,
    [b.no_sk, b.tanggal_sk || null, b.keterangan || null, p.permohonan_id]
  );
  res.json({ status: 200, message: 'sukses', data: null });
}

// Menyetujui permohonan (SK terbit): digitasi utilitas masuk ke tabel tiang & kabel, status -> disetujui.
// Reklame belum punya tabel data utama, titiknya tetap di permohonan_titik.
async function setujuiPermohonan(p, no_sk, tanggal_sk, keterangan, id_user) {
  var masuk = JENIS.kode === 'jaringan_utilitas' ? await helper.salinKeDataUtama(p.permohonan_id) : null;
  await sql_enak.raw(
    `UPDATE permohonan
        SET status = 'disetujui', keterangan = ?, no_sk = ?, tanggal_sk = ?,
            diprosesAt = NOW(), diproses_oleh = ?, lastUpdateAt = NOW()
      WHERE permohonan_id = ?`,
    [keterangan || null, no_sk, tanggal_sk || null, id_user, p.permohonan_id]
  );
  return masuk;
}

// Draft SK tersimpan di tahap penerbitan izin + perjanjian sewa TTD sudah diupload -> SK siap ditandatangani
async function draftSkSiap(p) {
  if (!p || p.status !== 'diajukan' || p.tahap !== 'penerbitan_izin' || !p.no_sk) return false;
  var sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
  return !!(sewa && sewa.file_ttd);
}

router.post('/proses/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    // aksi 'simpan': hanya menyimpan data draft SK (untuk dicetak), status permohonan tidak berubah
    if (b.aksi === 'simpan') return await simpanDraftSk(req, res, b);
    var status = AKSI[b.aksi];
    if (!status) return gagal(res, 'Aksi tidak dikenal', 400);
    var p = await ambil(req.params.id);
    if (!p || BISA_DIPROSES.indexOf(p.status) === -1) return gagal(res, 'Permohonan tidak bisa diproses', 400);
    // SK baru bisa terbit setelah verifikasi s.d. verifikasi persyaratan selesai dan perjanjian sewa TTD diupload
    if (status === 'disetujui' && p.status === 'diajukan') {
      if (p.tahap !== 'penerbitan_izin') return gagal(res, 'Permohonan masih di tahap ' + tahapan.TAHAP[p.tahap], 400);
      var sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
      if (!sewa || !sewa.file_ttd) return gagal(res, 'Upload perjanjian sewa yang sudah ditandatangani terlebih dahulu', 400);
    }
    if (status === 'disetujui' && !b.no_sk) return gagal(res, 'No. SK wajib diisi', 400);
    if (status !== 'disetujui' && !b.keterangan) return gagal(res, 'Keterangan wajib diisi', 400);

    if (status === 'disetujui') {
      var masukSetujui = await setujuiPermohonan(p, b.no_sk, b.tanggal_sk, b.keterangan, getUser(req).id_user);
      return res.json({ status: 200, message: 'sukses', data: { masuk_data_utama: masukSetujui } });
    }

    // Revisi / tolak; SK yang dicabut -> salinan digitasi di data utama dihapus lagi
    var masuk = null;
    if (p.status === 'disetujui') await helper.hapusDariDataUtama(p.permohonan_id);

    await sql_enak.raw(
      `UPDATE permohonan
          SET status = ?, keterangan = ?, no_sk = ?, tanggal_sk = ?,
              diprosesAt = NOW(), diproses_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [status, b.keterangan || null,
       status === 'disetujui' ? b.no_sk : null,
       status === 'disetujui' ? (b.tanggal_sk || null) : null,
       getUser(req).id_user, p.permohonan_id]
    );
    if (status !== 'disetujui') notifikasiDikembalikan(p, status, b.keterangan);
    res.json({ status: 200, message: 'sukses', data: { masuk_data_utama: masuk } });
  } catch (err) { gagal(res, err); }
});



// ================ TAHAPAN: verifikasi -> peninjauan lapangan -> persetujuan prinsip ================
// Permohonan berstatus 'diajukan' berjalan per tahap (permohonan.tahap); tahap terakhir 'penerbitan_izin' = proses SK di atas.

// Permohonan yang sedang berada di `tahap` (status diajukan); null + respon error jika bukan
async function ambilTahap(req, res, tahap) {
  var p = await ambil(req.params.id);
  if (!p) { gagal(res, 'Permohonan tidak ditemukan', 404); return null; }
  if (p.status !== 'diajukan' || p.tahap !== tahap) {
    gagal(res, 'Permohonan tidak sedang di tahap ' + tahapan.TAHAP[tahap], 400);
    return null;
  }
  return p;
}

// Email ke pemohon saat permohonan dikembalikan untuk revisi / ditolak
function notifikasiDikembalikan(p, status, keterangan) {
  var tolak = status === 'ditolak';
  tahapan.kirimNotifikasi(p, tolak ? 'Permohonan Ditolak' : 'Permohonan Perlu Revisi',
    '<p>Permohonan izin pemanfaatan ruang milik jalan untuk ' + JENIS.objek + ' yang Anda ajukan ' +
    (tolak ? '<b>ditolak</b>.' : '<b>dikembalikan untuk direvisi</b>. Silakan perbaiki lalu ajukan kembali.') + '</p>' +
    '<p>Keterangan:<br/>' + tahapan.escHtml(keterangan).replace(/\n/g, '<br/>') + '</p>');
}

function kirimList(tahap, status) {
  return async function (req, res) {
    try {
      res.json({ status: 200, message: 'sukses', data: await tahapan.listTahap(tahap, status, JENIS.kode) });
    } catch (err) { gagal(res, err); }
  };
}

// Hanya untuk jenis dengan verifikasi awal (jaringan utilitas); reklame tidak punya tahap ini
if (JENIS.verifikasi_awal) {
// ---------------- Verifikasi provider & persyaratan ----------------
// Pemohon mengetik nama provider (provider_usulan) + upload dokumen persyaratan;
// admin memeriksa dokumen, memilihkan provider dari master, atau menolak keduanya sekaligus
router.get('/provider', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/provider/list', { user: getUser(req) });
});

router.post('/provider/list', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT p.permohonan_id, p.provider_usulan, p.provider_diusulkanAt, p.nama_pemohon,
              u.fullname AS nama_vendor, u.username AS username_vendor
         FROM permohonan p
         LEFT JOIN user u ON u.id_user = p.id_user
        WHERE p.deletedAt IS NULL AND p.status_provider = 'menunggu' AND p.jenis_izin = ?
        ORDER BY p.provider_diusulkanAt ASC`,
      [JENIS.kode]
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get('/provider/master', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(`SELECT provider_id, provider FROM provider WHERE deletedAt IS NULL ORDER BY provider ASC`);
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// Data pemohon + dokumen persyaratan untuk diperiksa di modal verifikasi
router.get('/provider/detail/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p) return gagal(res, 'Permohonan tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: {
      pemohon: { nama: p.nama_pemohon, jabatan: p.jabatan_pemohon, telp: p.telp_pemohon, email: p.email_pemohon },
      dokumen: await helper.getDokumen(p.permohonan_id, p.jenis_izin),
      jenis_dokumen: helper.jenisDokumen(JENIS.kode),
      dokumen_wajib: helper.dokumenWajib(JENIS.kode)
    } });
  } catch (err) { gagal(res, err); }
});

async function ambilUsulanProvider(req, res) {
  var p = await ambil(req.params.id);
  if (!p) { gagal(res, 'Permohonan tidak ditemukan', 404); return null; }
  if (p.status_provider !== 'menunggu') { gagal(res, 'Provider permohonan ini tidak sedang menunggu verifikasi', 400); return null; }
  return p;
}

// body: { provider_id } — reklame tanpa provider: hanya dokumen yang diverifikasi
router.post('/provider/verifikasi/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilUsulanProvider(req, res);
    if (!p) return;
    var provider_id = null;
    if (JENIS.pakai_provider) {
      var [prov] = await sql_enak.raw(`SELECT provider_id FROM provider WHERE provider_id = ? AND deletedAt IS NULL`, [req.body.provider_id || 0]);
      if (!prov.length) return gagal(res, 'Pilih provider terlebih dahulu', 400);
      provider_id = prov[0].provider_id;
    }
    await sql_enak.raw(
      `UPDATE permohonan SET provider_id = ?, status_provider = 'terverifikasi', keterangan_provider = NULL,
              provider_diverifikasiAt = NOW(), provider_diverifikasi_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [provider_id, getUser(req).id_user, p.permohonan_id]
    );
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// body: { keterangan } — pemohon bisa memperbaiki provider / dokumen lalu verifikasi lagi
router.post('/provider/tolak/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilUsulanProvider(req, res);
    if (!p) return;
    var keterangan = String(req.body.keterangan || '').trim().slice(0, 500);
    if (!keterangan) return gagal(res, 'Keterangan penolakan wajib diisi', 400);
    await sql_enak.raw(
      `UPDATE permohonan SET status_provider = 'ditolak', keterangan_provider = ?,
              provider_diverifikasiAt = NOW(), provider_diverifikasi_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [keterangan, getUser(req).id_user, p.permohonan_id]
    );
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});
}

// ---------------- Permohonan izin (verifikasi) ----------------
router.get('/permohonan', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/permohonan/list', { user: getUser(req) });
});

// Menunggu verifikasi + yang sedang dikembalikan ke vendor untuk revisi
router.post('/permohonan/list', cek_admin, kirimList('verifikasi', ['diajukan', 'revisi']));

router.get('/permohonan/verifikasi/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p || p.status === 'draft') return res.redirect(BASE + '/permohonan');
  res.render('content-backoffice/manajemen_perizinan/permohonan/verifikasi', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: KOMPONEN,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.jenisDokumen(JENIS.kode)
  });
});

// body: { status: diajukan | revisi | tolak | lolos, keterangan, no_surat_permohonan, tim_teknis: [id_user], penandatangan_id }
// lolos -> lanjut ke peninjauan lapangan (wajib no. surat permohonan, tim teknis & penandatangan);
// revisi -> kembali ke vendor (pengajuan ulang mulai dari verifikasi lagi); tolak -> permohonan ditolak.
// Semua hasil (lolos, revisi, tolak) dikirim email ke pemohon.
router.post('/permohonan/verifikasi/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    if (['diajukan', 'revisi', 'tolak', 'lolos'].indexOf(b.status) === -1) return gagal(res, 'Status verifikasi tidak dikenal', 400);
    if ((b.status === 'revisi' || b.status === 'tolak') && !b.keterangan) return gagal(res, 'Keterangan wajib diisi', 400);
    var tim = [].concat(b.tim_teknis || []).map(Number).filter(Boolean);
    var no_surat = String(b.no_surat_permohonan || '').trim();
    if (b.status === 'lolos') {
      var kurang = [];
      if (!no_surat) kurang.push('Nomor surat permohonan wajib diisi');
      if (!tim.length) kurang.push('Tim teknis wajib dipilih');
      var [ttd] = await sql_enak.raw(
        `SELECT penandatangan_id FROM master_penandatangan WHERE penandatangan_id = ? AND aktif = 1 AND deletedAt IS NULL`,
        [b.penandatangan_id || 0]
      );
      if (!ttd.length) kurang.push('Penandatangan wajib dipilih');
      if (kurang.length) return gagal(res, kurang.join('\n'), 400);
    }
    var p = await ambilTahap(req, res, 'verifikasi');
    if (!p) return;
    if (b.status === 'diajukan') return res.json({ status: 200, message: 'sukses', data: null });

    if (b.status === 'tolak') {
      await sql_enak.raw(
        `UPDATE permohonan
            SET status = 'ditolak', keterangan = ?, diverifikasiAt = NOW(), diverifikasi_oleh = ?,
                diprosesAt = NOW(), diproses_oleh = ?, lastUpdateAt = NOW()
          WHERE permohonan_id = ?`,
        [b.keterangan, getUser(req).id_user, getUser(req).id_user, p.permohonan_id]
      );
      notifikasiDikembalikan(p, 'ditolak', b.keterangan);
      return res.json({ status: 200, message: 'sukses', data: null });
    }

    await sql_enak.raw(
      `UPDATE permohonan
          SET status = ?, tahap = ?, keterangan = ?, diverifikasiAt = NOW(), diverifikasi_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [b.status === 'revisi' ? 'revisi' : 'diajukan',
       b.status === 'revisi' ? 'verifikasi' : 'peninjauan_lapangan',
       b.status === 'revisi' ? b.keterangan : null,
       getUser(req).id_user, p.permohonan_id]
    );
    if (b.status === 'revisi') {
      notifikasiDikembalikan(p, 'revisi', b.keterangan);
      return res.json({ status: 200, message: 'sukses', data: null });
    }

    // Lolos: simpan no. surat permohonan, penandatangan & tim teknis (dipakai di cetak BA / persetujuan prinsip)
    await sql_enak.raw(
      `UPDATE permohonan SET no_surat_permohonan = ?, penandatangan_id = ? WHERE permohonan_id = ?`,
      [no_surat, b.penandatangan_id, p.permohonan_id]
    );
    await sql_enak.raw(`DELETE FROM permohonan_tim_teknis WHERE permohonan_id = ?`, [p.permohonan_id]);
    await sql_enak('permohonan_tim_teknis').insert(tim.map(function (id) { return { permohonan_id: p.permohonan_id, id_user: id }; }));
    tahapan.kirimNotifikasi(p, 'Permohonan Lolos Verifikasi',
      '<p>Permohonan izin pemanfaatan ruang milik jalan untuk ' + JENIS.objek + ' yang Anda ajukan ' +
      'dengan surat Nomor <b>' + tahapan.escHtml(no_surat) + '</b> telah <b>disetujui</b> pada tahap verifikasi.</p>' +
      '<p>Permohonan dilanjutkan ke tahap Peninjauan Lapangan oleh tim teknis.</p>');
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// Hapus (soft delete) permohonan yang masih di tahap verifikasi
router.post('/permohonan/hapus/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p || p.tahap !== 'verifikasi' || ['diajukan', 'revisi'].indexOf(p.status) === -1) {
      return gagal(res, 'Hanya permohonan di tahap verifikasi yang bisa dihapus', 400);
    }
    await sql_enak.raw(`UPDATE permohonan SET deletedAt = NOW() WHERE permohonan_id = ?`, [p.permohonan_id]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// ---------------- Peninjauan lapangan (berita acara) ----------------
router.get('/peninjauan_lapangan', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/list', { user: getUser(req) });
});

router.post('/peninjauan_lapangan/list', cek_admin, kirimList('peninjauan_lapangan', ['diajukan']));

// Detail perizinan (peta, tabel ruas, pemohon, dokumen persyaratan) tanpa form verifikasi; data diambil via GET /data/:id
router.get('/peninjauan_lapangan/detail/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p || p.status === 'draft') return res.redirect(BASE + '/peninjauan_lapangan');
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/detail', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: KOMPONEN,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.jenisDokumen(JENIS.kode)
  });
});

router.get('/peninjauan_lapangan/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p) return gagal(res, 'Permohonan tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: { permohonan: p, peninjauan: await tahapan.getPeninjauan(p.permohonan_id) } });
  } catch (err) { gagal(res, err); }
});

// multipart: tim_teknis, no_ba, tanggal_ba, no_surat_permohonan, tanggal_surat_permohonan, hasil, kelayakan, foto (boleh banyak file, tanpa batas)
router.post('/peninjauan_lapangan/simpan/:id', cek_admin, tahapan.upload_foto, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_ba || !b.tanggal_ba) return gagal(res, 'Nomor & tanggal berita acara wajib diisi', 400);
    if (!tahapan.KELAYAKAN[b.kelayakan]) return gagal(res, 'Hasil peninjauan (layak / tidak layak) wajib dipilih', 400);
    await tahapan.simpanPeninjauan(p.permohonan_id, b, req.files, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.post('/peninjauan_lapangan/hapus_foto/:id/:urutan', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return;
    await tahapan.hapusFotoPeninjauan(p.permohonan_id, req.params.urutan);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/foto/:id/:urutan', cek_admin, async function (req, res) {
  try {
    var [rows] = await sql_enak.raw(
      `SELECT f.nama_file, f.nama_asli FROM permohonan_peninjauan_foto f
         JOIN permohonan_peninjauan pl ON pl.permohonan_peninjauan_id = f.permohonan_peninjauan_id
        WHERE pl.permohonan_id = ? AND f.urutan = ?`,
      [req.params.id, req.params.urutan]
    );
    if (!rows.length) return res.status(404).send('Foto tidak ditemukan');
    tahapan.kirimFile(res, rows[0].nama_file, rows[0].nama_asli, true);
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/cetak/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.peninjauan) return res.status(404).send('Draft berita acara belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/cetak', data);
});

// Upload BA bertanda tangan -> lanjut ke persetujuan prinsip (hanya jika hasil peninjauan layak) + email BA ke pemohon.
// Tidak layak -> tetap di tahap peninjauan lapangan untuk ditinjau ulang.
router.post('/peninjauan_lapangan/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File berita acara wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return tahapan.hapusFile(file.filename);
    var ba = await tahapan.getPeninjauan(p.permohonan_id);
    if (!ba || ba.kelayakan !== 'layak') {
      tahapan.hapusFile(file.filename);
      return gagal(res, ba ? 'Hasil peninjauan tidak layak, lakukan peninjauan ulang terlebih dahulu' : 'Buat draft berita acara terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('ba', p.permohonan_id, file);
    tahapan.kirimNotifikasi(p, 'Berita Acara Hasil Peninjauan Lapangan',
      '<p>Peninjauan lapangan atas permohonan Anda telah dilaksanakan dengan hasil <b>layak</b>. ' +
      'Berita Acara Nomor <b>' + tahapan.escHtml(ba.no_ba) + '</b> terlampir.</p>' +
      '<p>Permohonan dilanjutkan ke tahap Persetujuan Prinsip.</p>',
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/file/:id', cek_admin, async function (req, res) {
  try {
    var pl = await tahapan.getPeninjauan(req.params.id);
    if (!pl) return res.status(404).send('Berita acara tidak ditemukan');
    tahapan.kirimFile(res, pl.file_ba, pl.nama_asli_ba);
  } catch (err) { gagal(res, err); }
});

// ---------------- Persetujuan prinsip ----------------
router.get('/persetujuan_prinsip', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/list', { user: getUser(req), jaminan: tahapan.JAMINAN });
});

// Termasuk yang sudah upload persetujuan prinsip TTD dan menunggu verifikasi persyaratan
router.post('/persetujuan_prinsip/list', cek_admin, kirimList(['persetujuan_prinsip', 'verifikasi_persyaratan'], ['diajukan']));

// Detail perizinan (peta, tabel ruas, pemohon, dokumen persyaratan) tanpa form verifikasi; data diambil via GET /data/:id
router.get('/persetujuan_prinsip/detail/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p || p.status === 'draft') return res.redirect(BASE + '/persetujuan_prinsip');
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/detail', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: KOMPONEN,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.jenisDokumen(JENIS.kode)
  });
});

router.get('/persetujuan_prinsip/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p) return gagal(res, 'Permohonan tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: { permohonan: p, persetujuan: await tahapan.getPersetujuan(p.permohonan_id) } });
  } catch (err) { gagal(res, err); }
});

// body: { no_pp, tanggal_pp, no_skrd, persyaratan, <kolom jaminan> }
router.post('/persetujuan_prinsip/simpan/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'persetujuan_prinsip');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_pp || !b.tanggal_pp) return gagal(res, 'Nomor & tanggal persetujuan prinsip wajib diisi', 400);
    await tahapan.simpanPersetujuan(p.permohonan_id, b, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err, err.status); }
});

router.get('/persetujuan_prinsip/cetak/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.persetujuan) return res.status(404).send('Draft persetujuan prinsip belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/cetak', data);
});

// Upload persetujuan prinsip bertanda tangan -> lanjut ke verifikasi persyaratan + email berisi link
// untuk pemohon mengirim ZIP persyaratan. Verifikasi baru bisa dilakukan setelah ZIP dikirim.
router.post('/persetujuan_prinsip/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File persetujuan prinsip wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'persetujuan_prinsip');
    if (!p) return tahapan.hapusFile(file.filename);
    var pp = await tahapan.getPersetujuan(p.permohonan_id);
    if (!pp) {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Buat draft persetujuan prinsip terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('pp', p.permohonan_id, file);
    var link = tahapan.urlPersyaratan(req, p);
    tahapan.kirimNotifikasi(p, 'Persetujuan Prinsip',
      '<p>Persetujuan prinsip atas permohonan Anda telah terbit, dengan nomor <b>' + tahapan.escHtml(pp.no_pp) + '</b> (terlampir).</p>' +
      '<p>Persetujuan prinsip ini <b>&ldquo;BUKAN IZIN&rdquo;</b> dan pemohon dilarang melakukan kegiatan apapun sebelum ' +
      'Izin Pemanfaatan Ruang Milik Jalan Kota diterbitkan.</p>' +
      '<p>Silakan segera lengkapi persyaratan yang tertera pada persetujuan prinsip ini agar permohonan izin Anda dapat diproses lebih lanjut.</p>' +
      '<p>Lengkapi syarat persetujuan prinsip melalui link di bawah ini:<br/><a href="' + link + '">' + link + '</a></p>',
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// body: { lanjut: '1' | '0', keterangan }
// Lanjut -> penerbitan izin (menu Izin Pemanfaatan Rumija); tidak -> tetap menunggu, keterangan dikirim email ke pemohon
router.post('/persetujuan_prinsip/verifikasi_persyaratan/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    var lanjut = b.lanjut === '1';
    if (!lanjut && !b.keterangan) return gagal(res, 'Keterangan persyaratan yang belum dipenuhi wajib diisi', 400);
    var p = await ambilTahap(req, res, 'verifikasi_persyaratan');
    if (!p) return;
    var pp = await tahapan.getPersetujuan(p.permohonan_id);
    if (!pp || !pp.uploadPersyaratanAt) return gagal(res, 'Pemohon belum mengirim kelengkapan persyaratan', 400);
    await tahapan.simpanVerifikasiPersyaratan(p.permohonan_id, lanjut, b.keterangan, getUser(req).id_user);
    if (!lanjut) {
      var link = tahapan.urlPersyaratan(req, p);
      tahapan.kirimNotifikasi(p, 'Persyaratan Persetujuan Prinsip Belum Terpenuhi',
        '<p>Hasil verifikasi menunjukkan persyaratan persetujuan prinsip permohonan Anda <b>belum terpenuhi</b>.</p>' +
        '<p>Keterangan:<br/>' + tahapan.escHtml(b.keterangan).replace(/\n/g, '<br/>') + '</p>' +
        '<p>Mohon segera melengkapi dan mengirim ulang persyaratan tersebut melalui link di bawah ini:<br/>' +
        '<a href="' + link + '">' + link + '</a></p>');
    }
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/persetujuan_prinsip/file/:id', cek_admin, async function (req, res) {
  try {
    var pp = await tahapan.getPersetujuan(req.params.id);
    if (!pp) return res.status(404).send('Persetujuan prinsip tidak ditemukan');
    tahapan.kirimFile(res, pp.file_ttd, pp.nama_asli_ttd);
  } catch (err) { gagal(res, err); }
});

// ZIP kelengkapan persyaratan yang dikirim pemohon
router.get('/persetujuan_prinsip/persyaratan/:id', cek_admin, async function (req, res) {
  try {
    var pp = await tahapan.getPersetujuan(req.params.id);
    if (!pp || !pp.file_persyaratan) return res.status(404).send('Pemohon belum mengirim persyaratan');
    tahapan.kirimFile(res, pp.file_persyaratan, pp.nama_asli_persyaratan);
  } catch (err) { gagal(res, err); }
});

// ---------------- Penerbitan izin: perjanjian sewa (sebelum SK) ----------------
// body: { no_perjanjian, tanggal_perjanjian, isi }
router.post('/perjanjian_sewa/simpan/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'penerbitan_izin');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_perjanjian || !b.tanggal_perjanjian) return gagal(res, 'Nomor & tanggal perjanjian sewa wajib diisi', 400);
    await tahapan.simpanPerjanjianSewa(p.permohonan_id, b, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/perjanjian_sewa/cetak/:id', cek_admin, async function (req, res) {
  var p = await ambil(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.perjanjian_sewa) return res.status(404).send('Draft perjanjian sewa belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/perjanjian_sewa/cetak', data);
});

// Upload perjanjian sewa bertanda tangan; setelah itu SK bisa diterbitkan (proses setujui)
router.post('/perjanjian_sewa/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File perjanjian sewa wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'penerbitan_izin');
    if (!p) return tahapan.hapusFile(file.filename);
    if (!(await tahapan.getPerjanjianSewa(p.permohonan_id))) {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Buat draft perjanjian sewa terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('sewa', p.permohonan_id, file);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/perjanjian_sewa/file/:id', cek_admin, async function (req, res) {
  try {
    var ps = await tahapan.getPerjanjianSewa(req.params.id);
    if (!ps) return res.status(404).send('Perjanjian sewa tidak ditemukan');
    tahapan.kirimFile(res, ps.file_ttd, ps.nama_asli_ttd);
  } catch (err) { gagal(res, err); }
});

// ---------------- Penerbitan izin: upload izin (SK) bertanda tangan ----------------
// Hanya permohonan yang sudah disetujui (SK dibuat lewat /proses); izin terlampir dikirim email ke pemohon
router.post('/izin/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File izin wajib dipilih', 400);
    var p = await ambil(req.params.id);
    var draft = !!(p && p.status !== 'disetujui' && await draftSkSiap(p));
    if (!p || !(p.status === 'disetujui' || draft)) {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Izin hanya bisa diupload setelah data draft SK disimpan', 400);
    }
    // SK TTD dari draft yang belum disetujui: upload sekaligus menerbitkan izin (sama seperti "Simpan Draft SK")
    if (draft) await setujuiPermohonan(p, p.no_sk, p.tanggal_sk, p.keterangan, getUser(req).id_user);
    await tahapan.simpanTtd('sk', p.permohonan_id, file);
    tahapan.kirimNotifikasi(p, 'Izin Pemanfaatan Ruang Milik Jalan Telah Terbit',
      '<p>Izin pemanfaatan ruang milik jalan untuk ' + JENIS.objek + ' atas permohonan Anda <b>telah terbit</b> ' +
      'dengan Nomor <b>' + tahapan.escHtml(p.no_sk) + '</b>. Dokumen izin terlampir.</p>',
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/izin/file/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambil(req.params.id);
    if (!p) return res.status(404).send('Permohonan tidak ditemukan');
    tahapan.kirimFile(res, p.file_sk, p.nama_asli_sk);
  } catch (err) { gagal(res, err); }
});

return router;
}

module.exports = buatRouter('jaringan_utilitas');
module.exports.reklame = buatRouter('reklame');
