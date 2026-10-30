var express = require('express');
var router = express.Router();
var passport = require('passport')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser')
  , sha1 = require('sha1');
var sql_enak = require('../database/mysql_enak.js').connection;

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

// ---------------------------------------------
// Helper
// ---------------------------------------------
function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

// Hanya akun perusahaan (is_admin = 2)
function cek_perusahaan(req, res, next) {
  const user = getUser(req);
  if (req.isAuthenticated() && user && Number(user.is_admin) === 2) {
    return next();
  }
  if (req.method === 'GET' && req.accepts('html') && !req.xhr) {
    return res.redirect('/');
  }
  res.status(403).json({ status: 403, message: 'Khusus akun perusahaan', data: null });
}

// Perusahaan milik user yang login
async function cekPemilikPerusahaan(perusahaan_id, id_user) {
  if (!perusahaan_id || !id_user) return null;
  const [rows] = await sql_enak.raw(
    `SELECT * FROM perusahaan WHERE perusahaan_id = ? AND id_user = ? AND deletedAt IS NULL LIMIT 1`,
    [perusahaan_id, id_user]
  );
  return rows[0] || null;
}

// Vendor boleh dilihat perusahaan ini: outsource, atau internal milik perusahaan ini
async function cekVendorTerlihat(id_vendor, perusahaan_id) {
  const [rows] = await sql_enak.raw(
    `SELECT * FROM user
      WHERE id_user = ? AND is_admin = 3 AND deleted = 0
        AND (jenis_vendor IS NULL OR jenis_vendor = 'outsource' OR perusahaan_asal_id = ?)
      LIMIT 1`,
    [id_vendor, perusahaan_id]
  );
  return rows[0] || null;
}

// Vendor yang boleh diubah/dihapus user ini: dibuat olehnya, atau internal milik salah satu perusahaannya
async function cekVendorMilik(id_vendor, id_user) {
  const [rows] = await sql_enak.raw(
    `SELECT u.* FROM user u
      WHERE u.id_user = ? AND u.is_admin = 3 AND u.deleted = 0
        AND (u.created_by = ? OR u.perusahaan_asal_id IN (
              SELECT p.perusahaan_id FROM perusahaan p WHERE p.id_user = ? AND p.deletedAt IS NULL))
      LIMIT 1`,
    [id_vendor, id_user, id_user]
  );
  return rows[0] || null;
}

// Sama dengan aturan di halaman login: harus ada angka, huruf besar, huruf kecil, dan karakter lain
function passwordValid(pwd) {
  return /[1-9]/.test(pwd) && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[^1-9A-Za-z]/.test(pwd);
}

// ---------------------------------------------
// VIEW
// ---------------------------------------------
router.get('/', cek_perusahaan, async function (req, res) {
  const user = getUser(req);
  const [perusahaan] = await sql_enak.raw(
    `SELECT perusahaan_id, nama_perusahaan FROM perusahaan
      WHERE id_user = ? AND deletedAt IS NULL ORDER BY nama_perusahaan ASC`,
    [user.id_user]
  );
  res.render('content/dashboard_perusahaan', { user: user, perusahaan: perusahaan });
});

