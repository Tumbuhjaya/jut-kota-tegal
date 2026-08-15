var express = require('express')
  , http = require('http')
  , path = require('path')
  , logger = require('morgan')
  , bodyParser = require('body-parser')
  , methodOverride = require('method-override')
  , static = require('serve-static')
  , errorHandler = require('errorhandler')
  , passport = require('passport')
  , session = require('express-session')
  , cookieParser = require('cookie-parser')
  , flash = require("connect-flash")
  , LocalStrategy = require('passport-local').Strategy;
const fs = require('fs').promises; // Untuk membaca file secara asynchronous
const { Client } = require('pg'); // Driver PostgreSQL
var cors = require('cors')
var axios = require('axios');
var qs = require('qs');
var svgCaptcha = require('svg-captcha');
var email = require('./helpper/email.js').email;

var rooturl = ''
var login = require('./isine/login.js').router;
var peta = require('./isine/topojson.js');
var upload = require('./isine/upload_file.js');
// var upload_shp = require('./isine/upload_shp.js');
var fn = require('./isine/ckeditor-upload-image.js');
var upload_excel = require('./isine/upload_excel.js');
var cek_login = require('./isine/login.js').cek_login;
var cek_login_all = require('./isine/login.js').cek_login_all;

// FE
var basic = require('./isine/basic.js');
var peta_spasial = require('./isine/peta_spasial.js');

// BO
var manajemen_basic = require('./isine/manajemen_basic.js');
var manajemen_users = require('./isine/manajemen_users.js');

// API
var api = require('./isine/api.js');
var user = require('./isine/user.js');

var app = express();
var connection = require('./database/index.js').connection;
var sql_enak = require('./database/mysql_enak.js').connection;

var router = express.Router();
var dbgeo = require("dbgeo");
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');


// all environments
app.set('port', process.env.PORT || 1234);

app.use(cors({
  origin: 'http://localhost:8100' // or your Ionic frontend domain
}));
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type','token');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});
app.use(logger('dev'));
app.use(methodOverride());
app.use(static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser() );
app.use(session({duration: 50 * 60 * 1000,
                  activeDuration: 10 * 60 * 1000,
                  secret: 'bhagasitukeren', 
                  cookie: { maxAge : 60 * 60 * 1000 },
                  cookieName: 'session',
                  saveUninitialized: true,
                  resave: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());  
// Add headers

// development only
if ('development' == app.get('env')) {
  app.use(errorHandler());
}

// Tambahkan kode ini untuk inisialisasi Socket.IO
const server = http.createServer(app);

//mulai apps ----------------------------------------------------------
app.use('/autentifikasi', login);
app.use('/peta', peta);
app.use('/upload', upload);
// app.use('/upload_shp', upload_shp);
app.use('/uploadckeditor', fn);
app.use('/upload_excel', upload_excel);
// FE
app.use('/basic', basic);
app.use('/peta_spasial', peta_spasial);

// BO
app.use('/manajemen_basic', manajemen_basic);
app.use('/manajemen_users', manajemen_users);

// API
app.use('/user', user);
app.use('/api', api);

app.get('/backoffice', cek_login_all,async function (req, res) {
  res.render('content-backoffice/index',{user:req.user[0], });
});
app.get('/', function (req, res) {
  res.render('content/index')
});

app.get('/get_captcha',async function(req, res) {
  var captcha = svgCaptcha.createMathExpr({mathMin:1,mathMax:9,mathOperator:'+'});
  req.session.captcha = captcha.text;
  res.json(captcha)
})    

app.use(function (req, res, next) {
  res.render('page_not_found');
})
  


// Pastikan baris ini ada di paling bawah file Anda
server.listen(app.get('port'), () => {
  console.log('Express server listening on port ' + app.get('port'));
});