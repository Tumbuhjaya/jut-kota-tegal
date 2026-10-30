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
router.get('/ruas_jalan', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/ruas_jalan'); 
});

router.get('/ruas_jalan/cetak/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_ruas_jalan',{id:req.params.id}); 
});

router.get('/ruas_jalan/cetak_a3/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_ruas_jalan_a3',{id:req.params.id}); 
});

router.get('/ruas_jalan/cetak_tiang_provider/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_tiang_provider',{id:req.params.id}); 
});

router.get('/ruas_jalan/cetak_tiang_provider_a3/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_tiang_provider_a3',{id:req.params.id}); 
});

router.get('/provider', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/provider'); 
});

router.get('/provider/cetak/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_provider',{id:req.params.id}); 
});

router.get('/provider/cetak_tiang_provider/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_tiang_by_provider',{id:req.params.id}); 
});

router.get('/provider/cetak_tiang_provider_a3/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_tiang_by_provider_a3',{id:req.params.id}); 
});
/* =========================================================
 *  DETAIL 1 ID MASTER RETRIBUSI (untuk cetak)
 *  Return: master + tiang + kabel + stats
 * ========================================================= */
router.get('/ruas_jalan_detail/:id', function (req, res) {
  var id = connection.escape(req.params.id);

  // 1) Master + kecamatan + kelurahan
  var sqlMaster = `
    SELECT
      m.*,
      asWkt(m.SHAPE) AS geometry,
      k.kecamatan,
      kl.desa AS kelurahan
    FROM master_retribusi m
    LEFT JOIN kecamatan k  ON k.kec_id  = m.id_kec
    LEFT JOIN kelurahan kl ON kl.kel_id = m.id_kel
    WHERE m.id = ${id}
    LIMIT 1
  `;

  connection.query(sqlMaster, function (err, rowsMaster) {
    if (err) { console.log(err); return res.status(500).json({ error: err.message }); }
    if (!rowsMaster.length) return res.status(404).json({ error: 'Data tidak ditemukan' });

    var master = rowsMaster[0];
    var no = master.no;

    // 2) Tiang (child)
    var sqlTiang = `
      SELECT
        t.id, t.kode_ruas, t.kode_gps, t.jumlah_tia, t.provider,p.rgb,
        t.t_k30cm, t.t_l30cm,  t.kondisi, t.ciri_tiang,t.kd_foto_1,
t.kd_foto_2,
t.kd_foto_3,
        asWkt(t.SHAPE) AS geometry
      FROM tiang t left join provider p on t.provider_id = p.provider_id
      WHERE t.kode_ruas = ${connection.escape(no)}
        AND t.deletedAt IS NULL
    `;

    // 3) Kabel (child)
    var sqlKabel = `
      SELECT
        k.id, k.no, k.kode_ruas, k.kode_gps_p, k.kode_gps_u,
        k.provider, k.ciri_kabel, k.jumlah,
        k.jr_atk15cm, k.jr_atl15cm, k.panjang,
        asWkt(k.SHAPE) AS geometry
      FROM kabel k
      WHERE k.kode_ruas = ${connection.escape(no)}
        AND k.deletedAt IS NULL
    `;

    connection.query(sqlTiang, function (errT, tiangRows) {
      console.log(tiangRows,sqlTiang);
      
      if (errT) { console.log('ERR tiang:', errT); tiangRows = []; }

      connection.query(sqlKabel, function (errK, kabelRows) {
        if (errK) { console.log('ERR kabel:', errK); kabelRows = []; }

        // ---------- HITUNG STATS ----------
        var isFilled = function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; };
        var num = function (v) { return Number(v) || 0; };

        // Provider unik (gabungan tiang + kabel)
        var providerSet = {};
        tiangRows.forEach(function (t) { if (isFilled(t.provider)) providerSet[String(t.provider).trim()] = 1; });
        kabelRows.forEach(function (k) { if (isFilled(k.provider)) providerSet[String(k.provider).trim()] = 1; });
        var jumlah_provider = Object.keys(providerSet).length;

        // Jumlah tiang & kabel
        var jumlah_tiang = tiangRows.reduce(function (a, b) { return a + num(b.jumlah_tia); }, 0);
        var jumlah_kabel = kabelRows.reduce(function (a, b) { return a + num(b.jumlah); }, 0);

        // Tarif dari master
        var tarif_t_k30cm   = num(master.t_k30cm);
        var tarif_jr_atl15cm= num(master.jr_atl15cm);
        var tarif_jr_atk15cm= num(master.jr_atk15cm);

        // Potensi Retribusi Tiang:
        //   jika t.t_k30cm ada isi ATAU t.jr_atl15cm ada isi → tambah tarif_t_k30cm
        var potensi_tiang = 0;
        tiangRows.forEach(function (t) {
          var flagT = isFilled(t.t_k30cm);
          var flagJ = isFilled(t.jr_atl15cm);
          if (flagT || flagJ) {
            potensi_tiang += tarif_t_k30cm;
          }
        });

        // Potensi Retribusi Kabel:
        //   jika k.jr_atk15cm ada isi → tarif_jr_atk15cm * panjang
        //   jika k.jr_atl15cm ada isi → tarif_jr_atl15cm * panjang
        var potensi_kabel = 0;
        let total_panjang_kabel = 0
        kabelRows.forEach(function (k) {
          var p = num(k.panjang)*k.jumlah || 1; // fallback ke 1 kalau panjang kosong
          total_panjang_kabel +=p
          if (isFilled(k.jr_atk15cm)) potensi_kabel += tarif_jr_atk15cm * p  ;
          if (isFilled(k.jr_atl15cm)) potensi_kabel += tarif_jr_atl15cm * p  ;
        });

        var total_potensi = potensi_tiang + potensi_kabel;

        res.json({
          master: master,
          tiang: tiangRows,
          kabel: kabelRows,
          stats: {
            jumlah_provider:          jumlah_provider,
            jumlah_tiang:             jumlah_tiang,
            jumlah_kabel:             jumlah_kabel,
            potensi_retribusi_tiang:  potensi_tiang,
            potensi_retribusi_kabel:  potensi_kabel,
            total_potensi_retribusi:  total_potensi,
            total_panjang_kabel : total_panjang_kabel
          }
        });
      });
    });
  });
});
router.get('/provider_detail/:id', function (req, res) {
  var id = connection.escape(req.params.id);

  // =====================================================
  // FILTER KECAMATAN (opsional dari query ?id_kec=xxx)
  // =====================================================
  var id_kec = (req.query.id_kec || '').toString().trim();
  var hasKecFilter = id_kec !== '' && id_kec !== '0';

  // Siapkan potongan WHERE untuk tiap query
  var whereKecTiang = '';
  var whereKecKabel = '';
  var whereKecMaster = '';

  if (hasKecFilter) {
    var safeKec = connection.escape(id_kec);
    whereKecTiang  = ` AND t.kd_kec = ${safeKec} `;
    whereKecKabel  = ` AND k.kd_kec = ${safeKec} `;
    whereKecMaster = ` AND m.id_kec = ${safeKec} `;
  }

  // =====================================================
  // 1) MASTER
  // =====================================================
  var sqlMaster = `
    SELECT m.*, asWkt(m.SHAPE) AS geometry
    FROM master_retribusi m    
    WHERE 1 ${whereKecMaster}
  `;
console.log(sqlMaster);

  connection.query(sqlMaster, function (errM, rowsMaster) {
    if (errM) {
      console.log('ERR master:', errM);
      return res.status(500).json({ error: 'Gagal memuat master' });
    }
    if (!rowsMaster || rowsMaster.length === 0) {
      return res.json({ master: null, tiang: [], kabel: [], stats: {} });
    }

    var master = rowsMaster[0];
    var no = master.no;

    // =====================================================
    // 2) TIANG
    // =====================================================
    var sqlTiang = `
      SELECT
        t.id, t.kode_ruas, t.kode_gps, t.jumlah_tia, t.provider,
        t.t_k30cm, t.t_l30cm, t.kondisi, t.ciri_tiang,
        t.kd_foto_1, t.kd_foto_2, t.kd_foto_3,
        asWkt(t.SHAPE) AS geometry
      FROM tiang t
      WHERE t.provider_id = ${id}
        AND t.deletedAt IS NULL
        ${whereKecTiang}
    `;
console.log(sqlTiang);

    // =====================================================
    // 3) KABEL
    // =====================================================
    var sqlKabel = `
      SELECT
        k.id, k.no, k.kode_ruas, k.kode_gps_p, k.kode_gps_u,
        k.provider, k.ciri_kabel, k.jumlah,
        k.jr_atk15cm, k.jr_atl15cm, k.panjang,
        asWkt(k.SHAPE) AS geometry
      FROM kabel k
      WHERE k.provider_id = ${id}
        AND k.deletedAt IS NULL
        ${whereKecKabel}
    `;
console.log(sqlKabel);

    connection.query(sqlTiang, function (errT, tiangRows) {
      console.log(tiangRows, sqlTiang);
      if (errT) { console.log('ERR tiang:', errT); tiangRows = []; }

      connection.query(sqlKabel, function (errK, kabelRows) {
        if (errK) { console.log('ERR kabel:', errK); kabelRows = []; }

        // ---------- HITUNG STATS ----------
        var isFilled = function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; };
        var num = function (v) { return Number(v) || 0; };

        var providerSet = {};
        tiangRows.forEach(function (t) { if (isFilled(t.provider)) providerSet[String(t.provider).trim()] = 1; });
        kabelRows.forEach(function (k) { if (isFilled(k.provider)) providerSet[String(k.provider).trim()] = 1; });
        var jumlah_provider = Object.keys(providerSet).length;

        var jumlah_tiang = tiangRows.reduce(function (a, b) { return a + num(b.jumlah_tia); }, 0);
        var jumlah_kabel = kabelRows.reduce(function (a, b) { return a + num(b.jumlah); }, 0);

        var tarif_t_k30cm    = num(master.t_k30cm);
        var tarif_jr_atl15cm = num(master.jr_atl15cm);
        var tarif_jr_atk15cm = num(master.jr_atk15cm);

        var potensi_tiang = 0;
        tiangRows.forEach(function (t) {
          var flagT = isFilled(t.t_k30cm);
          var flagJ = isFilled(t.jr_atl15cm);
          if (flagT || flagJ) {
            potensi_tiang += tarif_t_k30cm;
          }
        });

        var potensi_kabel = 0;
        var total_panjang_kabel = 0;
        kabelRows.forEach(function (k) {
          var p = num(k.panjang) * (k.jumlah || 1);
          total_panjang_kabel += p;
          if (isFilled(k.jr_atk15cm)) potensi_kabel += tarif_jr_atk15cm * p;
          if (isFilled(k.jr_atl15cm)) potensi_kabel += tarif_jr_atl15cm * p;
        });

        var total_potensi = potensi_tiang + potensi_kabel;

        res.json({
          master: master,
          tiang: tiangRows,
          kabel: kabelRows,
          stats: {
            jumlah_provider:         jumlah_provider,
            jumlah_tiang:            jumlah_tiang,
            jumlah_kabel:            jumlah_kabel,
            potensi_retribusi_tiang: potensi_tiang,
            potensi_retribusi_kabel: potensi_kabel,
            total_potensi_retribusi: total_potensi,
            total_panjang_kabel:     total_panjang_kabel
          }
        });
      });
    });
  });
});
/* =========================================================
 *  DETAIL TIANG PROVIDER (untuk cetak)
 *  Join: master_retribusi.no = tiang.kode_ruas
 *  Return: master + tiang yang sudah di-group per kode_gps
 * ========================================================= */
