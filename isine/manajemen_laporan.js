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

router.get('/provider/cetak_sk/:id', cek_login_all, function(req, res) {
  res.render('content-backoffice/manajemen_laporan/cetak_sk_provider',{id:req.params.id});
});

/* =========================================================
 *  DATA SKRD PER PROVIDER (untuk cetak SK)
 *  Selalu seluruh Kota Tegal (tanpa filter kecamatan).
 *  1 baris = 1 ruas jalan: jumlah tiang & panjang kabel milik provider,
 *  tarif tiang = master.t_k30cm, tarif kabel = master.jr_atk15cm
 * ========================================================= */
function getSkProviderData(providerId, cb) {
  var id = connection.escape(providerId);

  var sqlProvider = `
    SELECT p.provider_id, p.provider, pr.nama_perusahaan, pr.alamat
    FROM provider p
    LEFT JOIN perusahaan pr ON pr.perusahaan_id = p.perusahaan_id
    WHERE p.provider_id = ${id}
    LIMIT 1
  `;

  var sqlRuas = `
    SELECT
      r.kode_ruas, m.nm_ruas, m.panjang, m.t_k30cm, m.jr_atk15cm,
      SUM(r.jumlah_tiang) AS jumlah_tiang,
      SUM(r.panjang_kabel) AS panjang_kabel
    FROM (
      SELECT t.kode_ruas, SUM(t.jumlah_tia) AS jumlah_tiang, 0 AS panjang_kabel
      FROM tiang t
      WHERE t.provider_id = ${id} AND t.deletedAt IS NULL
      GROUP BY t.kode_ruas
      UNION ALL
      SELECT k.kode_ruas, 0, SUM(k.panjang * IFNULL(NULLIF(k.jumlah, 0), 1))
      FROM kabel k
      WHERE k.provider_id = ${id} AND k.deletedAt IS NULL
      GROUP BY k.kode_ruas
    ) r
    LEFT JOIN master_retribusi m ON m.no = r.kode_ruas
    GROUP BY r.kode_ruas, m.nm_ruas, m.panjang, m.t_k30cm, m.jr_atk15cm
    ORDER BY CAST(r.kode_ruas AS UNSIGNED), r.kode_ruas
  `;

  connection.query(sqlProvider, function (errP, rowsProvider) {
    if (errP) { console.log('ERR provider:', errP); return cb({ status: 500, message: errP.message }); }
    if (!rowsProvider.length) return cb({ status: 404, message: 'Provider tidak ditemukan' });

    connection.query(sqlRuas, function (errR, rowsRuas) {
      if (errR) { console.log('ERR ruas:', errR); return cb({ status: 500, message: errR.message }); }

      var num = function (v) { return Number(v) || 0; };

      // Panjang kabel dibulatkan ke meter supaya tabel konsisten dengan nominal retribusinya
      var rows = rowsRuas.map(function (r) {
        var jumlah_tiang  = num(r.jumlah_tiang);
        var panjang_kabel = Math.round(num(r.panjang_kabel));
        var tarif_tiang   = num(r.t_k30cm);
        var tarif_kabel   = num(r.jr_atk15cm);
        var retribusi_tiang = jumlah_tiang * tarif_tiang;
        var retribusi_kabel = panjang_kabel * tarif_kabel;
        return {
          kode_ruas:        r.kode_ruas,
          nm_ruas:          r.nm_ruas,
          panjang_ruas_km:  num(r.panjang) / 1000,
          jumlah_tiang:     jumlah_tiang,
          panjang_kabel:    panjang_kabel,
          tarif_tiang:      tarif_tiang,
          tarif_kabel:      tarif_kabel,
          retribusi_tiang:  retribusi_tiang,
          retribusi_kabel:  retribusi_kabel,
          jumlah_retribusi: retribusi_tiang + retribusi_kabel
        };
      });

      var total = rows.reduce(function (a, r) {
        a.jumlah_tiang     += r.jumlah_tiang;
        a.panjang_kabel    += r.panjang_kabel;
        a.retribusi_tiang  += r.retribusi_tiang;
        a.retribusi_kabel  += r.retribusi_kabel;
        a.jumlah_retribusi += r.jumlah_retribusi;
        return a;
      }, { jumlah_tiang: 0, panjang_kabel: 0, retribusi_tiang: 0, retribusi_kabel: 0, jumlah_retribusi: 0 });

      cb(null, { provider: rowsProvider[0], rows: rows, total: total });
    });
  });
}

