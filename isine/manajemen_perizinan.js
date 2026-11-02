var express = require('express');
var router = express.Router();
var passport = require('passport')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser');
var sql_enak = require('../database/mysql_enak.js').connection;
var helper = require('../helpper/permohonan.js');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

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
var BISA_DIPROSES = ['diajukan', 'disetujui', 'ditolak'];

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
    if (!v.length) return res.redirect('/manajemen_perizinan');
    var id = await helper.buatDraft(v[0], getUser(req).id_user);
    res.redirect('/manajemen_perizinan/edit/' + id);
  } catch (err) {
    console.log(err);
    res.redirect('/manajemen_perizinan');
  }
});

async function localsPengisian(p) {
  var [v] = await sql_enak.raw(`SELECT fullname, username FROM user WHERE id_user = ?`, [p.id_user]);
  return {
    permohonan: p,
    bisa_ubah: helper.bisaUbah(p),
    atas_nama: v[0] ? (v[0].fullname || v[0].username) : '-'
  };
}

router.get('/edit/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) return res.redirect('/manajemen_perizinan');
  var locals = await localsPengisian(p);
  locals.user = getUser(req);
  res.render('content-backoffice/manajemen_perizinan/edit', locals);
});

function viewDigitasi(jenis) {
  return async function (req, res) {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return res.redirect('/manajemen_perizinan');
    var [ruas] = await sql_enak.raw(
      `SELECT r.permohonan_ruas_id, r.ruas_id, mr.nm_ruas FROM permohonan_ruas r
         LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
        WHERE r.permohonan_ruas_id = ? AND r.permohonan_id = ? AND r.deletedAt IS NULL`,
      [req.params.id_ruas, p.permohonan_id]
    );
    if (!ruas.length) return res.redirect('/manajemen_perizinan/edit/' + p.permohonan_id);
    // Jalan Lain hanya punya titik dummy: peta tidak di-zoom ke sana
    if (ruas[0].nm_ruas === helper.NAMA_RUAS_LAIN) ruas[0].ruas_id = null;
    var locals = await localsPengisian(p);
    locals.user = getUser(req);
    locals.ruas = ruas[0];
    locals.jenis = jenis;
    res.render('content-backoffice/manajemen_perizinan/digitasi', locals);
  };
}
router.get('/tiang/:id/:id_ruas', cek_admin, viewDigitasi('tiang'));
router.get('/kabel/:id/:id_ruas', cek_admin, viewDigitasi('kabel'));

// Unduh rincian ruas & retribusi satu permohonan sebagai file Excel (.xlsx)
router.get('/export_excel/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return res.status(404).send('Permohonan tidak ditemukan');
    var wb = await helper.buatExcel(await helper.getDataSk(p));
    var nama = 'Permohonan_Izin_' + p.permohonan_id + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nama + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { gagal(res, err); }
});

router.get('/detail/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status === 'draft') return res.redirect('/manajemen_perizinan');
  res.render('content-backoffice/manajemen_perizinan/detail', { user: getUser(req), permohonan_id: p.permohonan_id });
});

// ---------------- API ----------------
// Draft hanya tampil jika difilter status 'draft' (draft vendor yang belum diajukan + isian admin)
router.post('/list', cek_admin, async function (req, res) {
  try {
    var sql = helper.SQL_REKAP;
    var val = [];
    if (req.body.status) { sql += ` AND p.status = ?`; val.push(req.body.status); }
    else sql += ` AND p.status <> 'draft'`;
    var [data] = await sql_enak.raw(sql + ` ORDER BY FIELD(p.status, 'diajukan') DESC, IFNULL(p.diajukanAt, p.insertedAt) DESC`, val);
    data.forEach(function (d) { d.bisa_ubah = helper.bisaUbah(d); });
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// Pilihan vendor saat admin mengisi permohonan atas nama vendor
router.get('/vendor', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT id_user, username, fullname FROM user WHERE is_admin = 3 AND deleted = 0 ORDER BY fullname ASC, username ASC`
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get('/cetak_sk/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status !== 'disetujui') return res.status(404).send('SK belum tersedia');
  res.render('content-backoffice/manajemen_perizinan/cetak_sk', await helper.getDataSk(p));
});

router.get('/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p || p.status === 'draft') return gagal(res, 'Permohonan tidak ditemukan', 404);
    var detail = await helper.getDetail(p);
    detail.digitasi = await helper.getDigitasi(p.permohonan_id);
    res.json({ status: 200, message: 'sukses', data: detail });
  } catch (err) { gagal(res, err); }
});

router.get('/dokumen/:id_dokumen', cek_admin, async function (req, res) {
  try {
    var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_dokumen WHERE permohonan_dokumen_id = ?`, [req.params.id_dokumen]);
    helper.kirimDokumen(res, rows[0]);
  } catch (err) { gagal(res, err); }
});

// body: { aksi: setujui | tolak | revisi, no_sk, tanggal_sk, keterangan }
router.post('/proses/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    var status = AKSI[b.aksi];
    if (!status) return gagal(res, 'Aksi tidak dikenal', 400);
    var p = await helper.getPermohonan(req.params.id);
    if (!p || BISA_DIPROSES.indexOf(p.status) === -1) return gagal(res, 'Permohonan tidak bisa diproses', 400);
    if (status === 'disetujui' && !b.no_sk) return gagal(res, 'No. SK wajib diisi', 400);
    if (status !== 'disetujui' && !b.keterangan) return gagal(res, 'Keterangan wajib diisi', 400);

    // Disetujui -> digitasi masuk ke tabel tiang & kabel; dicabut -> salinannya dihapus lagi
    var masuk = null;
    if (status === 'disetujui') masuk = await helper.salinKeDataUtama(p.permohonan_id);
    else if (p.status === 'disetujui') await helper.hapusDariDataUtama(p.permohonan_id);

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
    res.json({ status: 200, message: 'sukses', data: { masuk_data_utama: masuk } });
  } catch (err) { gagal(res, err); }
});

module.exports = router;
