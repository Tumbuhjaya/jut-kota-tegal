var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , path = require('path')
  ,  sha1 = require('sha1');
var sql_enak = require('../database/mysql_enak.js').connection;
var cek_login = require('./login').cek_login;
var cek_login_google = require('./login').cek_login_google;
var dbgeo = require("dbgeo");
var multer = require("multer");
var st = require('knex-postgis')(sql_enak);
path.join(__dirname, '/public/foto')
  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: true }));

  router.use(cookieParser() );
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});
// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/foto/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now()+'-'+file.originalname)
  }
})

var upload = multer({ storage: storage })

//start-------------------------------------
router.get('/', cek_login, async function (req, res) {
  try {
    const user = Array.isArray(req.user) ? req.user[0] : req.user
    let providers = []
    let isFiltered = false

    if (user) {
      const isAdmin = Number(user.is_admin)

      // ============================================================
      // is_admin = 2 → user terhubung ke perusahaan
      // ambil provider dari tabel provider via perusahaan_id
      // ============================================================
      if (isAdmin === 2 && user.perusahaan_id) {
        providers = await sql_enak('provider')
          .select('provider_id', 'provider')
          .where('perusahaan_id', user.perusahaan_id)
          .whereNull('deletedAt')
        isFiltered = true
      }

      // ============================================================
      // is_admin = 3 → user terhubung ke vendor
      // ambil provider lewat pivot perusahaan_provider
      // ============================================================
      else if (isAdmin === 3 && user.id_user) {
        providers = await sql_enak('perusahaan_provider as pp')
          .join('provider as p', 'p.provider_id', 'pp.provider_id')
          .select('p.provider_id', 'p.provider')
          .join('vendor as v', 'v.vendor_id', 'pp.vendor_id')
          .where('v.id_user', user.id_user)
          .where('v.vendor_id', user.login_vendor_id || 0)
          .whereNull('v.deletedAt')
          .whereNull('pp.deletedAt')
          .whereNull('p.deletedAt')
        isFiltered = true
      }
    }
console.log(providers);

    res.render('content/tiang', {
      user: user || null,
      providers: providers || [],
      isFiltered: isFiltered
    })
  } catch (error) {
    console.error('[GET / tiang] error:', error)
    res.render('content/tiang', {
      user: null,
      providers: [],
      isFiltered: false
    })
  }
})
module.exports = router;
