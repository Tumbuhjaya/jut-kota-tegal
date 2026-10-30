var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , session = require('express-session')
  , cookieParser = require('cookie-parser')
  , path = require('path');
  const fs = require('fs')

 var cek_login = require('./login').cek_login;
var dbgeo = require("dbgeo");
var multer = require("multer");
  var gdal = require("gdal-async");
      var Parser = require('node-dbf');
      // var deasync = require('deasync');
      var sql_enak = require('../database/mysql_enak.js').connection;
path.join(__dirname, '/foto')
  var {DBFFile} = require('dbffile');

  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.use(cookieParser() );
  router.use(session({ secret: 'bhagasitukeren', cookie: { maxAge : 1200000 },saveUninitialized: true, resave: true }));
  router.use(passport.initialize());
  router.use(passport.session());
  
// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'shp/')
  },
  filename: function (req, file, cb) {
    var nama_file = file.originalname.substr(file.originalname.length - 4);
    nama_file = "datane"+nama_file;
    cb(null, nama_file)
  }
})
var upload = multer({ storage: storage })
//ambil data shp----------------------------------
// var datanya= [];
// var parser = new Parser("shp/daerah_irigasi.dbf");

// parser.on('start', function(p) {
//     console.log('dBase file parsing has started');
// });

// parser.on('header', function(h) {
//     console.log('dBase file header has been parsed');
// });

// parser.on('record', function(record) {
//  // console.log(JSON.stringify(record))
//     datanya.push(JSON.stringify(record));
// });
//  var data_geometry = [];
// parser.on('end', function(p) {
//   var dataset = gdal.open("shp/daerah_irigasi.shp");
 
//   dataset.layers.get(0).features.forEach(function(feature, index) {
//     data_geometry.push(JSON.stringify(feature.getGeometry().toWKT()))
//     // console.log(feature.getGeometry().toWKT());
//    //  console.log(datanya[index])
//   });

//   //  console.log('Finished parsing the dBase file');
// });
//ambil data shp----------------------------------



router.get('/', cek_login, function(req, res) {

  res.render('upload_form_shp');
});
var cpUpload = upload.fields([{ name: 'shp', maxCount: 1 }, { name: 'shx', maxCount: 1 }, { name: 'dbf', maxCount: 1 }])