router.get('/provider/sk_detail/:id', cek_login_all, function (req, res) {
  getSkProviderData(req.params.id, function (err, data) {
    if (err) return res.status(err.status).json({ error: err.message });
    res.json(data);
  });
});

function terbilang(n) {
  var satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  n = Math.floor(Number(n) || 0);
  if (n < 12)            return satuan[n];
  if (n < 20)            return terbilang(n - 10) + ' Belas';
  if (n < 100)           return terbilang(Math.floor(n / 10)) + ' Puluh ' + terbilang(n % 10);
  if (n < 200)           return 'Seratus ' + terbilang(n - 100);
  if (n < 1000)          return terbilang(Math.floor(n / 100)) + ' Ratus ' + terbilang(n % 100);
  if (n < 2000)          return 'Seribu ' + terbilang(n - 1000);
  if (n < 1000000)       return terbilang(Math.floor(n / 1000)) + ' Ribu ' + terbilang(n % 1000);
  if (n < 1000000000)    return terbilang(Math.floor(n / 1000000)) + ' Juta ' + terbilang(n % 1000000);
  if (n < 1000000000000) return terbilang(Math.floor(n / 1000000000)) + ' Milyar ' + terbilang(n % 1000000000);
  return terbilang(Math.floor(n / 1000000000000)) + ' Triliun ' + terbilang(n % 1000000000000);
}

/* =========================================================
 *  CETAK SK (XLSX) — format mengikuti sheet SKRD per provider
 *  (contoh: sheet "19. MYREPUBLIK" di DATA TIANG DAN KABEL UTILITAS)
 * ========================================================= */
