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

let table = 'vendor';

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

// Helper ambil id_user pemilik yang login
function getIdUser(req) {
  return (req.user && req.user[0] && req.user[0].id_user) ? req.user[0].id_user : null;
}

// Cek apakah perusahaan milik user yang login
async function cekPemilikPerusahaan(perusahaan_id, id_user) {
  if (!perusahaan_id || !id_user) return null;
  return await sql_enak('perusahaan')
    .where('perusahaan_id', perusahaan_id)
    .andWhere('id_user', id_user)
    .whereNull('deletedAt')
    .first();
}

// ---------------------------------------------
// VIEW (halaman)
// ---------------------------------------------
router.get('/:id', async function (req, res) {
  const id_user = getIdUser(req);
  const id = req.params.id;

  const perusahaan = await cekPemilikPerusahaan(id, id_user);

  if (!perusahaan) {
    return res.status(403).send('Perusahaan tidak ditemukan / bukan milik Anda');
  }

  res.render('backoffice/manajemen_vendor/index', {
    id: id,
    perusahaan: perusahaan
  });
});

// ---------------------------------------------
// API: dropdown user is_admin = 3 (untuk pilihan vendor)
// ---------------------------------------------
router.get('/list_users', async function (req, res) {
  try {
    const users = await sql_enak('user')
      .select('id_user', 'username', 'fullname')
      .where('is_admin', 3)
      .where(function () {
        this.whereNull('deleted').orWhere('deleted', 0);
      });

    res.status(200).json({ status: 200, message: "sukses", data: users });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: "gagal", data: err });
  }
});

// ---------------------------------------------
// INSERT VENDOR
// ---------------------------------------------
router.post('/insert', async function (req, res) {
  let post = req.body;
  const id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  const perusahaan_id = post.perusahaan_id;
  const cek = await cekPemilikPerusahaan(perusahaan_id, id_user);
  if (!cek) {
    return res.status(403).json({ status: 403, message: "Perusahaan bukan milik Anda", data: null });
  }

  // id_user pada vendor = user yang dipilih (is_admin=3). Kalau 0 => vendor perusahaan
  let id_user_vendor = post.id_user;
  if (!id_user_vendor || id_user_vendor === '0' || id_user_vendor === 0) {
    id_user_vendor = null; // null = pakai vendor perusahaan
  }

  // Cek duplikat: 1 vendor (perusahaan) cuma boleh muncul sekali untuk perusahaan yang sama
  const exists = await sql_enak(table)
    .where('perusahaan_id', perusahaan_id)
    .where(function () {
      if (id_user_vendor === null) {
        this.whereNull('id_user');
      } else {
        this.where('id_user', id_user_vendor);
      }
    })
    .whereNull('deletedAt')
    .first();

  if (exists) {
    return res.status(400).json({ status: 400, message: "Vendor sudah ditambahkan ke perusahaan ini", data: null });
  }

  const data = {
    perusahaan_id: perusahaan_id,
    id_user: id_user_vendor,
    insertedAt: new Date(),
    lastUpdateAt: new Date()
  };

  try {
    await sql_enak.insert(data).into(table).then(result => {
      res.status(200).json({ status: 200, message: "sukses", data: result });
    }).catch(err => {
      console.log(err, 'err');
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
  } catch (error) {
    res.status(500).json({ status: 500, message: "gagal", data: error });
  }
});

// ---------------------------------------------
// EDIT VENDOR
// ---------------------------------------------
router.post('/edit', async function (req, res) {
  let post = req.body;
  const id_user = getIdUser(req);

  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  const vendor_id = post.vendor_id;
  if (!vendor_id) {
    return res.status(400).json({ status: 400, message: "vendor_id wajib", data: null });
  }

  // Pastikan vendor ini milik perusahaan milik user
  const vendor = await sql_enak(table + ' as v')
    .join('perusahaan as p', 'p.perusahaan_id', 'v.perusahaan_id')
    .where('v.vendor_id', vendor_id)
    .andWhere('p.id_user', id_user)
    .whereNull('v.deletedAt')
    .select('v.*')
    .first();

  if (!vendor) {
    return res.status(404).json({ status: 404, message: "Data tidak ditemukan", data: null });
  }

  let id_user_vendor = post.id_user;
  if (!id_user_vendor || id_user_vendor === '0' || id_user_vendor === 0) {
    id_user_vendor = null;
  }

  const update = {
    id_user: id_user_vendor,
    lastUpdateAt: new Date()
  };

  try {
    await sql_enak(table).where('vendor_id', vendor_id).update(update).then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data });
    }).catch(err => {
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
  } catch (error) {
    res.status(500).json({ status: 500, message: "gagal", data: error });
  }
});

