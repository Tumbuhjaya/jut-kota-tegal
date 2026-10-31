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
var upload_shp = require('./isine/upload_shp.js');
var fn = require('./isine/ckeditor-upload-image.js');
var upload_excel = require('./isine/upload_excel.js');
var cek_login = require('./isine/login.js').cek_login;
var cek_login_all = require('./isine/login.js').cek_login_all;

// FE
var basic = require('./isine/basic.js');
var login_user = require('./isine/login_user.js');
var perizinan = require('./isine/perizinan.js');
var shortcut = require('./isine/shortcut.js');
var tiang = require('./isine/tiang.js');
var kabel = require('./isine/kabel.js');
var tidak_teridentifikasi = require('./isine/tidak_teridentifikasi.js');
var peta_spasial = require('./isine/peta_spasial.js');

// BO
var manajemen_basic = require('./isine/manajemen_basic.js');
var manajemen_master = require('./isine/manajemen_master.js');
var manajemen_tiang = require('./isine/manajemen_tiang.js');
var manajemen_kabel = require('./isine/manajemen_kabel.js');
var manajemen_laporan = require('./isine/manajemen_laporan.js');
var manajemen_tidak_teridentifikasi = require('./isine/manajemen_tidak_teridentifikasi.js');
var manajemen_users = require('./isine/manajemen_users.js');

// API
var api = require('./isine/api.js');
var user = require('./isine/user.js');
var provider = require('./isine/provider.js');
var perusahaan = require('./isine/perusahaan.js');
var perusahaan_provider = require('./isine/perusahaan_provider.js');

var vendor = require('./isine/vendor.js');
var dashboard_perusahaan = require('./isine/dashboard_perusahaan.js');
var dashboard_vendor = require('./isine/dashboard_vendor.js');

var app = express();
var connection = require('./database/index.js').connection;
var sql_enak = require('./database/mysql_enak.js').connection;

var router = express.Router();
var dbgeo = require("dbgeo");
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');


// all environments
app.set('port', process.env.PORT || 8941);

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
app.use('/upload_shp', upload_shp);
app.use('/uploadckeditor', fn);
app.use('/upload_excel', upload_excel);
// FE
app.use('/basic', basic);
app.use('/login_user', login_user);
app.use('/perizinan', perizinan);
app.use('/shortcut', shortcut);
app.use('/tiang', tiang);
app.use('/kabel', kabel);
app.use('/tidak_teridentifikasi', tidak_teridentifikasi);
app.use('/peta_spasial', peta_spasial);

// BO
app.use('/manajemen_basic', manajemen_basic);
app.use('/manajemen_master', manajemen_master);
app.use('/manajemen_tiang', manajemen_tiang);
app.use('/manajemen_kabel', manajemen_kabel);
app.use('/manajemen_laporan', manajemen_laporan);
app.use('/manajemen_tidak_teridentifikasi', manajemen_tidak_teridentifikasi);
app.use('/manajemen_users', manajemen_users);

// API
app.use('/user', user);
app.use('/api', api);
app.use('/provider', provider);
app.use('/perusahaan', perusahaan);
app.use('/perusahaan_provider', perusahaan_provider);
app.use('/vendor', vendor);
app.use('/dashboard_perusahaan', dashboard_perusahaan);
app.use('/dashboard_vendor', dashboard_vendor);


app.get('/backoffice', cek_login_all,async function (req, res) {
  if (req.user && req.user[0] && Number(req.user[0].is_admin) === 2) {
    return res.redirect('/dashboard_perusahaan');
  }
  res.render('content-backoffice/index',{user:req.user[0], });
});
app.get('/', function (req, res) {
   var captcha = svgCaptcha.createMathExpr({mathMin:1,mathMax:9,mathOperator:'+'});
    req.session.captcha = captcha.text;
  res.render('content/login_user', {captcha, pesan: req.flash('pesan')})
});

app.get('/beranda', function (req, res) {
  res.render('content/index')
});