router.get('/ruas_jalan/tiang_provider_detail/:id', cek_login_all, function (req, res) {
  var id = connection.escape(req.params.id);

  // 1) Master + kecamatan + kelurahan
  var sqlMaster = `
    SELECT
      m.id, m.no, m.nm_ruas,
      asWkt(m.SHAPE) AS geometry,
      k.kecamatan,
      kl.desa AS kelurahan
    FROM master_retribusi m
    LEFT JOIN kecamatan k  ON k.kec_id  = m.id_kec
    LEFT JOIN kelurahan kl ON kl.kel_id = m.id_kel
    WHERE m.id = ${id}
    LIMIT 1
  `;

  connection.query(sqlMaster, function (err, rowsMaster) {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: err.message });
    }
    if (!rowsMaster.length) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    var master = rowsMaster[0];
    var noRuas = master.no;

    // 2) Ambil semua tiang untuk ruas ini
    var sqlTiang = `
      SELECT
        t.id, t.kode_ruas, t.kode_gps, t.jumlah_tia, t.provider,
        t.t_k30cm, t.t_l30cm, t.kondisi, t.ciri_tiang,
        t.kd_foto_1, t.kd_foto_2, t.kd_foto_3,
        asWkt(t.SHAPE) AS geometry
      FROM tiang t
      WHERE t.kode_ruas = ${connection.escape(noRuas)}
        AND t.deletedAt IS NULL
      ORDER BY t.kode_gps ASC, t.id ASC
    `;

    connection.query(sqlTiang, function (errT, tiangRows) {
      if (errT) { console.log('ERR tiang:', errT); tiangRows = []; }

      // Helper: extract lng/lat dari WKT "POINT(lng lat)"
      function parsePointWkt(wkt) {
        if (!wkt) return { lng: null, lat: null };
        var m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(wkt);
        if (!m) return { lng: null, lat: null };
        return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
      }

      // Group by kode_gps (satu kode_gps bisa punya banyak provider)
      var groups = {};
      var order  = [];

      tiangRows.forEach(function (t) {
        var key = (t.kode_gps || '') + '|' + (t.geometry || '');
        if (!groups[key]) {
          var pt = parsePointWkt(t.geometry);
          groups[key] = {
            kode_gps: t.kode_gps,
            lat: pt.lat,
            lng: pt.lng,
            foto_1: t.kd_foto_1,
            foto_2: t.kd_foto_2,
            foto_3: t.kd_foto_3,
            providers: []
          };
          order.push(key);
        }
        groups[key].providers.push({
          id:         t.id,
          nama:       t.provider,
          jumlah:     t.jumlah_tia,
          kondisi:    t.kondisi,
          keterangan: t.ciri_tiang || '-'
        });
      });

      var grouped = order.map(function (k, i) {
        var g = groups[k];
        g.no = i + 1;
        return g;
      });

      res.json({
        master: master,
        groups: grouped,
        total:  grouped.length
      });
    });
  });
});
  router.get('/provider/tiang_provider_detail/:id', cek_login_all, function (req, res) {
  var id = connection.escape(req.params.id);

 var id_kec = (req.query.id_kec || '').toString().trim();
 console.log(id_kec , req.query.id_kec ,req.query);
 
  var hasKecFilter = id_kec !== '' && id_kec !== '0';

  // Siapkan potongan WHERE untuk tiap query
  var whereKecTiang = '';
  var whereKecKabel = '';
  var whereKecMaster = '';

  if (hasKecFilter) {
    
    var safeKec = connection.escape(id_kec);
        console.log(safeKec,'    console.log(safeKec);');

    whereKecTiang  = ` AND t.kd_kec = ${safeKec} `;
    whereKecKabel  = ` AND k.kd_kec = ${safeKec} `;
    whereKecMaster = ` AND m.id_kec = ${safeKec} `;
  }
  // 1) Master + kecamatan + kelurahan
  var sqlMaster = `
    SELECT
      m.id, m.no, m.nm_ruas,
      asWkt(m.SHAPE) AS geometry,
      k.kecamatan,
      kl.desa AS kelurahan
    FROM master_retribusi m
    LEFT JOIN kecamatan k  ON k.kec_id  = m.id_kec
    LEFT JOIN kelurahan kl ON kl.kel_id = m.id_kel
    WHERE 1 ${whereKecMaster}
    LIMIT 1
  `;
console.log(sqlMaster);

  connection.query(sqlMaster, function (err, rowsMaster) {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: err.message });
    }
    if (!rowsMaster.length) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    var master = rowsMaster[0];
    var noRuas = master.no;

    // 2) Ambil semua tiang untuk ruas ini
    var sqlTiang = `
      SELECT m.nm_ruas , 
        t.id, t.kode_ruas, t.kode_gps, t.jumlah_tia, t.provider,
        t.t_k30cm, t.t_l30cm, t.kondisi, t.ciri_tiang,
        t.kd_foto_1, t.kd_foto_2, t.kd_foto_3,
        asWkt(t.SHAPE) AS geometry
      FROM tiang t left join  master_retribusi m on m.no = t.kode_ruas
      WHERE t.provider_id = ${id} and t.deletedAt IS NULL ${whereKecTiang}
      ORDER BY t.kode_gps ASC, t.id ASC
    `;
console.log(sqlTiang);

    connection.query(sqlTiang, function (errT, tiangRows) {
      if (errT) { console.log('ERR tiang:', errT); tiangRows = []; }

      // Helper: extract lng/lat dari WKT "POINT(lng lat)"
      function parsePointWkt(wkt) {
        if (!wkt) return { lng: null, lat: null };
        var m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(wkt);
        if (!m) return { lng: null, lat: null };
        return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
      }

      // Group by kode_gps (satu kode_gps bisa punya banyak provider)
      var groups = {};
      var order  = [];

      tiangRows.forEach(function (t) {
        console.log(t);
        
        var key = (t.kode_gps || '') + '|' + (t.geometry || '');
        if (!groups[key]) {
          var pt = parsePointWkt(t.geometry);
          groups[key] = {
            kode_gps: t.kode_gps,
            lat: pt.lat,
            lng: pt.lng,
            foto_1: t.kd_foto_1,
            foto_2: t.kd_foto_2,
            foto_3: t.kd_foto_3,
            nm_ruas:t.nm_ruas,
            providers: []
          };
          order.push(key);
        }
        groups[key].providers.push({
          id:         t.id,
          nama:       t.provider,
          jumlah:     t.jumlah_tia,
          kondisi:    t.kondisi,
                      nm_ruas:t.nm_ruas,

          keterangan: t.ciri_tiang || '-'
        });
      });

      var grouped = order.map(function (k, i) {
        var g = groups[k];
        g.no = i + 1;
        return g;
      });

      res.json({
        master: master,
        groups: grouped,
        total:  grouped.length
      });
    });
  });
});
module.exports = router;
