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

let table = 'provider';

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

//start-------------------------------------

router.post('/insert', async function(req, res) {
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

router.post('/edit', async function(req, res) {
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

router.get('/hapus/:id', async function(req, res) {
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

router.post('/list', async function(req, res) {
  try {
    const {
      start,
      length,
      search,
      order,
      columns,
      draw,
      provider_id,
      perusahaan_id
    } = req.body;

    let value = [];
    let whereConditions = [];
    let sql_tambahan = '';

    // Penanganan Pencarian (Search)
    if (search && search.value) {
      const searchValue = `%${search.value}%`;
      whereConditions.push(`( p.${table} LIKE ? )`);
      value.push(searchValue);
    }

    // Filter provider_id
    if (provider_id) {
      whereConditions.push(`p.provider_id = ?`);
      value.push(provider_id);
    }

    // Filter perusahaan_id
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
      orderByClause = `ORDER BY p.insertedAt DESC`;
    }

    // Menghitung Total Records (tanpa filter)
    let countSql = `SELECT COUNT(*) AS total FROM ${table} p ${sql_tambahan} WHERE ISNULL(p.deletedAt)`;
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
    let dataSql = `SELECT *, p.${table}_id as ${table}_id,
      DATE_FORMAT(p.insertedAt, '%d-%m-%Y') as tanggal_dibuat,
      DATE_FORMAT(p.insertedAt, '%Y-%m-%d') as tanggal_dibuat_2 
      FROM ${table} p ${sql_tambahan} WHERE ISNULL(p.deletedAt)`;

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

    console.log(dataSql, value, data, start, length);

    // Mengirim Respons JSON ke DataTables
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