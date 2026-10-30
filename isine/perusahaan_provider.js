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
var st = require('knex-postgis')(sql_enak);
var deasync = require('deasync');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

let table = 'perusahaan_provider';

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

//start-------------------------------------

router.post('/insert', async function (req, res) {
  let post = req.body;
  post.insertedAt = new Date();
  post.lastUpdateAt = new Date();

  try {
    await sql_enak.insert(post).into(table).then(data => {
      res.status(200).json({ status: 200, message: "sukses", data: data });
    }).catch(err => {
      console.log(err, 'err');
      res.status(500).json({ status: 500, message: "gagal", data: err });
    });
  } catch (error) {
    res.status(500).json({ status: 500, message: "gagal", data: error });
  }
});

router.post('/edit', async function (req, res) {
  let post = req.body;
  post.lastUpdateAt = new Date();

  try {
    await sql_enak(table)
      .where(table + '_id', '=', post[table + '_id'])
      .update(post)
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

router.get('/hapus/:id', async function (req, res) {
  try {
    await sql_enak(table)
      .where(table + '_id', '=', req.params.id)
      .update({ deletedAt: new Date() })
      .then(data => {
        res.status(200).json({ status: 200, message: "sukses", data: data[0] });
      })
      .catch(err => {
        res.status(500).json({ status: 500, message: "gagal", data: err });
      });
  } catch (error) {
    res.status(500).json({ status: 500, message: "gagal", data: error });
  }
});

router.post('/list', async function (req, res) {
  try {
    const {
      start,
      length,
      search,
      order,
      columns,
      draw,
      provider_id,
      vendor_id,
      perusahaan_id
    } = req.body;

    let value = [];
    let whereConditions = [];
    let sql_tambahan = '';

    // Penanganan Pencarian (Search) — cari di nama provider & nama vendor (user)
    if (search && search.value) {
      const searchValue = `%${search.value}%`;
      whereConditions.push(`( p.provider LIKE ? OR u.fullname LIKE ? OR u.username LIKE ? )`);
      value.push(searchValue, searchValue, searchValue);
    }

    // Filter provider_id
    if (provider_id) {
      whereConditions.push(`pv.provider_id = ?`);
      value.push(provider_id);
    }

    // Filter vendor_id
    if (vendor_id) {
      whereConditions.push(`pv.vendor_id = ?`);
      value.push(vendor_id);
    }

    // Filter perusahaan_id (lewat provider karena provider punya perusahaan_id)
    if (perusahaan_id) {
      whereConditions.push(`p.perusahaan_id = ?`);
      value.push(perusahaan_id);
    }

    // Penanganan Pengurutan (Order)
    let orderByClause = '';
    if (order && columns) {
      const columnIndex = order[0].column;
      const columnName = columns[columnIndex].data;
      const sortDirection = order[0].dir;
      orderByClause = columnName ? `ORDER BY ${columnName} ${sortDirection}` : '';
    } else {
      orderByClause = `ORDER BY pv.insertedAt DESC`;
    }

    // Base FROM + JOIN (dipakai count & data)
    const baseFrom = `
      FROM ${table} pv
      LEFT JOIN provider p ON p.provider_id = pv.provider_id
      LEFT JOIN vendor v   ON v.vendor_id   = pv.vendor_id
      LEFT JOIN user u     ON u.id_user     = v.id_user
    `;

    // Menghitung Total Records (tanpa filter)
    let countSql = `SELECT COUNT(*) AS total ${baseFrom} WHERE ISNULL(pv.deletedAt)`;
    let countResult = await sql_enak.raw(countSql);
    const recordsTotal = countResult[0][0].total;

    // Menghitung Total Records (setelah filter)
    let countFilteredSql = countSql;
    if (whereConditions.length > 0) {
      countFilteredSql += ` AND ` + whereConditions.join(' AND ');
    }
    let countFilteredResult = await sql_enak.raw(countFilteredSql, value);
    const recordsFiltered = countFilteredResult[0][0].total;

    // Mendapatkan Data untuk Halaman Saat Ini
    let dataSql = `SELECT pv.*, pv.${table}_id as ${table}_id,
      p.provider AS nama_provider,
      COALESCE(u.fullname, u.username) AS nama_vendor,
      DATE_FORMAT(pv.insertedAt, '%d-%m-%Y') as tanggal_dibuat,
      DATE_FORMAT(pv.insertedAt, '%Y-%m-%d') as tanggal_dibuat_2 
      ${baseFrom}
      WHERE ISNULL(pv.deletedAt)`;

    if (whereConditions.length > 0) {
      dataSql += ` AND ` + whereConditions.join(' AND ');
    }

    if (start && length) {
      if (start != 0 && length != 0) {
        dataSql += ` ${orderByClause} LIMIT ?, ?`;
        value.push(parseInt(start), parseInt(length));
      }
    }

    let dataResult = await sql_enak.raw(dataSql, value);
    const data = dataResult[0];

    res.status(200).json({
      draw: parseInt(draw),
      recordsTotal: recordsTotal,
      recordsFiltered: recordsFiltered,
      data: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: 500,
      message: "gagal",
      data: err
    });
  }
});

module.exports = router;