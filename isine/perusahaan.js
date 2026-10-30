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
var deasync = require('deasync');

path.join(__dirname, '/public/foto');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

let table = 'perusahaan';

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
  destination: function (req, file, cb) {
    cb(null, 'public/foto/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Hanya file .jpg / .jpeg yang diizinkan!'), false);
  }
};
var upload = multer({ storage: storage, fileFilter: fileFilter });

// Helper: ambil id_user dari req.user
function getIdUser(req) {
  console.log( req.user[0]);
  
  return (req.user && req.user[0] && req.user[0].id_user) ? req.user[0].id_user : null;
}

// ---------------------------------------------
// INSERT
// ---------------------------------------------
router.post('/insert', async function (req, res) {
  let post = req.body;
  let id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  post.id_user     = id_user;
  post.insertedAt  = new Date();
  post.lastUpdateAt = new Date();

  await sql_enak.insert(post).into(table)
    .then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data });
    })
    .catch(err => {
      console.log(err, 'err');
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
});

// ---------------------------------------------
// EDIT
// ---------------------------------------------
router.post('/edit', async function (req, res) {
  let post = req.body;
  let id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  post.lastUpdateAt = new Date();
  delete post.id_user; // id_user tidak boleh diubah

  await sql_enak(table)
    .where(table + '_id', '=', post[table + '_id'])
    .andWhere('id_user', '=', id_user)
    .whereNull('deletedAt')
    .update(post)
    .then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data });
    })
    .catch(err => {
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
});

// ---------------------------------------------
// SOFT DELETE
// ---------------------------------------------
router.get('/hapus/:id', async function (req, res) {
  let id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  await sql_enak(table)
    .where(table + '_id', '=', req.params.id)
    .andWhere('id_user', '=', id_user)
    .whereNull('deletedAt')
    .update({ deletedAt: new Date() })
    .then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data });
    })
    .catch(err => {
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
});

// ---------------------------------------------
// LIST (POST)
// ---------------------------------------------
router.post('/list', async function (req, res) {
  let { id, limit, offset, count } = req.body;
  let id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: [] });
  }

  let value = [0, id_user];
  let str = ` and p.${table}_id > ? and p.id_user = ? `;
  let a = ` p.*, DATE_FORMAT(p.insertedAt,'%d-%m-%Y') as tanggal,
            DATE_FORMAT(p.insertedAt,'%Y-%m-%d') as tanggal_2 `;

  if (id) {
    str += ` and p.${table}_id = ?`;
    value.push(id);
  }
  if (count) {
    a = ` count(*) as jml `;
  }
  str += ' ORDER BY p.nama_perusahaan ASC ';

  if (limit)  { str += ` limit ? `;  value.push(limit); }
  if (offset) { str += ` offset ? `; value.push(offset); }

  let sql = `SELECT ${a} FROM ${table} p WHERE ISNULL(p.deletedAt) ` + str;
  console.log(sql, value, 'sql,value');

  await sql_enak.raw(sql, value)
    .then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data[0] });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
});

// ---------------------------------------------
// LIST (GET)
// ---------------------------------------------
router.get('/list', async function (req, res) {
  let id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: [] });
  }

  let value = [0, id_user];
  let str = ` and p.${table}_id > ? and p.id_user = ? `;
  let a = ` p.*, DATE_FORMAT(p.insertedAt,'%d-%m-%Y') as tanggal,
            DATE_FORMAT(p.insertedAt,'%Y-%m-%d') as tanggal_2 `;

  if (req.query.id) {
    str += ` and p.${table}_id = ?`;
    value.push(req.query.id);
  }
  str += ' ORDER BY p.nama_perusahaan ASC ';

  if (req.query.limit)  { str += ` limit ? `;  value.push(req.query.limit); }
  if (req.query.offset) { str += ` offset ? `; value.push(req.query.offset); }

  let sql = `SELECT ${a} FROM ${table} p WHERE ISNULL(p.deletedAt) ` + str;

  await sql_enak.raw(sql, value)
    .then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data[0] });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
});

module.exports = router;