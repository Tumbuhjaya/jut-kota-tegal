var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , path = require('path')
  , sha1 = require('sha1');
var sql_enak = require('../database/mysql_enak.js').connection;
var cek_login = require('./login').cek_login;
var cek_login_google = require('./login').cek_login_google;
var dbgeo = require("dbgeo");
var multer = require("multer");
var st = require('knex-postgis')(sql_enak);

path.join(__dirname, '/public/foto')
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

router.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});

var storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'public/foto/') },
  filename:    function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname) }
});
var upload = multer({ storage: storage })

// ============================================================
// GET /  →  Data Kabel + Providers untuk modal assign
// ============================================================
router.get('/', async function (req, res) {
  try {
    const user = Array.isArray(req.user) ? req.user[0] : req.user
    let providers = []
    let isFiltered = false

    if (user) {
      const isAdmin = Number(user.is_admin)

      // is_admin = 2 → user perusahaan
      if (isAdmin === 2 && user.perusahaan_id) {
        providers = await sql_enak('provider')
          .select('provider_id', 'provider')
          .where('perusahaan_id', user.perusahaan_id)
          .whereNull('deletedAt')
          .orderBy('provider')
        isFiltered = true
      }
      // is_admin = 3 → user vendor
      else if (isAdmin === 3 && user.id_user) {
        providers = await sql_enak('perusahaan_provider as pp')
          .join('provider as p', 'p.provider_id', 'pp.provider_id')
          .select('p.provider_id', 'p.provider')
          .where('pp.vendor_id', user.id_user)
          .whereNull('pp.deletedAt')
          .whereNull('p.deletedAt')
          .orderBy('p.provider')
        isFiltered = true
      }
      // is_admin = 1 (admin) → semua provider
      else {
        providers = await sql_enak('provider')
          .select('provider_id', 'provider')
          .whereNull('deletedAt')
          .orderBy('provider')
      }
    } else {
      // belum login → tampilkan semua
      providers = await sql_enak('provider')
        .select('provider_id', 'provider')
        .whereNull('deletedAt')
        .orderBy('provider')
    }

    res.render('content/kabel', {
      user: user || null,
      providers: providers || [],
      isFiltered: isFiltered
    })
  } catch (error) {
    console.error('[GET / kabel] error:', error)
    res.render('content/kabel', {
      user: null,
      providers: [],
      isFiltered: false
    })
  }
})

module.exports = router;