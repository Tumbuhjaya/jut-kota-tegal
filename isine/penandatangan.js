var express = require('express');
var router = express.Router();
var passport = require('passport')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser');
var sql_enak = require('../database/mysql_enak.js').connection;

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

// ============================================================
// API MASTER PENANDATANGAN DOKUMEN PERIZINAN
// Halaman: /manajemen_master/penandatangan. Penandatangan aktif dipilih admin saat verifikasi permohonan izin,
// lalu dipakai di cetak BA peninjauan lapangan, persetujuan prinsip & SK.
// ============================================================
function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

// Hanya administrator (is_admin = 1)
function cek_admin(req, res, next) {
  var user = getUser(req);
  if (req.isAuthenticated() && user && Number(user.is_admin) === 1) return next();
  res.status(403).json({ status: 403, message: 'Khusus administrator', data: null });
}

function gagal(res, err, status) {
  if (err) console.log(err);
  res.status(status || 500).json({ status: status || 500, message: (err && err.message) || err || 'gagal', data: null });
}

// body: { nama, nip, jabatan, pangkat, aktif } -> { data, kurang }
function bacaForm(b) {
  var data = {
    nama: String(b.nama || '').trim(),
    nip: String(b.nip || '').trim(),
    jabatan: String(b.jabatan || '').trim(),
    pangkat: String(b.pangkat || '').trim() || null,
    aktif: b.aktif == null || Number(b.aktif) ? 1 : 0
  };
  var kurang = [];
  if (!data.nama) kurang.push('Nama wajib diisi');
  if (!/^[0-9 ]{1,30}$/.test(data.nip)) kurang.push('NIP wajib diisi (angka)');
  if (!data.jabatan) kurang.push('Jabatan wajib diisi');
  return { data: data, kurang: kurang };
}

// ?penandatangan_id= -> satu data; ?aktif=1 -> hanya yang aktif (pilihan saat verifikasi permohonan)
router.get('/list', cek_admin, async function (req, res) {
  try {
    var sql = `SELECT penandatangan_id, nama, nip, jabatan, pangkat, aktif FROM master_penandatangan WHERE deletedAt IS NULL`;
    var val = [];
    if (req.query.penandatangan_id) { sql += ` AND penandatangan_id = ?`; val.push(req.query.penandatangan_id); }
    if (req.query.aktif) sql += ` AND aktif = 1`;
    var [data] = await sql_enak.raw(sql + ` ORDER BY aktif DESC, nama ASC`, val);
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.post('/insert', cek_admin, async function (req, res) {
  try {
    var f = bacaForm(req.body || {});
    if (f.kurang.length) return gagal(res, f.kurang.join('\n'), 400);
    f.data.insertedAt = new Date();
    f.data.lastUpdateAt = new Date();
    var [id] = await sql_enak('master_penandatangan').insert(f.data);
    res.json({ status: 200, message: 'sukses', data: { penandatangan_id: id } });
  } catch (err) { gagal(res, err); }
});

router.post('/edit/:id', cek_admin, async function (req, res) {
  try {
    var f = bacaForm(req.body || {});
    if (f.kurang.length) return gagal(res, f.kurang.join('\n'), 400);
    f.data.lastUpdateAt = new Date();
    var n = await sql_enak('master_penandatangan').where('penandatangan_id', req.params.id).whereNull('deletedAt').update(f.data);
    if (!n) return gagal(res, 'Data tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// Soft delete: dokumen yang sudah dicetak tetap menampilkan penandatangannya
router.post('/hapus/:id', cek_admin, async function (req, res) {
  try {
    await sql_enak.raw(`UPDATE master_penandatangan SET deletedAt = NOW() WHERE penandatangan_id = ?`, [req.params.id]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

module.exports = router;
