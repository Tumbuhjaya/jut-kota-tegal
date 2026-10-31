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
var cek_vendor = require('./dashboard_vendor.js').cek_vendor;
var helper = require('../helpper/permohonan.js');
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


// ============================================================
// JARINGAN UTILITAS — permohonan izin oleh vendor (is_admin = 3)
// Admin (is_admin = 1) memakai halaman yang sama untuk mengisi atas nama vendor.
// Alur: daftar permohonan -> ruas jalan (provider + syarat + baris ruas)
//       -> digitasi tiang / kabel per ruas -> ajukan -> diproses admin
// ============================================================
var JU = '/jaringan_utilitas';

function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

function isAdmin(req) {
  return Number(getUser(req).is_admin) === 1;
}

// Vendor, atau admin yang mengisi atas nama vendor
function cek_pemohon(req, res, next) {
  var user = getUser(req);
  if (req.isAuthenticated() && user && Number(user.is_admin) === 1) return next();
  cek_vendor(req, res, next);
}

// Vendor dibatasi ke permohonannya sendiri; admin boleh semua (null = tanpa filter)
function idPemilik(req) {
  return isAdmin(req) ? null : getUser(req).id_user;
}

function gagal(res, err, status) {
  if (err) console.log(err);
  res.status(status || 500).json({ status: status || 500, message: (err && err.message) || err || 'gagal', data: null });
}

// Permohonan milik vendor yang login (admin: permohonan mana pun); 404 jika tidak ada
async function ambilMilik(req, res, wajibBisaUbah) {
  var p = await helper.getPermohonan(req.params.id_permohonan, idPemilik(req));
  if (!p) { gagal(res, 'Permohonan tidak ditemukan', 404); return null; }
  if (wajibBisaUbah && !helper.bisaUbah(p)) { gagal(res, 'Permohonan sudah diajukan / diproses dan tidak bisa diubah', 400); return null; }
  return p;
}

async function ambilRuasMilik(req, res, wajibBisaUbah) {
  var p = await ambilMilik(req, res, wajibBisaUbah);
  if (!p) return null;
  var [rows] = await sql_enak.raw(
    `SELECT r.*, mr.nm_ruas, mr.no FROM permohonan_ruas r LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
      WHERE r.permohonan_ruas_id = ? AND r.permohonan_id = ? AND r.deletedAt IS NULL`,
    [req.params.id_ruas, p.permohonan_id]
  );
  if (!rows.length) { gagal(res, 'Ruas tidak ditemukan', 404); return null; }
  return { permohonan: p, ruas: rows[0] };
}

// Locals bersama halaman pengisian: tujuan tombol kembali & info "atas nama vendor" untuk admin
async function localsPengisian(req, p) {
  var atas_nama = null;
  if (isAdmin(req)) {
    var [v] = await sql_enak.raw(`SELECT fullname, username FROM user WHERE id_user = ?`, [p.id_user]);
    atas_nama = v[0] ? (v[0].fullname || v[0].username) : '-';
  }
  return {
    user: getUser(req),
    permohonan: p,
    bisa_ubah: helper.bisaUbah(p),
    atas_nama: atas_nama,
    url_kembali: isAdmin(req) ? '/manajemen_perizinan' : '/perizinan' + JU
  };
}

// ---------------- VIEW ----------------
router.get(JU, cek_pemohon, function (req, res) {
  if (isAdmin(req)) return res.redirect('/manajemen_perizinan');
  res.render('content/jaringan_utilitas/dashboard', { user: getUser(req) });
});

