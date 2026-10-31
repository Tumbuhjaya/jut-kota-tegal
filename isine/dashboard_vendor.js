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

function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

// Hanya vendor (is_admin = 3) yang akunnya masih aktif.
// Vendor tidak lagi terikat ke perusahaan, jadi tidak ada cek kemitraan.
async function cek_vendor(req, res, next) {
  const user = getUser(req);
  if (!req.isAuthenticated() || !user || Number(user.is_admin) !== 3) {
    return req.xhr ? res.status(403).json({ status: 403, message: 'Khusus akun vendor', data: null }) : res.redirect('/');
  }
  try {
    const [rows] = await sql_enak.raw(`SELECT id_user FROM user WHERE id_user = ? AND deleted = 0 LIMIT 1`, [user.id_user]);
    if (!rows.length) {
      req.logout();
      req.flash('pesan', 'Akun vendor sudah tidak aktif.');
      return req.xhr ? res.status(403).json({ status: 403, message: 'Akun tidak aktif', data: null }) : res.redirect('/');
    }
    next();
  } catch (err) {
    console.log(err);
    res.status(500).send('Terjadi kesalahan');
  }
}

// ---------------------------------------------
// VIEW
// ---------------------------------------------
router.get('/', cek_vendor, function (req, res) {
  res.redirect('/perizinan/jaringan_utilitas');
});

// ---------------------------------------------
// Semua provider aktif (vendor bebas memilih provider)
// ---------------------------------------------
router.get('/provider', cek_vendor, async function (req, res) {
  try {
    const [data] = await sql_enak.raw(
      `SELECT provider_id, provider, warna FROM provider WHERE deletedAt IS NULL ORDER BY provider ASC`
    );
    res.status(200).json({ status: 200, message: 'sukses', data: data });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

module.exports = router;
module.exports.cek_vendor = cek_vendor;