// ---------------------------------------------
// RINGKASAN (kartu statistik)
// ---------------------------------------------
router.get('/ringkasan/:perusahaan_id', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    const perusahaan_id = req.params.perusahaan_id;
    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Perusahaan bukan milik Anda', data: null });
    }

    const [rows] = await sql_enak.raw(
      `SELECT
          SUM(u.jenis_vendor = 'internal') AS internal,
          SUM(u.jenis_vendor IS NULL OR u.jenis_vendor = 'outsource') AS outsource,
          SUM(v.vendor_id IS NOT NULL) AS mitra
        FROM user u
        LEFT JOIN vendor v ON v.id_user = u.id_user AND v.perusahaan_id = ? AND v.deletedAt IS NULL
       WHERE u.is_admin = 3 AND u.deleted = 0
         AND (u.jenis_vendor IS NULL OR u.jenis_vendor = 'outsource' OR u.perusahaan_asal_id = ?)`,
      [perusahaan_id, perusahaan_id]
    );
    const r = rows[0] || {};
    res.status(200).json({
      status: 200, message: 'sukses',
      data: { internal: Number(r.internal) || 0, outsource: Number(r.outsource) || 0, mitra: Number(r.mitra) || 0 }
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

// ---------------------------------------------
// LIST VENDOR (server-side DataTables)
// Isi: vendor internal milik perusahaan ini + semua vendor outsource.
// Vendor internal perusahaan lain tidak ikut.
// ---------------------------------------------
router.post('/vendor/list', cek_perusahaan, async function (req, res) {
  try {
    const { start, length, search, order, columns, draw, perusahaan_id, filter } = req.body;
    const user = getUser(req);

    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(200).json({ draw: parseInt(draw) || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }

    const baseWhere = `u.is_admin = 3 AND u.deleted = 0
      AND (u.jenis_vendor IS NULL OR u.jenis_vendor = 'outsource' OR u.perusahaan_asal_id = ?)`;
    const join = `LEFT JOIN vendor v ON v.id_user = u.id_user AND v.perusahaan_id = ? AND v.deletedAt IS NULL`;
    const baseValue = [perusahaan_id, perusahaan_id];

    let where = [];
    let value = [];
    if (filter === 'internal') where.push(`u.jenis_vendor = 'internal'`);
    else if (filter === 'outsource') where.push(`(u.jenis_vendor IS NULL OR u.jenis_vendor = 'outsource')`);
    else if (filter === 'mitra') where.push(`v.vendor_id IS NOT NULL`);
    else if (filter === 'bukan_mitra') where.push(`v.vendor_id IS NULL`);

    if (search && search.value) {
      const s = `%${search.value}%`;
      where.push(`(u.fullname LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.telp LIKE ?)`);
      value.push(s, s, s, s);
    }
    const whereSql = `WHERE ${baseWhere}` + (where.length ? ' AND ' + where.join(' AND ') : '');

    let orderBy = `ORDER BY is_mitra DESC, u.fullname ASC`;
    if (order && columns && order.length) {
      const col = columns[order[0].column] && columns[order[0].column].data;
      const dir = order[0].dir === 'asc' ? 'ASC' : 'DESC';
      const allowed = { fullname: 'u.fullname', username: 'u.username', jenis_vendor: 'u.jenis_vendor', is_mitra: 'is_mitra' };
      if (allowed[col]) orderBy = `ORDER BY ${allowed[col]} ${dir}`;
    }

    const [[total]] = await sql_enak.raw(
      `SELECT COUNT(*) AS n FROM user u ${join} WHERE ${baseWhere}`, baseValue);
    const [[filtered]] = await sql_enak.raw(
      `SELECT COUNT(*) AS n FROM user u ${join} ${whereSql}`, baseValue.concat(value));

    let dataSql = `
      SELECT u.id_user, u.username, u.fullname, u.email, u.telp,
             COALESCE(u.jenis_vendor, 'outsource') AS jenis_vendor,
             u.perusahaan_asal_id, u.created_by,
             v.vendor_id,
             (v.vendor_id IS NOT NULL) AS is_mitra,
             (u.created_by = ? OR u.perusahaan_asal_id = ?) AS bisa_edit
        FROM user u ${join}
        ${whereSql}
        ${orderBy}`;
    let dataValue = [user.id_user, perusahaan_id].concat(baseValue, value);
    if (start !== undefined && length !== undefined && parseInt(length) > 0) {
      dataSql += ` LIMIT ?, ?`;
      dataValue.push(parseInt(start), parseInt(length));
    }
    const [data] = await sql_enak.raw(dataSql, dataValue);

    res.status(200).json({
      draw: parseInt(draw) || 0,
      recordsTotal: total.n,
      recordsFiltered: filtered.n,
      data: data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

// ---------------------------------------------
// TAMBAH VENDOR (buat akun user is_admin = 3)
// ---------------------------------------------
router.post('/vendor/insert', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    const post = req.body;
    const perusahaan_id = post.perusahaan_id;

    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Perusahaan bukan milik Anda', data: null });
    }
    if (!post.username || !post.pwd || !post.fullname) {
      return res.status(400).json({ status: 400, message: 'Username, password, dan nama wajib diisi', data: null });
    }
    if (['internal', 'outsource'].indexOf(post.jenis_vendor) === -1) {
      return res.status(400).json({ status: 400, message: 'Jenis vendor tidak valid', data: null });
    }
    if (!passwordValid(post.pwd)) {
      return res.status(400).json({ status: 400, message: 'Password harus kombinasi huruf besar, huruf kecil, angka, dan karakter', data: null });
    }

    const [cek] = await sql_enak.raw(`SELECT id_user FROM user WHERE username = ? LIMIT 1`, [post.username]);
    if (cek.length) {
      return res.status(400).json({ status: 400, message: 'Username telah terpakai', data: null });
    }

    const data = {
      username: post.username,
      pwd: sha1(post.pwd),
      fullname: post.fullname,
      email: post.email || null,
      telp: post.telp || null,
      is_admin: 3,
      jenis_vendor: post.jenis_vendor,
      // vendor internal membawa id perusahaannya
      perusahaan_asal_id: post.jenis_vendor === 'internal' ? perusahaan_id : null,
      created_by: user.id_user,
      created_date: new Date(),
      deleted: 0
    };

    const [id_user_baru] = await sql_enak.insert(data).into('user');

    if (post.jadikan_mitra === '1' || post.jadikan_mitra === 'on' || post.jadikan_mitra === true) {
      await sql_enak.insert({
        perusahaan_id: perusahaan_id,
        id_user: id_user_baru,
        insertedAt: new Date(),
        lastUpdateAt: new Date()
      }).into('vendor');
    }

    res.status(200).json({ status: 200, message: 'Vendor berhasil ditambahkan', data: id_user_baru });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

// ---------------------------------------------
// EDIT VENDOR
// ---------------------------------------------
router.post('/vendor/edit', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    const post = req.body;
    const perusahaan_id = post.perusahaan_id;

    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Perusahaan bukan milik Anda', data: null });
    }
    if (!await cekVendorMilik(post.id_user, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Vendor ini tidak dapat diubah oleh Anda', data: null });
    }
    if (['internal', 'outsource'].indexOf(post.jenis_vendor) === -1) {
      return res.status(400).json({ status: 400, message: 'Jenis vendor tidak valid', data: null });
    }

    const update = {
      fullname: post.fullname,
      email: post.email || null,
      telp: post.telp || null,
      jenis_vendor: post.jenis_vendor,
      perusahaan_asal_id: post.jenis_vendor === 'internal' ? perusahaan_id : null
    };

    if (post.username) {
      const [cek] = await sql_enak.raw(
        `SELECT id_user FROM user WHERE username = ? AND id_user != ? LIMIT 1`, [post.username, post.id_user]);
      if (cek.length) {
        return res.status(400).json({ status: 400, message: 'Username telah terpakai', data: null });
      }
      update.username = post.username;
    }
    if (post.pwd) {
      if (!passwordValid(post.pwd)) {
        return res.status(400).json({ status: 400, message: 'Password harus kombinasi huruf besar, huruf kecil, angka, dan karakter', data: null });
      }
      update.pwd = sha1(post.pwd);
    }

    await sql_enak('user').where('id_user', post.id_user).update(update);
    res.status(200).json({ status: 200, message: 'Vendor berhasil diubah', data: null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

// ---------------------------------------------
// HAPUS VENDOR (soft delete akun + putus semua kemitraannya)
// ---------------------------------------------
router.get('/vendor/hapus/:id', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    if (!await cekVendorMilik(req.params.id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Vendor ini tidak dapat dihapus oleh Anda', data: null });
    }
    await sql_enak('user').where('id_user', req.params.id).update({ deleted: 1 });
    await sql_enak('vendor').where('id_user', req.params.id).whereNull('deletedAt').update({ deletedAt: new Date() });
    res.status(200).json({ status: 200, message: 'Vendor berhasil dihapus', data: null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

// ---------------------------------------------
// KEMITRAAN: pilih / lepas vendor sebagai mitra perusahaan
// ---------------------------------------------
router.post('/mitra/tambah', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    const { perusahaan_id, id_user } = req.body;

    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Perusahaan bukan milik Anda', data: null });
    }
    if (!await cekVendorTerlihat(id_user, perusahaan_id)) {
      return res.status(404).json({ status: 404, message: 'Vendor tidak ditemukan', data: null });
    }
    const [ada] = await sql_enak.raw(
      `SELECT vendor_id FROM vendor WHERE perusahaan_id = ? AND id_user = ? AND deletedAt IS NULL LIMIT 1`,
      [perusahaan_id, id_user]);
    if (ada.length) {
      return res.status(200).json({ status: 200, message: 'Vendor sudah menjadi mitra', data: ada[0].vendor_id });
    }

    const [vendor_id] = await sql_enak.insert({
      perusahaan_id: perusahaan_id,
      id_user: id_user,
      insertedAt: new Date(),
      lastUpdateAt: new Date()
    }).into('vendor');
    res.status(200).json({ status: 200, message: 'Vendor dijadikan mitra', data: vendor_id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

router.post('/mitra/hapus', cek_perusahaan, async function (req, res) {
  try {
    const user = getUser(req);
    const { perusahaan_id, id_user } = req.body;

    if (!await cekPemilikPerusahaan(perusahaan_id, user.id_user)) {
      return res.status(403).json({ status: 403, message: 'Perusahaan bukan milik Anda', data: null });
    }
    await sql_enak('vendor')
      .where('perusahaan_id', perusahaan_id)
      .andWhere('id_user', id_user)
      .whereNull('deletedAt')
      .update({ deletedAt: new Date(), lastUpdateAt: new Date() });
    res.status(200).json({ status: 200, message: 'Kemitraan dilepas', data: null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: 500, message: 'gagal', data: err });
  }
});

module.exports = router;