// Tombol "Tambah Data": buat draft lalu langsung ke halaman ruas jalan.
// Admin wajib memilih vendor (?id_user=) yang menjadi pemohon.
router.get(JU + '/baru', cek_pemohon, async function (req, res) {
  var user = getUser(req);
  var kembali = isAdmin(req) ? '/manajemen_perizinan' : '/perizinan' + JU;
  try {
    var pemohon = user;
    if (isAdmin(req)) {
      var [v] = await sql_enak.raw(
        `SELECT id_user, fullname, telp, email FROM user WHERE id_user = ? AND is_admin = 3 AND deleted = 0`,
        [req.query.id_user || 0]
      );
      if (!v.length) return res.redirect(kembali);
      pemohon = v[0];
    }
    var [hasil] = await sql_enak.raw(
      `INSERT INTO permohonan (id_user, dibuat_oleh, nama_pemohon, telp_pemohon, email_pemohon, status, insertedAt, lastUpdateAt)
       VALUES (?, ?, ?, ?, ?, 'draft', NOW(), NOW())`,
      [pemohon.id_user, user.id_user, pemohon.fullname || null, pemohon.telp || null, pemohon.email || null]
    );
    res.redirect('/perizinan' + JU + '/ruas_jalan/' + hasil.insertId);
  } catch (err) {
    console.log(err);
    res.redirect(kembali);
  }
});

router.get(JU + '/ruas_jalan/:id_permohonan', cek_pemohon, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id_permohonan, idPemilik(req));
  if (!p) return res.redirect(isAdmin(req) ? '/manajemen_perizinan' : '/perizinan' + JU);
  var locals = await localsPengisian(req, p);
  locals.jenis_dokumen = helper.JENIS_DOKUMEN;
  res.render('content/jaringan_utilitas/ruas_jalan', locals);
});

function viewDigitasi(jenis) {
  return async function (req, res) {
    var p = await helper.getPermohonan(req.params.id_permohonan, idPemilik(req));
    if (!p) return res.redirect(isAdmin(req) ? '/manajemen_perizinan' : '/perizinan' + JU);
    var [ruas] = await sql_enak.raw(
      `SELECT r.permohonan_ruas_id, r.ruas_id, mr.nm_ruas FROM permohonan_ruas r
         LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
        WHERE r.permohonan_ruas_id = ? AND r.permohonan_id = ? AND r.deletedAt IS NULL`,
      [req.params.id_ruas, p.permohonan_id]
    );
    if (!ruas.length) return res.redirect('/perizinan' + JU + '/ruas_jalan/' + p.permohonan_id);
    // Jalan Lain hanya punya titik dummy: peta tidak di-zoom ke sana
    if (ruas[0].nm_ruas === helper.NAMA_RUAS_LAIN) ruas[0].ruas_id = null;
    var locals = await localsPengisian(req, p);
    locals.ruas = ruas[0];
    locals.jenis = jenis;
    res.render('content/jaringan_utilitas/' + jenis, locals);
  };
}
router.get(JU + '/ruas_jalan/tiang/:id_permohonan/:id_ruas', cek_pemohon, viewDigitasi('tiang'));
router.get(JU + '/ruas_jalan/kabel/:id_permohonan/:id_ruas', cek_pemohon, viewDigitasi('kabel'));

// Cetak SK: hanya permohonan yang sudah disetujui
router.get(JU + '/cetak_sk/:id_permohonan', cek_pemohon, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id_permohonan, idPemilik(req));
  if (!p || p.status !== 'disetujui') return res.status(404).send('SK belum tersedia');
  res.render('content-backoffice/manajemen_perizinan/cetak_sk', await helper.getDataSk(p));
});

