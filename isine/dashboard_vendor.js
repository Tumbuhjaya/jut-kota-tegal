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

// Kemitraan aktif vendor dengan perusahaan yang dipilih saat login
async function cekKemitraan(user) {
  if (!user || !user.login_vendor_id) return null;
  const [rows] = await sql_enak.raw(
    `SELECT v.vendor_id, p.perusahaan_id, p.nama_perusahaan, p.alamat, p.no_telepon, p.email
       FROM vendor v
       JOIN perusahaan p ON p.perusahaan_id = v.perusahaan_id AND p.deletedAt IS NULL
       JOIN user u ON u.id_user = v.id_user AND u.deleted = 0
      WHERE v.vendor_id = ? AND v.id_user = ? AND v.deletedAt IS NULL
      LIMIT 1`,
    [user.login_vendor_id, user.id_user]
  );
  return rows[0] || null;
}

// Hanya vendor (is_admin = 3) yang masih bermitra dengan perusahaan saat login
async function cek_vendor(req, res, next) {
  const user = getUser(req);
  if (!req.isAuthenticated() || !user || Number(user.is_admin) !== 3) {
    return req.xhr ? res.status(403).json({ status: 403, message: 'Khusus akun vendor', data: null }) : res.redirect('/');
  }
  try {
    const mitra = await cekKemitraan(user);
    if (!mitra) {
      req.logout();
      req.flash('pesan', 'Kemitraan dengan perusahaan sudah berakhir. Silakan hubungi perusahaan terkait.');
      return req.xhr ? res.status(403).json({ status: 403, message: 'Kemitraan sudah berakhir', data: null }) : res.redirect('/');
    }
    req.mitra = mitra;
    next();
  } catch (err) {
    console.log(err);
    res.status(500).send('Terjadi kesalahan');
  }
}

// ---------------------------------------------
// VIEW
// ---------------------------------------------
router.get('/', cek_vendor, async function (req, res) {
  res.render('content/dashboard_vendor', { user: getUser(req), mitra: req.mitra });
});

// ---------------------------------------------
// Provider yang ditugaskan perusahaan ke kemitraan ini
// ---------------------------------------------
router.get('/provider', cek_vendor, async function (req, res) {
  try {
    const [data] = await sql_enak.raw(
      `SELECT pr.provider_id, pr.provider, pr.warna
         FROM perusahaan_provider pp
         JOIN provider pr ON pr.provider_id = pp.provider_id AND pr.deletedAt IS NULL
        WHERE pp.vendor_id = ? AND pp.deletedAt IS NULL
        ORDER BY pr.provider ASC`,
      [req.mitra.vendor_id]
    );
    res.status(200).json({ status: 200, message: 'sukses', data: data });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

module.exports = router;
module.exports.cek_vendor = cek_vendor;