router.get('/provider/cetak_sk_xlsx/:id', cek_login_all, function (req, res) {
  getSkProviderData(req.params.id, function (err, data) {
    if (err) return res.status(err.status).send(err.message);

    var ExcelJS = require('exceljs');
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('SKRD', {
      pageSetup: {
        paperSize: 9, orientation: 'landscape', horizontalCentered: true,
        fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
      }
    });

    var FONT    = 'Times New Roman';
    var thin    = { style: 'thin' };
    var border  = { top: thin, left: thin, bottom: thin, right: thin };
    var fmtRp   = '#,##0';
    var p       = data.provider;
    var year    = new Date().getFullYear();

    ws.columns = [
      { width: 6 },  { width: 34 }, { width: 2 },  { width: 5 },  { width: 5 },  { width: 7 },  { width: 10 },
      { width: 11 }, { width: 11 }, { width: 18 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }
    ];

    function put(addr, value, style) {
      var c = ws.getCell(addr);
      c.value = value;
      style = style || {};
      c.font = Object.assign({ name: FONT, size: 11 }, style.font || {});
      if (style.alignment) c.alignment = style.alignment;
      if (style.numFmt)    c.numFmt = style.numFmt;
      if (style.border)    c.border = border;
      return c;
    }
    function mergePut(range, value, style) {
      ws.mergeCells(range);
      return put(range.split(':')[0], value, style);
    }
    var center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    var bold   = { bold: true };

    // ---- KOP ----
    mergePut('B2:N2', 'P E M E R I N T A H   K O T A  T E G A L', { font: { name: 'Arial', size: 14, bold: true }, alignment: center });
    mergePut('B3:N3', 'D I N A S   P E K E R J A A N  U M U M  D A N  P E N A T A A N  R U A N G', { font: { name: 'Arial', size: 12, bold: true }, alignment: center });
    mergePut('B4:N4', 'Jl. Proklamasi  No 11  Telp. 356353  Tegal', { font: { name: 'Arial', size: 10 }, alignment: center });
    ws.getCell('B4').border = { bottom: { style: 'double' } };

    mergePut('A6:N6', 'SURAT KETETAPAN RETRIBUSI DAERAH (SKRD) PEMANFAATAN ASET DAERAH', { font: { size: 13, bold: true, underline: true }, alignment: center });
    mergePut('A7:N7', 'No.  974 / PAD /  ...  / ' + year, { font: bold, alignment: center });

    // ---- IDENTITAS ----
    [
      [9,  'NAMA PEMILIK',           (p.nama_perusahaan || p.provider || '').toUpperCase()],
      [10, 'ALAMAT',                 p.alamat || ''],
      [11, 'LOKASI OBJEK RETRIBUSI', 'Kota Tegal'],
      [12, 'PERIODE',                '1 (satu) Tahun']
    ].forEach(function (r) {
      put('A' + r[0], r[1], { font: bold });
      put('C' + r[0], ':', { font: bold });
      mergePut('D' + r[0] + ':N' + r[0], r[2], { font: bold, alignment: { horizontal: 'left' } });
    });

    // ---- HEADER TABEL (baris 14-17) ----
    var hs = { font: bold, alignment: center, border: true };
    mergePut('A14:A15', 'No.', hs);
    mergePut('B14:C15', 'RUAS JALAN', hs);
    mergePut('D14:F15', 'Nomor Ruas', hs);
    mergePut('G14:G15', 'Panjang Ruas SK', hs);
    mergePut('H14:I14', 'KOMPONEN JARINGAN TELEKOMUNIKASI', hs);
    mergePut('J14:K14', 'BESARAN TARIF RETRIBUSI PEMANFAATAN ASET DAERAH', hs);
    mergePut('L14:M14', 'JUMLAH KOMPONEN RETRIBUSI', hs);
    mergePut('N14:N15', 'JUMLAH RETRIBUSI (Rp)', hs);
    put('H15', 'Jumlah Tiang', hs);
    put('I15', 'Panjang Kabel', hs);
    put('J15', 'PEMASANGAN TIANG TELEKOMUNIKASI DIAMETER ≤ 30CM', hs);
    put('K15', 'PEMASANGAN  PIPA/KABEL/JARINGAN UTILITAS ATAS TANAH  DIAMETER ≤ 15CM', hs);
    put('L15', 'PEMASANGAN TIANG', hs);
    put('M15', 'PEMASANGAN KABEL', hs);

    var satuan = { A: '', B: '', C: '', D: '', E: '', F: '', G: 'Km', H: 'Unit', I: 'Meter', J: 'Rp.', K: 'Rp.', L: 'Unit/Tahun', M: 'Meter/Tahun', N: 'Rp.' };
    var huruf  = { A: 'A', B: 'B', C: '', D: 'C', E: 'D', F: 'E', G: 'F', H: 'G', I: 'H', J: 'I', K: 'J', L: 'K=G x I', M: 'L=H x J', N: 'M = K+L' };
    ws.mergeCells('B16:C16');
    ws.mergeCells('B17:C17');
    Object.keys(satuan).forEach(function (col) {
      put(col + '16', satuan[col], hs);
      put(col + '17', huruf[col],  { alignment: center, border: true, font: { italic: true } });
    });
    ws.getRow(14).height = 30;
    ws.getRow(15).height = 75;

    // ---- DATA ----
    var first = 18;
    var row   = first;
    var cell  = { border: true, alignment: { horizontal: 'center', vertical: 'middle' } };
    var money = { border: true, numFmt: fmtRp, alignment: { horizontal: 'right', vertical: 'middle' } };

    data.rows.forEach(function (r, i) {
      ws.mergeCells('B' + row + ':C' + row);
      put('A' + row, i + 1, cell);
      put('B' + row, r.nm_ruas || '-', { border: true, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true } });
      put('D' + row, 33, cell);
      put('E' + row, 76, cell);
      put('F' + row, r.kode_ruas, cell);
      put('G' + row, Math.round(r.panjang_ruas_km * 1000) / 1000, { border: true, numFmt: '0.000', alignment: cell.alignment });
      put('H' + row, r.jumlah_tiang, cell);
      put('I' + row, r.panjang_kabel, money);
      put('J' + row, r.tarif_tiang, money);
      put('K' + row, r.tarif_kabel, money);
      put('L' + row, { formula: 'H' + row + '*J' + row, result: r.retribusi_tiang }, money);
      put('M' + row, { formula: 'I' + row + '*K' + row, result: r.retribusi_kabel }, money);
      put('N' + row, { formula: 'L' + row + '+M' + row, result: r.jumlah_retribusi }, Object.assign({}, money, { font: bold }));
      row++;
    });
    var last = row - 1;
    var t    = data.total;

    // Baris subtotal
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'K', 'N'].forEach(function (col) { put(col + row, null, { border: true }); });
    function sum(col, result) {
      return last >= first ? { formula: 'SUM(' + col + first + ':' + col + last + ')', result: result } : 0;
    }
    put('H' + row, sum('H', t.jumlah_tiang),    Object.assign({}, cell,  { font: bold }));
    put('I' + row, sum('I', t.panjang_kabel),   Object.assign({}, money, { font: bold }));
    put('L' + row, sum('L', t.retribusi_tiang), Object.assign({}, money, { font: bold }));
    put('M' + row, sum('M', t.retribusi_kabel), Object.assign({}, money, { font: bold }));
    var rowSub = row++;

    mergePut('A' + row + ':M' + row, 'JUMLAH', { font: bold, border: true, alignment: { horizontal: 'right' } });
    put('N' + row, { formula: 'L' + rowSub + '+M' + rowSub, result: t.jumlah_retribusi }, Object.assign({}, money, { font: bold }));
    var rowJumlah = row++;

    mergePut('A' + row + ':M' + row, 'JUMLAH RETRIBUSI YANG HARUS DIBAYARKAN', { font: bold, border: true, alignment: { horizontal: 'right' } });
    put('N' + row, { formula: 'N' + rowJumlah, result: t.jumlah_retribusi }, Object.assign({}, money, { font: bold }));
    row++;

    var teks = terbilang(t.jumlah_retribusi).replace(/\s+/g, ' ').trim() || 'Nol';
    mergePut('A' + row + ':N' + row, 'Terbilang : ' + teks + ' Rupiah', { font: { bold: true, italic: true }, border: true, alignment: center });
    ws.getRow(row).height = 22;
    row += 4;

    // ---- TANDA TANGAN ----
    var ttd = { font: bold, alignment: { horizontal: 'center' } };
    mergePut('L' + row + ':N' + row, 'Tegal,  ......................  ' + year, ttd); row++;
    mergePut('L' + row + ':N' + row, 'Plt. KEPALA DINAS PEKERJAAN UMUM', ttd); row++;
    mergePut('L' + row + ':N' + row, 'DAN PENATAAN RUANG KOTA TEGAL', ttd); row += 5;
    mergePut('L' + row + ':N' + row, 'Heru Prasetya, S.STP', { font: { bold: true, underline: true }, alignment: { horizontal: 'center' } }); row++;
    mergePut('L' + row + ':N' + row, 'Pembina Tk.1', ttd); row++;
    mergePut('L' + row + ':N' + row, 'NIP. 19810503 199912 1 001', ttd); row += 3;

    // ---- CATATAN ----
    put('B' + row, 'BANK JATENG NO REK. 1004 01 0431   An.  RPP DPUPR KOTA TEGAL', { font: bold }); row++;
    put('B' + row, 'Catatan : Dalam hal wajib Retribusi tertentu tidak membayar tepat waktu atau kurang membayar, '); row++;
    put('B' + row, 'Wajib Retribusi dikenakan sanksi administratif berupa bunga sebesar 1% (satu persen) perbulan '); row++;
    put('B' + row, 'dari Retribusi terutang yang tidak atau kurang dibayar.');

    ws.pageSetup.printTitlesRow = '14:17';

    var fileName = 'SKRD_' + String(p.provider || 'provider').replace(/[^A-Za-z0-9]+/g, '_') + '_' + year + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    wb.xlsx.write(res).then(function () { res.end(); }).catch(function (e) {
      console.log('ERR xlsx:', e);
      res.end();
    });
  });
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
      ST_AsText(m.SHAPE) AS geometry,
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
        ST_AsText(t.SHAPE) AS geometry
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
        ST_AsText(k.SHAPE) AS geometry
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
    SELECT m.*, ST_AsText(m.SHAPE) AS geometry
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
        ST_AsText(t.SHAPE) AS geometry
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
        ST_AsText(k.SHAPE) AS geometry
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
      ST_AsText(m.SHAPE) AS geometry,
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
        ST_AsText(t.SHAPE) AS geometry
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
      ST_AsText(m.SHAPE) AS geometry,
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
        ST_AsText(t.SHAPE) AS geometry
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