// ---------------- API: master ----------------
router.get(JU + '/api/provider', cek_pemohon, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(`SELECT provider_id, provider FROM provider WHERE deletedAt IS NULL ORDER BY provider ASC`);
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// Baris "Jalan Lain" ditandai luar_ruas = 1; di form dipakai sebagai pilihan "Di luar ruas"
router.get(JU + '/api/master_ruas', cek_pemohon, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT id, no, nm_ruas, tk_ruas_aw, tk_ruas_ak, panjang, t_k30cm, jr_atk15cm, (nm_ruas = ?) AS luar_ruas
         FROM master_retribusi ORDER BY nm_ruas ASC`,
      [helper.NAMA_RUAS_LAIN]
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// ---------------- API: permohonan ----------------
router.post(JU + '/api/list', cek_vendor, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(helper.SQL_REKAP + ` AND p.id_user = ? ORDER BY p.permohonan_id DESC`, [getUser(req).id_user]);
    data.forEach(function (d) { d.bisa_ubah = helper.bisaUbah(d); });
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get(JU + '/api/detail/:id_permohonan', cek_pemohon, async function (req, res) {
  try {
    var p = await ambilMilik(req, res, false);
    if (!p) return;
    res.json({ status: 200, message: 'sukses', data: await helper.getDetail(p) });
  } catch (err) { gagal(res, err); }
});

// Simpan provider + baris ruas.
// body: { provider_id, ruas: [{ permohonan_ruas_id?, ruas_id ('' = luar ruas), jumlah_tiang, panjang_kabel }] }
router.post(JU + '/api/simpan/:id_permohonan', cek_pemohon, async function (req, res) {
  try {
    var p = await ambilMilik(req, res, true);
    if (!p) return;
    var body = req.body || {};
    var ruas = Array.isArray(body.ruas) ? body.ruas : [];
    var idRuasLain = await helper.getIdRuasLain();

    await sql_enak.raw(`UPDATE permohonan SET provider_id = ?, lastUpdateAt = NOW() WHERE permohonan_id = ?`,
      [body.provider_id || null, p.permohonan_id]);

    for (var i = 0; i < ruas.length; i++) {
      var r = ruas[i];
      // ruas kosong = di luar ruas -> pakai tarif baris Jalan Lain
      var ruas_id = r.ruas_id ? Number(r.ruas_id) : idRuasLain;
      var tarif = { t_k30cm: 0, jr_atk15cm: 0 };
      if (ruas_id) {
        var [mr] = await sql_enak.raw(`SELECT t_k30cm, jr_atk15cm FROM master_retribusi WHERE id = ?`, [ruas_id]);
        if (!mr.length) return gagal(res, 'Ruas jalan baris ke-' + (i + 1) + ' tidak ditemukan', 400);
        tarif = mr[0];
      }
      var nilai = [ruas_id, Math.max(0, parseInt(r.jumlah_tiang) || 0), Math.max(0, parseFloat(r.panjang_kabel) || 0),
                   tarif.t_k30cm || 0, tarif.jr_atk15cm || 0];
      if (r.permohonan_ruas_id) {
        await sql_enak.raw(
          `UPDATE permohonan_ruas SET ruas_id = ?, jumlah_tiang = ?, panjang_kabel = ?, tarif_tiang = ?, tarif_kabel = ?, lastUpdateAt = NOW()
            WHERE permohonan_ruas_id = ? AND permohonan_id = ? AND deletedAt IS NULL`,
          nilai.concat([r.permohonan_ruas_id, p.permohonan_id])
        );
      } else {
        await sql_enak.raw(
          `INSERT INTO permohonan_ruas (ruas_id, jumlah_tiang, panjang_kabel, tarif_tiang, tarif_kabel, permohonan_id, insertedAt, lastUpdateAt)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          nilai.concat([p.permohonan_id])
        );
      }
    }
    res.json({ status: 200, message: 'sukses', data: await helper.getRuas(p.permohonan_id) });
  } catch (err) { gagal(res, err); }
});