// Asumsi: sql_enak adalah instance Knex yang sudah terkoneksi ke database
// Contoh: const sql_enak = require('knex')({ client: 'mysql2', connection: { ... } });
router.get('/log_shp_tiang', async function(req, res) {
  try {
      let data = await sql_enak.raw(`SELECT DISTINCT DATE_FORMAT(t.insertedAt, '%Y-%m-%d %H:%i:%s') insertedAt ,p.provider ,p.provider_id  from tiang t left join provider p on p.provider_id = t.provider_id  group BY  t.provider_id , t.insertedAt `)
res.json({status:200,data:data[0]})
  } catch (error) {
    res.json({status:500,data:error})

  }
})
router.get('/hapus_shp_tiang/:i/:p', async function(req, res) {
    try {
      await sql_enak.raw(`DELETE FROM tiang
WHERE insertedAt =? and provider_id = ?` , [req.params.i,req.params.p])
res.json({status:200})
  } catch (error) {
    res.json({status:500,data:error})

  }
})
router.post('/shp_tiang', cpUpload, async function(req, res) {
  try {
    // ========== 1. Path file shapefile ==========
    const baseDir = path.join(__dirname, '..', 'shp');
    const dbfPath = path.join(baseDir, 'datane.dbf');
    const shpPath = path.join(baseDir, 'datane.shp');
    const shxPath = path.join(baseDir, 'datane.shx');
    let {provider_id} = req.body
    // Cek keberadaan semua file
    console.log([dbfPath, shpPath, shxPath]);
    let now = new Date()

    console.log('Semua file shapefile ditemukan.');

    // ========== 2. Baca DBF (atribut) ==========
    const dbf = await DBFFile.open(dbfPath);
    const atribut = await dbf.readRecords(); // array of objects
    console.log(`Jumlah record DBF: ${atribut.length}`);

    // ========== 3. Buka shapefile dengan GDAL ==========
   let dataset;
try {
  dataset = gdal.open(shpPath);
} catch (e) {
  throw new Error('Gagal membuka shapefile (mungkin korup): ' + e.message);
}
const layer = dataset.layers.get(0);
const featureCount = layer.features.count();   // ✅ call count()
console.log(`Jumlah fitur shapefile: ${featureCount}`);

if (atribut.length !== featureCount) {
  console.warn(`Jumlah record DBF (${atribut.length}) tidak sama dengan jumlah fitur (${featureCount}).`);
}

// ========== 4. Proses setiap fitur dan insert batch ==========
const BATCH_SIZE = 500;
let batch = [];
let processed = 0;
let totalInserted = 0;

for (let i = 0; i < featureCount; i++) {
  if (processed >= atribut.length) break; // stop if DBF shorter

  const feature = layer.features.get(i);
  const geom = feature.getGeometry();
  const wkt = geom ? geom.toWKT() : null;

  const row = atribut[processed];
      // Mapping field DBF ke kolom tabel 'tiang'
      // Asumsi field di DBF: Kode_Ruas, Kode_GPS, Jumlah_Tia, Provider, T_K30cm, T_L30cm,
      //   Kd_Foto1, Kd_Foto2, Kd_Foto3, Kondisi, Ciri_Tiang, Surveyor, Kd_Kec, Kd_Kel
      // Jika nama berbeda, sesuaikan di sini
      const data = {
        provider_id:provider_id,
        insertedAt:now,
        kode_ruas: row.Kode_Ruas || '',
        kode_gps: row.Kode_GPS || 0,
        jumlah_tia: row.Jumlah_Tia || 0,
        provider: row.Provider || '',
        t_k30cm: row.T_K30cm || '',
        t_l30cm: row.T_L30cm || '',
        kd_foto_1: row.Kd_Foto1 || '',
        kd_foto_2: row.Kd_Foto2 || '',
        kd_foto_3: row.Kd_Foto3 || '',
        kondisi: row.Kondisi || '',
        ciri_tiang: row.Ciri_Tiang || '',
        surveyor: row.Surveyor || '',
        kd_kec: row.Kd_Kec || 0,
        kd_kel: row.Kd_Kel || 0,
        // SHAPE akan disisipkan sebagai geometry
      };

      // Siapkan data untuk insert, dengan geometry sebagai binding
      // Kita akan gunakan parameterized query untuk menghindari SQL injection
      // Bentuk array: [wkt, join_count, target_fid, kode_ruas, ...]
      const rowValues = [
        wkt, // akan dipakai di ST_GeomFromText(?)
        data.provider_id,
        data.insertedAt,
        data.kode_ruas,
        data.kode_gps,
        data.jumlah_tia,
        data.provider,
        data.t_k30cm,
        data.t_l30cm,
        data.kd_foto_1,
        data.kd_foto_2,
        data.kd_foto_3,
        data.kondisi,
        data.ciri_tiang,
        data.surveyor,
        data.kd_kec,
        data.kd_kel,
      ];

  batch.push(rowValues);
  processed++;

  if (batch.length >= BATCH_SIZE) {
    await insertBatch(batch);
    totalInserted += batch.length;
    console.log(`Inserted ${batch.length} records (total: ${totalInserted})`);
    batch = [];
    // optional small delay to release event loop
    await new Promise(resolve => setImmediate(resolve));
  }
}

// insert remaining batch
if (batch.length > 0) {
  await insertBatch(batch);
  totalInserted += batch.length;
  console.log(`Inserted final ${batch.length} records (total: ${totalInserted})`);
}
    // Tutup dataset GDAL
    dataset.close();

    res.json({
      status: 'berhasil',
      total_processed: processed,
      total_inserted: totalInserted
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'gagal', detail: error.message });
  }
});

