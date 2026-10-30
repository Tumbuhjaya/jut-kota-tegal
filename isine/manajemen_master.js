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
  var cek_login_all = require('./login').cek_login_all;

  var dbgeo = require("dbgeo");
  var multer = require("multer");
  var st = require('knex-postgis')(sql_enak);
  var deasync = require('deasync');
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
router.get('/perusahaan', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perusahaan/list'); 
});

router.get('/perusahaan/insert', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perusahaan/insert'); 
});

router.get('/perusahaan/edit/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perusahaan/edit',{id:req.params.id}); 
});

router.get('/provider', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_provider/list'); 
});

router.get('/provider/insert', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_provider/insert'); 
});

router.get('/provider/edit/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_provider/edit',{id:req.params.id}); 
});

router.get('/perusahaan_provider', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perprov/list'); 
});

router.get('/perusahaan_provider/insert', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perprov/insert'); 
});

router.get('/perusahaan_provider/edit/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_ms_perprov/edit',{id:req.params.id}); 
});

module.exports = router;