app.get('/dis/:d/:t',async function (req, res) {
  let [data] = await sql_enak.raw(`SELECT DISTINCT ${req.params.d} FROM ${req.params.t} where deletedAt is null;`)
  res.json({data})
});
app.get('/get_kec',async function (req, res) {
  let [data] = await sql_enak.raw(`SELECT id_kec, kecamatan, kec_id
FROM kecamatan;`)
  res.json({data})
});
app.get('/get_kel/:id',async function (req, res) {
  let [data] = await sql_enak.raw(`SELECT id, kecamatan, desa, kec_id, kel_id
FROM kelurahan where kec_id = ?;`,[req.params.id])
  res.json({data})
});// ============================================================
// API: Update & export password user is_admin = 2 -> file .txt
// GET /api/reset-password-admin2
// ============================================================
app.get('/api/reset-password-admin2', cek_login_all, async function (req, res) {
  try {
    // ---------- 1) DIAGNOSA ----------
    const [diag] = await sql_enak.raw(`
      SELECT
        (SELECT COUNT(*) FROM user) AS total_users,
        (SELECT COUNT(*) FROM user WHERE CAST(is_admin AS CHAR) = '2') AS total_admin2_any,
        (SELECT COUNT(*) FROM user
           WHERE CAST(is_admin AS CHAR) = '2'
             AND (deleted IS NULL OR CAST(deleted AS CHAR) IN ('0','','false'))
        ) AS total_admin2_active,
        (SELECT GROUP_CONCAT(DISTINCT is_admin) FROM user) AS distinct_is_admin,
        (SELECT GROUP_CONCAT(DISTINCT CAST(deleted AS CHAR)) FROM user) AS distinct_deleted
    `);
    console.log('DIAGNOSA reset-password-admin2:', diag);

    // Filter aman: is_admin bisa int atau string, deleted bisa 0/NULL/''
    const whereSafe = `
      CAST(is_admin AS CHAR) = '2'
      AND (deleted IS NULL OR CAST(deleted AS CHAR) IN ('0','','false'))
    `;

    // ---------- 2) UPDATE pwd ----------
    const [updateResult] = await sql_enak.raw(`
      UPDATE user
      SET pwd = SHA(
        CONCAT(
          UPPER(SUBSTRING(username, 1, 1)),
          LOWER(SUBSTRING(username, FLOOR((CHAR_LENGTH(username) + 1) / 2), 1)),
          UPPER(SUBSTRING(username, CHAR_LENGTH(username), 1)),
          IFNULL(id_user, ''),
          '*'
        )
      ),
      updated = NOW()
      WHERE ${whereSafe}
    `);
    console.log('UPDATE result:', updateResult);

    // ---------- 3) SELECT untuk file txt ----------
    const [rows] = await sql_enak.raw(`
      SELECT
        username,
        CONCAT(
          UPPER(SUBSTRING(username, 1, 1)),
          LOWER(SUBSTRING(username, FLOOR((CHAR_LENGTH(username) + 1) / 2), 1)),
          UPPER(SUBSTRING(username, CHAR_LENGTH(username), 1)),
          IFNULL(id_user, ''),
          '*'
        ) AS password
      FROM user
      WHERE ${whereSafe}
      ORDER BY username ASC
    `);

    // ---------- 4) Susun isi file ----------
    let content;
    if (!rows || rows.length === 0) {
      content =
        'TIDAK ADA USER DENGAN is_admin = 2 (setelah filter aktif)\n' +
        '=========================================================\n\n' +
        'DIAGNOSA:\n' +
        JSON.stringify(diag, null, 2) + '\n\n' +
        'Kemungkinan penyebab:\n' +
        '1. Tidak ada user dengan is_admin = 2.\n' +
        '2. Nilai is_admin berbeda (lihat distinct_is_admin).\n' +
        '3. Kolom deleted bernilai selain NULL/0/"" (lihat distinct_deleted).\n\n' +
        'Jika distinct_is_admin menampilkan "2" tapi hasil masih kosong,\n' +
        'cek distinct_deleted — hapus filter deleted di WHERE bila perlu.\n\n' +
        'UPDATE result: ' + JSON.stringify(updateResult) + '\n';
    } else {
      content = JSON.stringify(rows, null, 2);
    }

    // ---------- 5) Kirim sebagai file .txt ----------
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="password_admin2.txt"'
    );
    res.send(content);
  } catch (err) {
    console.error('reset-password-admin2 error:', err);
    res.status(500).json({ error: err.message });
  }
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