// Data pemohon + upload dokumen persyaratan (modal "Upload")
router.post(JU + '/api/syarat/:id_permohonan', cek_pemohon, function (req, res) {
  helper.upload_dokumen(req, res, async function (errUpload) {
    if (errUpload) return gagal(res, errUpload, 400);
    try {
      var p = await ambilMilik(req, res, true);
      if (!p) return;
      var b = req.body || {};
      await sql_enak.raw(
        `UPDATE permohonan SET nama_pemohon = ?, jabatan_pemohon = ?, telp_pemohon = ?, email_pemohon = ?, lastUpdateAt = NOW()
          WHERE permohonan_id = ?`,
        [b.nama_pemohon || null, b.jabatan_pemohon || null, b.telp_pemohon || null, b.email_pemohon || null, p.permohonan_id]
      );
      var files = req.files || {};
      for (var jenis in files) {
        var f = files[jenis][0];
        await sql_enak.raw(
          `INSERT INTO permohonan_dokumen (permohonan_id, jenis_dokumen, nama_file, nama_asli, insertedAt, lastUpdateAt)
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE nama_file = VALUES(nama_file), nama_asli = VALUES(nama_asli), lastUpdateAt = NOW()`,
          [p.permohonan_id, jenis, f.filename, f.originalname]
        );
      }
      res.json({ status: 200, message: 'sukses', data: await helper.getDokumen(p.permohonan_id) });
    } catch (err) { gagal(res, err); }
  });
});

router.get(JU + '/dokumen/:id_permohonan/:id_dokumen', cek_pemohon, async function (req, res) {
  try {
    var p = await ambilMilik(req, res, false);
    if (!p) return;
    var [rows] = await sql_enak.raw(
      `SELECT * FROM permohonan_dokumen WHERE permohonan_dokumen_id = ? AND permohonan_id = ?`,
      [req.params.id_dokumen, p.permohonan_id]
    );
    helper.kirimDokumen(res, rows[0]);
  } catch (err) { gagal(res, err); }
});

