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
router.get('/login', function(req, res) {
  res.render('content/login_pemohon'); 
});

router.get('/daftar_akun', function(req, res) {
  res.render('content/daftar_akun'); 
});

router.get('/shortcut', function(req, res) {
  res.render('content/shortcut_perizinan'); 
});


// JARINGAN UTILITAS
router.get('/jaringan_utilitas', function(req, res) {
  res.render('content/jaringan_utilitas/dashboard'); 
});

router.get('/jaringan_utilitas/insert', function(req, res) {
  res.render('content/jaringan_utilitas/insert'); 
});

router.get('/jaringan_utilitas/edit/:id', function(req, res) {
  res.render('content/jaringan_utilitas/edit'); 
});

router.get('/jaringan_utilitas/ruas_jalan/:id_permohonan', function(req, res) {
  res.render('content/jaringan_utilitas/ruas_jalan'); 
});

router.get('/jaringan_utilitas/ruas_jalan/tiang/:id_permohonan/:id_ruas_jalan', function(req, res) {
  res.render('content/jaringan_utilitas/tiang'); 
});

router.get('/jaringan_utilitas/ruas_jalan/kabel/:id_permohonan/:id_ruas_jalan', function(req, res) {
  res.render('content/jaringan_utilitas/kabel'); 
});

// router.get('/jaringan_utilitas/provider/:id_permohonan', function(req, res) {
//   res.render('content/jaringan_utilitas/provider'); 
// });

// router.get('/jaringan_utilitas/provider/insert/:id_permohonan', function(req, res) {
//   res.render('content/jaringan_utilitas/insert_provider'); 
// });

// router.get('/jaringan_utilitas/provider/edit/:id_permohonan/:id', function(req, res) {
//   res.render('content/jaringan_utilitas/edit_provider'); 
// });

// router.get('/jaringan_utilitas/ruas_jalan/:id_permohonan/:id_provider', function(req, res) {
//   res.render('content/jaringan_utilitas/ruas_jalan'); 
// });

// router.get('/jaringan_utilitas/ruas_jalan/insert/:id_permohonan/:id_provider', function(req, res) {
//   res.render('content/jaringan_utilitas/insert_ruas_jalan'); 
// });

// router.get('/jaringan_utilitas/ruas_jalan/edit/:id_permohonan/:id_provider/:id', function(req, res) {
//   res.render('content/jaringan_utilitas/edit_ruas_jalan'); 
// });

// router.get('/jaringan_utilitas/tiang/:id_permohonan/:id_provider/:id_ruas', function(req, res) {
//   res.render('content/jaringan_utilitas/tiang'); 
// });

// router.get('/jaringan_utilitas/tiang/insert/:id_permohonan/:id_provider/:id_ruas', function(req, res) {
//   res.render('content/jaringan_utilitas/insert_tiang'); 
// });

// router.get('/jaringan_utilitas/tiang/edit/:id_permohonan/:id_provider/:id_ruas/:id', function(req, res) {
//   res.render('content/jaringan_utilitas/edit_tiang'); 
// });

// router.get('/jaringan_utilitas/kabel/:id_permohonan/:id_provider/:id_ruas', function(req, res) {
//   res.render('content/jaringan_utilitas/kabel'); 
// });

// router.get('/jaringan_utilitas/kabel/insert/:id_permohonan/:id_provider/:id_ruas', function(req, res) {
//   res.render('content/jaringan_utilitas/insert_kabel'); 
// });

// router.get('/jaringan_utilitas/kabel/edit/:id_permohonan/:id_provider/:id_ruas/:id', function(req, res) {
//   res.render('content/jaringan_utilitas/edit_kabel'); 
// });
module.exports = router;