async function insertBatch(batch) {
  if (!batch || batch.length === 0) return;

  // Buat placeholder untuk multiple rows
  // Misal: (ST_GeomFromText(?), ?, ?, ...), (ST_GeomFromText(?), ?, ?, ...), ...
  const placeholders = batch.map(() => `(ST_GeomFromText(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).join(', ');

  // Flatten semua values menjadi satu array
  const flatValues = batch.flat();

  // Query INSERT dengan parameter binding
  const query = `
    INSERT INTO tiang
    (SHAPE, provider_id,insertedAt, kode_ruas, kode_gps, jumlah_tia, provider,
     t_k30cm, t_l30cm, kd_foto_1, kd_foto_2, kd_foto_3, kondisi, ciri_tiang,
     surveyor, kd_kec, kd_kel)
    VALUES ${placeholders}
  `;

  // Eksekusi dengan Knex raw
  try {
      await sql_enak.raw(query, flatValues);

  } catch (error) {
    console.log(error);
    
  }
}

router.get('/log_shp_kabel', async function(req, res) {
  try {

    let data = await sql_enak.raw(`
      SELECT DISTINCT
        DATE_FORMAT(k.insertedAt, '%Y-%m-%d %H:%i:%s') AS insertedAt,
        p.provider,
        p.provider_id
      FROM kabel k
      LEFT JOIN provider p ON p.provider_id = k.provider_id
      GROUP BY
        k.provider_id,
        k.insertedAt,
        p.provider
      ORDER BY k.insertedAt DESC
    `);

    res.json({
      status: 200,
      data: data[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 500,
      data: error.message
    });
  }
});

router.get('/hapus_shp_kabel/:i/:p', async function(req, res) {
  try {

    await sql_enak.raw(`
      DELETE FROM kabel
      WHERE insertedAt = ?
      AND provider_id = ?
    `, [
      req.params.i,
      req.params.p
    ]);

    res.json({
      status: 200
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 500,
      data: error.message
    });
  }
});

async function insertBatchKabel(batch) {

  if (!batch || batch.length === 0) return;

  const placeholders = batch.map(() => `
    (
      ST_GeomFromText(?),
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).join(',');

  const values = batch.flat();

  const query = `
    INSERT INTO kabel (
      SHAPE,
      \`no\`,
      kode_ruas,
      kode_gps_p,
      kode_gps_u,
      provider,
      ciri_kabel,
      jumlah,
      jr_atk15cm,
      jr_atl15cm,
      kode_foto,
      kode_fot_1,
      surveyor,
      panjang,
      kd_kec,
      kd_kel,
      provider_id,
      insertedAt
    )
    VALUES ${placeholders}
  `;

  await sql_enak.raw(query, values);
}

router.post('/shp_kabel', cpUpload, async function(req, res) {

  let dataset;

  try {

    // ==========================================
    // 1. Path file shapefile
    // ==========================================
    const baseDir = path.join(__dirname, '..', 'shp');

    const dbfPath = path.join(baseDir, 'datane.dbf');
    const shpPath = path.join(baseDir, 'datane.shp');
    const shxPath = path.join(baseDir, 'datane.shx');

    let { provider_id } = req.body;

    let now = new Date();

    console.log('Path shapefile kabel:', [
      dbfPath,
      shpPath,
      shxPath
    ]);


    // ==========================================
    // 2. Validasi provider
    // ==========================================
    if (!provider_id) {
      throw new Error('provider_id tidak ditemukan');
    }


    // ==========================================
    // 3. Cek file shapefile
    // ==========================================
    if (
      !fs.existsSync(dbfPath) ||
      !fs.existsSync(shpPath) ||
      !fs.existsSync(shxPath)
    ) {
      throw new Error(
        'File shapefile tidak lengkap. DBF, SHP dan SHX harus tersedia.'
      );
    }

    console.log('Semua file shapefile kabel ditemukan.');


    // ==========================================
    // 4. Baca DBF
    // ==========================================
    const dbf = await DBFFile.open(dbfPath);

    const atribut = await dbf.readRecords();

    console.log(`Jumlah record DBF kabel: ${atribut.length}`);


    // ==========================================
    // 5. Buka SHP dengan GDAL
    // ==========================================
    try {

      dataset = gdal.open(shpPath);

    } catch (e) {

      throw new Error(
        'Gagal membuka shapefile kabel: ' + e.message
      );

    }


    const layer = dataset.layers.get(0);

    const featureCount = layer.features.count();

    console.log(
      `Jumlah fitur shapefile kabel: ${featureCount}`
    );


    // ==========================================
    // 6. Validasi jumlah record
    // ==========================================
    if (atribut.length !== featureCount) {

      console.warn(
        `Jumlah record DBF (${atribut.length}) tidak sama dengan jumlah fitur (${featureCount}).`
      );

    }


    // ==========================================
    // 7. Proses dan insert batch
    // ==========================================
    const BATCH_SIZE = 500;

    let batch = [];
    let processed = 0;
    let totalInserted = 0;


    for (let i = 0; i < featureCount; i++) {

      if (processed >= atribut.length) {
        break;
      }


      // Ambil geometry
      const feature = layer.features.get(i);

      const geom = feature.getGeometry();

      const wkt = geom
        ? geom.toWKT()
        : null;


      // Ambil atribut DBF
      const row = atribut[processed];


      // ==========================================
      // Mapping DBF -> tabel kabel
      // ==========================================
      const data = {

        no: row.No || row.NO || row.no || '',

        kode_ruas:
          row.Kode_Ruas ||
          row.KODE_RUAS ||
          '',

        kode_gps_p:
          row.Kode_GPS_P ||
          row.KODE_GPS_P ||
          row.Kode_GPSP ||
          '',

        kode_gps_u:
          row.Kode_GPS_U ||
          row.KODE_GPS_U ||
          row.Kode_GPSU ||
          '',

        provider:
          row.Provider ||
          row.PROVIDER ||
          '',

        ciri_kabel:
          row.Ciri_Kabel ||
          row.CIRI_KABEL ||
          '',

        jumlah:
          row.Jumlah ||
          row.JUMLAH ||
          0,

        jr_atk15cm:
          row.JR_ATK15cm ||
          row.JR_ATK15CM ||
          row.jr_atk15cm ||
          '',

        jr_atl15cm:
          row.JR_ATL15cm ||
          row.JR_ATL15CM ||
          row.jr_atl15cm ||
          '',

        kode_foto:
          row.Kode_Foto ||
          row.KODE_FOTO ||
          '',

        kode_fot_1:
          row.Kode_Fot_1 ||
          row.KODE_FOT_1 ||
          row.Kode_Foto1 ||
          '',

        surveyor:
          row.Surveyor ||
          row.SURVEYOR ||
          '',

        panjang:
          row.Panjang ||
          row.PANJANG ||
          0,

        kd_kec:
          row.Kd_Kec ||
          row.KD_KEC ||
          0,

        kd_kel:
          row.Kd_Kel ||
          row.KD_KEL ||
          0,

        provider_id: provider_id,

        insertedAt: now
      };


      // ==========================================
      // Susun data sesuai urutan INSERT
      // ==========================================
      const rowValues = [

        // SHAPE
        wkt,

        // no
        data.no,

        // kode_ruas
        data.kode_ruas,

        // kode_gps_p
        data.kode_gps_p,

        // kode_gps_u
        data.kode_gps_u,

        // provider
        data.provider,

        // ciri_kabel
        data.ciri_kabel,

        // jumlah
        data.jumlah,

        // jr_atk15cm
        data.jr_atk15cm,

        // jr_atl15cm
        data.jr_atl15cm,

        // kode_foto
        data.kode_foto,

        // kode_fot_1
        data.kode_fot_1,

        // surveyor
        data.surveyor,

        // panjang
        data.panjang,

        // kd_kec
        data.kd_kec,

        // kd_kel
        data.kd_kel,

        // provider_id
        data.provider_id,

        // insertedAt
        data.insertedAt
      ];


      batch.push(rowValues);

      processed++;


      // ==========================================
      // Insert per batch
      // ==========================================
      if (batch.length >= BATCH_SIZE) {

        await insertBatchKabel(batch);

        totalInserted += batch.length;

        console.log(
          `Inserted ${batch.length} kabel (total: ${totalInserted})`
        );

        batch = [];

        await new Promise(resolve => setImmediate(resolve));
      }
    }


    // ==========================================
    // Insert sisa data
    // ==========================================
    if (batch.length > 0) {

      await insertBatchKabel(batch);

      totalInserted += batch.length;

      console.log(
        `Inserted final ${batch.length} kabel (total: ${totalInserted})`
      );
    }


    // ==========================================
    // Tutup GDAL
    // ==========================================
    if (dataset) {
      dataset.close();
    }


    // ==========================================
    // Response
    // ==========================================
    res.json({
      status: 'berhasil',
      total_processed: processed,
      total_inserted: totalInserted
    });


  } catch (error) {

    console.error('Error import kabel:', error);


    // Pastikan dataset ditutup jika terjadi error
    if (dataset) {
      try {
        dataset.close();
      } catch (e) {
        console.error('Gagal menutup dataset:', e);
      }
    }


    res.status(500).json({
      status: 'gagal',
      detail: error.message
    });
  }

});
router.post('/pola_ruang', cpUpload,async function(req, res){
   
  //dbf


 // parser.parse();
   //shp
   var data_geometry = [];
    var dataset = gdal.open("shp/datane.shp");
    
     dataset.layers.get(0).features.forEach(function(feature, index) {
       data_geometry.push(feature.getGeometry().toWKT())
       // console.log(feature.getGeometry().toWKT());
      //  console.log(datanya[index])
     });

  //    await sql_enak.insert(post).into('sanksi_administratif').then(data=>{
  //     res.status(200).json({ status: 200, message: "sukses", data: data})
  //  })
  //  .catch(err=>{
  //   console.log(err,'err');
  //     res.status(500).json({ status: 500, message: "gagal", data: err})
  //  })
     res.json(data_geometry[0])

 // res.sendStatus(200)
})
   
module.exports = router;