// Ajukan ke admin: wajib provider, pemohon, minimal 1 ruas, dan dokumen wajib lengkap
router.post(JU + '/api/ajukan/:id_permohonan', cek_pemohon, async function (req, res) {
  try {
    var p = await ambilMilik(req, res, true);
    if (!p) return;
    var kurang = [];
    if (!p.provider_id) kurang.push('Provider belum dipilih');
    if (!p.nama_pemohon) kurang.push('Nama pemohon belum diisi');
    var ruas = await helper.getRuas(p.permohonan_id);
    if (!ruas.length) kurang.push('Belum ada ruas jalan');
    var ada = (await helper.getDokumen(p.permohonan_id)).map(function (d) { return d.jenis_dokumen; });
    helper.DOKUMEN_WAJIB.forEach(function (j) {
      if (ada.indexOf(j) === -1) kurang.push('Dokumen belum diupload: ' + helper.JENIS_DOKUMEN[j]);
    });
    if (kurang.length) return res.status(400).json({ status: 400, message: kurang.join('\n'), data: kurang });

    await sql_enak.raw(
      `UPDATE permohonan SET status = 'diajukan', diajukanAt = NOW(), lastUpdateAt = NOW() WHERE permohonan_id = ?`,
      [p.permohonan_id]
    );
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get(JU + '/api/hapus/:id_permohonan', cek_pemohon, async function (req, res) {
  try {
    var p = await ambilMilik(req, res, true);
    if (!p) return;
    await sql_enak.raw(`UPDATE permohonan SET deletedAt = NOW() WHERE permohonan_id = ?`, [p.permohonan_id]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// Hapus satu baris ruas beserta digitasi tiang & kabelnya
router.get(JU + '/api/ruas/hapus/:id_permohonan/:id_ruas', cek_pemohon, async function (req, res) {
  try {
    var x = await ambilRuasMilik(req, res, true);
    if (!x) return;
    var id = x.ruas.permohonan_ruas_id;
    await sql_enak.raw(`UPDATE permohonan_ruas SET deletedAt = NOW() WHERE permohonan_ruas_id = ?`, [id]);
    await sql_enak.raw(`UPDATE permohonan_tiang SET deletedAt = NOW() WHERE permohonan_ruas_id = ? AND deletedAt IS NULL`, [id]);
    await sql_enak.raw(`UPDATE permohonan_kabel SET deletedAt = NOW() WHERE permohonan_ruas_id = ? AND deletedAt IS NULL`, [id]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// ---------------- API: digitasi tiang / kabel ----------------
var DIGITASI = {
  tiang: { table: 'permohonan_tiang', pk: 'permohonan_tiang_id', geom: /^POINT\s*\(/i },
  kabel: { table: 'permohonan_kabel', pk: 'permohonan_kabel_id', geom: /^LINESTRING\s*\(/i }
};

router.get(JU + '/api/digitasi/:jenis/:id_permohonan/:id_ruas', cek_pemohon, async function (req, res) {
  try {
    if (!DIGITASI[req.params.jenis]) return gagal(res, 'Jenis tidak dikenal', 400);
    var x = await ambilRuasMilik(req, res, false);
    if (!x) return;
    var data = await helper.getDigitasi(x.permohonan.permohonan_id, x.ruas.permohonan_ruas_id);
    res.json({ status: 200, message: 'sukses', data: { ruas: x.ruas, fitur: data[req.params.jenis] } });
  } catch (err) { gagal(res, err); }
});

// body: { fitur: [{ id?, wkt, jumlah, panjang?, keterangan }], hapus: [id, ...] }
router.post(JU + '/api/digitasi/:jenis/:id_permohonan/:id_ruas', cek_pemohon, async function (req, res) {
  try {
    var cfg = DIGITASI[req.params.jenis];
    if (!cfg) return gagal(res, 'Jenis tidak dikenal', 400);
    var x = await ambilRuasMilik(req, res, true);
    if (!x) return;
    var id_p = x.permohonan.permohonan_id, id_r = x.ruas.permohonan_ruas_id;
    var fitur = Array.isArray(req.body.fitur) ? req.body.fitur : [];
    var hapus = Array.isArray(req.body.hapus) ? req.body.hapus : [];

    for (var i = 0; i < fitur.length; i++) {
      if (!cfg.geom.test(String(fitur[i].wkt || ''))) return gagal(res, 'Geometri ' + req.params.jenis + ' ke-' + (i + 1) + ' tidak valid', 400);
    }
    if (hapus.length) {
      await sql_enak.raw(
        `UPDATE ${cfg.table} SET deletedAt = NOW() WHERE ${cfg.pk} IN (${hapus.map(function () { return '?'; }).join(',')})
            AND permohonan_ruas_id = ? AND deletedAt IS NULL`,
        hapus.concat([id_r])
      );
    }
    for (var j = 0; j < fitur.length; j++) {
      var f = fitur[j];
      var kolom = { jumlah: Math.max(1, parseInt(f.jumlah) || 1), keterangan: f.keterangan || null };
      if (req.params.jenis === 'kabel') kolom.panjang = Math.max(0, parseFloat(f.panjang) || 0);
      var set = Object.keys(kolom);
      var nilai = set.map(function (k) { return kolom[k]; });
      if (f.id) {
        await sql_enak.raw(
          `UPDATE ${cfg.table} SET SHAPE = ST_GeomFromText(?), ${set.map(function (k) { return k + ' = ?'; }).join(', ')}, lastUpdateAt = NOW()
            WHERE ${cfg.pk} = ? AND permohonan_ruas_id = ? AND deletedAt IS NULL`,
          [f.wkt].concat(nilai, [f.id, id_r])
        );
      } else {
        await sql_enak.raw(
          `INSERT INTO ${cfg.table} (permohonan_id, permohonan_ruas_id, SHAPE, ${set.join(', ')}, insertedAt, lastUpdateAt)
           VALUES (?, ?, ST_GeomFromText(?), ${set.map(function () { return '?'; }).join(', ')}, NOW(), NOW())`,
          [id_p, id_r, f.wkt].concat(nilai)
        );
      }
    }
    await helper.sinkronTotalRuas(id_r);
    var data = await helper.getDigitasi(id_p, id_r);
    res.json({ status: 200, message: 'sukses', data: { fitur: data[req.params.jenis] } });
  } catch (err) { gagal(res, err); }
});

module.exports = router;