// ---------------------------------------------
// SOFT DELETE
// ---------------------------------------------
router.get('/hapus/:id', async function (req, res) {
  const id_user = getIdUser(req);
  if (!id_user) {
    return res.status(401).json({ status: 401, message: "Unauthorized", data: null });
  }

  // Pastikan vendor milik perusahaan milik user
  const vendor = await sql_enak(table + ' as v')
    .join('perusahaan as p', 'p.perusahaan_id', 'v.perusahaan_id')
    .where('v.vendor_id', req.params.id)
    .andWhere('p.id_user', id_user)
    .whereNull('v.deletedAt')
    .select('v.vendor_id')
    .first();

  if (!vendor) {
    return res.status(404).json({ status: 404, message: "Data tidak ditemukan", data: null });
  }

  try {
    await sql_enak(table)
      .where('vendor_id', req.params.id)
      .update({ deletedAt: new Date() })
      .then(data => {
        res.status(200).json({ status: 200, message: "sukses", data: data });
      })
      .catch(err => {
        res.status(500).json({ status: 500, message: "gagal", data: err });
      });
  } catch (error) {
    res.status(500).json({ status: 500, message: "gagal", data: error });
  }
});

// ---------------------------------------------
// LIST VENDOR (server-side DataTables)
// ---------------------------------------------
router.post('/list', async function (req, res) {
  try {
    const { start, length, search, order, columns, draw, perusahaan_id } = req.body;
    const id_user = getIdUser(req);

    if (!id_user) {
      return res.status(401).json({ status: 401, message: "Unauthorized", data: [] });
    }

    // Validasi kepemilikan perusahaan
    const cek = await cekPemilikPerusahaan(perusahaan_id, id_user);
    if (!cek) {
      return res.status(200).json({
        draw: parseInt(draw) || 0,
        recordsTotal: 0,
        recordsFiltered: 0,
        data: []
      });
    }

    let value = [perusahaan_id];
    let whereConditions = ['v.perusahaan_id = ?'];

    if (search && search.value) {
      const searchValue = `%${search.value}%`;
      whereConditions.push(`(u.fullname LIKE ? OR u.username LIKE ? OR 'Vendor Perusahaan' LIKE ?)`);
      value.push(searchValue, searchValue, searchValue);
    }

    let orderByClause = `ORDER BY v.insertedAt DESC`;
    if (order && columns && order.length) {
      const columnIndex = order[0].column;
      const columnName = columns[columnIndex].data;
      const sortDirection = order[0].dir === 'asc' ? 'ASC' : 'DESC';
      const allowed = ['vendor_id', 'vendor_name', 'insertedAt'];
      if (columnName === 'vendor_name') orderByClause = `ORDER BY vendor_name ${sortDirection}`;
      else if (allowed.includes(columnName)) orderByClause = `ORDER BY v.${columnName} ${sortDirection}`;
    }

    const whereSql = `WHERE ISNULL(v.deletedAt) AND ` + whereConditions.join(' AND ');

    // Total tanpa filter (hanya vendor milik perusahaan ini)
    const countSql = `SELECT COUNT(*) AS total FROM ${table} v WHERE ISNULL(v.deletedAt) AND v.perusahaan_id = ?`;
    const countResult = await sql_enak.raw(countSql, [perusahaan_id]);
    const recordsTotal = countResult[0][0].total;

    // Total setelah filter
    const countFilteredSql = `
      SELECT COUNT(*) AS total 
      FROM ${table} v 
      LEFT JOIN user u ON u.id_user = v.id_user
      ${whereSql}`;
    const countFilteredResult = await sql_enak.raw(countFilteredSql, value);
    const recordsFiltered = countFilteredResult[0][0].total;

    // Data
    let dataSql = `
      SELECT 
        v.vendor_id,
        v.perusahaan_id,
        v.id_user,
        CASE 
          WHEN v.id_user IS NULL OR v.id_user = 0 THEN 'Vendor Perusahaan'
          ELSE COALESCE(u.fullname, u.username, 'User #' + v.id_user)
        END AS vendor_name,
        u.username,
        u.fullname,
        DATE_FORMAT(v.insertedAt, '%d-%m-%Y') AS tanggal_dibuat,
        DATE_FORMAT(v.insertedAt, '%Y-%m-%d') AS tanggal_dibuat_2
      FROM ${table} v
      LEFT JOIN user u ON u.id_user = v.id_user
      ${whereSql}
      ${orderByClause}`;

    const dataValue = value.slice();
    if (start !== undefined && length !== undefined) {
      dataSql += ` LIMIT ?, ?`;
      dataValue.push(parseInt(start), parseInt(length));
    }

    const dataResult = await sql_enak.raw(dataSql, dataValue);
    const data = dataResult[0];

    res.status(200).json({
      draw: parseInt(draw) || 0,
      recordsTotal: recordsTotal,
      recordsFiltered: recordsFiltered,
      data: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, message: "gagal", data: err });
  }
});

module.exports = router;