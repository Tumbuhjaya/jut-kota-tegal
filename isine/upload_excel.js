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
var dbgeo = require("dbgeo");
var multer = require("multer");
var st = require('knex-postgis')(sql_enak);
const importExcel = require("convert-excel-to-json");

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
router.post('/excel_penghuni', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  // await sql_enak('modal').truncate();
  let {rusun_id} = req.body
  console.log(req.files, req.body);
  
  try {
  if (req.files) {
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },	
        columnToKey:{  B:"kamar_rusun",C :"nama_penghuni", D:"nik", E:"no_kk",F:"alamat_penghuni",G:"nomor_penetapan",H:"no_telp_penghuni",I:"tanggal_penetapan",K:"tanggal_berlaku_ijin"  },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'

      for (let i = 0; i < result.length; i++) {    
        let {nama_penghuni,nik,no_kk,alamat_penghuni,nomor_penetapan,no_telp_penghuni,tanggal_penetapan,tanggal_berlaku_ijin} = result[i]
        let post = {}
        let post2= {}
        post.nama_penghuni =nama_penghuni
        post.nik =nik
        post.no_kk =no_kk
        post.alamat_penghuni =alamat_penghuni
        post.alamat_penghuni =alamat_penghuni
        post.no_telp_penghuni =no_telp_penghuni
        post.tanggal_berlaku_ijin =tanggal_berlaku_ijin


        post2.nomor_penetapan =nomor_penetapan
        post2.tanggal_penetapan =tanggal_penetapan


        let data = await sql_enak.raw(`select kamar_id from rusun r left join gedung g on r.rusun_id = g.rusun_id and g.deletedAt is null left JOIN
lantai l on g.gedung_id = l.gedung_id and l.deletedAt is null left join kamar k on k.lantai_id = l.lantai_id and k.deletedAt is null 
where r.deletedAt is null and r.rusun_id = ? and k.kamar_rusun = ?`,[rusun_id , result[i].kamar_rusun])
        post.kamar_id = data[0][0].kamar_id
        post.insertedAt = new Date()
        post.lastUpdateAt = new Date()
        post2.insertedAt = new Date()
        post2.lastUpdateAt = new Date()
          await sql_enak.insert(post).into("penghuni").then(async function (hsl) {
          arr.push(hsl[0])
           await sql_enak.insert(post2).into("nomor_sk")
        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      if (pesan == 'Sukses') {
        res.json(pesan)
      }else{
        for (let k = 0; k < arr.length; k++) {
        await  sql_enak('penghuni').where('penghuni_id', arr[k]).del()
        }
        res.json(pesan)
      }
    }else{
      res.json('file salah')
    }
}else{
  res.json('error')
}
  } catch (error) {
  console.log(error);
  // Handle the error appropriately
  res.status(500).send('Internal Server Error');
  }
})
router.post('/stunting', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  await sql_enak('stunting').truncate();
  try {
  if (req.files) {
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },	
        columnToKey:{  A:"desa_id",B:"jumlah_stunting"
        // C :"jumlah_balita", D:"pendek", E:"sangat_pendek", F:"total", G:"prevalensi",
        // H :"persen", 
        // I:"", J:"", K:"", L:"",M :"", 
        // N:"", O:"", P:"",Q :"",R :"",S :"",
        // T :"", U:"", V:"", W:"", X:"", 
       
      },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'

      for (let i = 0; i < result.length; i++) {    

        result[i]["insertedAt"]=new Date()
        result[i]["lastUpdateAt"]=new Date()
        await sql_enak.insert(result[i]).into("stunting").then(function (hsl) {
          arr.push(hsl[0])

        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      if (pesan == 'Sukses') {
        res.json(pesan)
      }else{
        for (let k = 0; k < arr.length; k++) {
        await  sql_enak('stunting').where('stunting_id', arr[k]).del()
        }
        res.json(pesan)
      }
    }else{
      res.json('file salah')
    }
}else{
  res.json('error')
}
  } catch (error) {
  console.log(error);
  // Handle the error appropriately
  res.status(500).send('Internal Server Error');
  }
})
router.post('/spam_desa', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  await sql_enak('spam_desa').truncate();
  try {
  if (req.files) {
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },	
        columnToKey:{  A:'desa_id',B:"nama_program",C :"tahun", D:"sumber_air_baku", E:"kapasitas_debit",
        F:"jumlah_sr", G:"x",
        H :"y", I:"nilai_kontrak", J:"waktu_pelaksanaan", K:"sumber_dana", L:"jumlah_penduduk_desa",M :"foto_1", 
       
      },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'

      for (let i = 0; i < result.length; i++) {    

        result[i]["insertedAt"]=new Date()
        result[i]["lastUpdateAt"]=new Date()
        await sql_enak.insert(result[i]).into("spam_desa").then(function (hsl) {
          arr.push(hsl[0])

        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      if (pesan == 'Sukses') {
        res.json(pesan)
      }else{
        for (let k = 0; k < arr.length; k++) {
        await  sql_enak('spam_desa').where('spam_desa_id', arr[k]).del()
        }
        res.json(pesan)
      }
    }else{
      res.json('file salah')
    }
}else{
  res.json('error')
}
  } catch (error) {
  console.log(error);
  // Handle the error appropriately
  res.status(500).send('Internal Server Error');
  }
})
router.post('/sumber_air', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  await sql_enak('sumber_air').truncate();
  try {
  if (req.files) {
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },
        columnToKey:{  A:'no',B:"nama",C :"jenis", D:"id_kab", E:"id_kec",
        F:"id_desakel", G:"x",
        H :"y", I:"debit_kapasitas", J:"debit_optimal", 
        K:"debit_idle", L:"sr_terlayani",
        M :"kapasitas_tampungan", N:"volume_saat_ini", 
        O:"luas", P:"luas_genangan",
        Q :"sumber_penyediaan_air_baku",
        R :"kondisi",S :"fungsi",
        T :"tahun", U:"foto_1", 
        V:"sumber"
        // columnToKey:{  A:'no',B:"nama",C :"jenis", D:"id_kab", E:"id_kec",
        // F:"id_desakel", G:"lintang",
        // H :"bujur", I:"tahun_pemb", J:"tahun_reha", K:"tipe", L:"genangan__",
        // M :"volume_tam", N:"lebar__m_", O:"panjang__m", P:"tinggi__m_",Q :"kapasitas",
        // R :"irigasi",S :"air_baku__",
        // T :"pengendali", U:"pengenda_1", V:"pltmh_plta", W:"lainnya", X:"kondisi_in", 
        // Y:"volume_saa",Z :"keterangan",AA :"nama_unit",AB :"nama_ws", AC:"nama_das", 
        // AD:"jenis_pomp", AE:"kelembagaa", AF:"jumlah_sr", AG:"penerimaan_manfaat_jiwa",AH:"alamat",
        // AI:"foto",
        
      },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'

      for (let i = 0; i < result.length; i++) {   
        let a ='' 
        let b = ''
        console.log(result[i]);
        if(result[i]["x"]&&result[i]["y"]){
          a += 'SHAPE,'
          b += `ST_GeomFromText('POINT(${result[i]["x"]?result[i]["x"]:0} ${result[i]["y"]?result[i]["y"]:0})', 4326, 'axis-order=long-lat') ,`
        }else{
          a += 'SHAPE,'
          b += `ST_GeomFromText('POINT(0 0)', 4326, 'axis-order=long-lat') ,`
        
        }
        if (result[i]["no"]) {
          a+=`no,`
          b+=`${result[i]["no"]?result[i]["no"]:null} ,`
        }
        if (result[i]["nama"]) {
          a+=`nama,`
          b+=`'${result[i]["nama"]?result[i]["nama"]:null}',`
        }
        if (result[i]["jenis"]) {
          a+=`jenis,`
          b+=`'${result[i]["jenis"]?result[i]["jenis"]:null}',`
        }
        
        if (result[i]["y"]) {
          a+=`y,`
          b+=`${result[i]["y"]?result[i]["y"]:null} ,`
        }
        if (result[i]["x"]) {
          a+=`x,`
          b+=`${result[i]["x"]?result[i]["x"]:null} ,`
        }
        // if (result[i]["id_kab"]) {
        //   a+=`id_kab,`
        //   b+=`'${result[i]["id_kab"]?result[i]["id_kab"]:null}',`
        // }
        // if (result[i]["id_kec"]) {
        //   a+=`id_kec,`
        //   b+=`'${result[i]["id_kec"]?result[i]["id_kec"]:null}',`
        // }
        if (result[i]["id_desakel"]) {
          a+=`id_desakel,`
          b+=`'${result[i]["id_desakel"]?result[i]["id_desakel"]:null}',`
        }
        
        if (result[i]["debit_kapasitas"]) {
          a+=`debit_kapasitas,`
          b+=`${result[i]["debit_kapasitas"]?result[i]["debit_kapasitas"]:null} ,`
        }
        if (result[i]["debit_optimal"]) {
          a+=`debit_optimal,`
          b+=`${result[i]["debit_optimal"]?result[i]["debit_optimal"]:null} ,`
        }
        if (result[i]["debit_idle"]) {
          a+=`debit_idle,`
          b+=`${result[i]["debit_idle"]?result[i]["debit_idle"]:null} ,`
        }
        if (result[i]["sr_terlayani"]) {
          a+=`sr_terlayani,`
          b+=`${result[i]["sr_terlayani"]?result[i]["sr_terlayani"]:null} ,`
        }
        if (result[i]["kapasitas_tampungan"]) {
          a+=`kapasitas_tampungan,`
          b+=`${result[i]["kapasitas_tampungan"]?result[i]["kapasitas_tampungan"]:null} ,`
        }
        if (result[i]["volume_saat_ini"]) {
          a+=`volume_saat_ini,`
          b+=`'${result[i]["volume_saat_ini"]?result[i]["volume_saat_ini"]:null}',`
        }
        if (result[i]["luas"]) {
          a+=`luas,`
          b+=`'${result[i]["luas"]?result[i]["luas"]:null}',`
        }
      
        if (result[i]["luas_genangan"]) {
          a+=`luas_genangan,`
          b+=`'${result[i]["luas_genangan"]?result[i]["luas_genangan"]:null}',`
        }
        if (result[i]["sumber_penyediaan_air_baku"]) {
          a+=`sumber_penyediaan_air_baku,`
          b+=`'${result[i]["sumber_penyediaan_air_baku"]?result[i]["sumber_penyediaan_air_baku"]:null}',`
        }

        if (result[i]["kondisi"]) {
          a+=`kondisi,`
          b+=`'${result[i]["kondisi"]?result[i]["kondisi"]:null}',`
        }
        if (result[i]["fungsi"]) {
          a+=`fungsi,`
          b+=`'${result[i]["fungsi"]?result[i]["fungsi"]:null}',`
        }
        if (result[i]["lainnya"]) {
          a+=`lainnya,`
          b+=`'${result[i]["lainnya"]?result[i]["lainnya"]:null}',`
        }
        if (result[i]["tahun"]) {
          a+=`tahun,`
          b+=`'${result[i]["tahun"]?result[i]["tahun"]:null}',`
        }
        
        if (result[i]["foto_1"]) {
          a+=`foto_1,`
          b+=`'${result[i]["foto_1"]?result[i]["foto_1"]:null}',`
        }
        if (result[i]["keterangan"]) {
          a+=`keterangan,`
          b+=`'${result[i]["keterangan"]?result[i]["keterangan"]:null}',`
        }
        if (result[i]["sumber"]) {
          a+=`sumber,`
          b+=`'${result[i]["sumber"]?result[i]["sumber"]:null}',`
        }
        if (result[i]["nama_ws"]) {
          a+=`nama_ws,`
          b+=`'${result[i]["nama_ws"]?result[i]["nama_ws"]:null}',`
        }
        if (result[i]["nama_das"]) {
          a+=`nama_das,`
          b+=`'${result[i]["nama_das"]?result[i]["nama_das"]:null}',`
        }
        if (result[i]["jenis_pomp"]) {
          a+=`jenis_pomp,`
          b+=`'${result[i]["jenis_pomp"]?result[i]["jenis_pomp"]:null}',`
        }
        if (result[i]["kelembagaa"]) {
          a+=`kelembagaa,`
          b+=`'${result[i]["kelembagaa"]?result[i]["kelembagaa"]:null}',`
        }
        if (result[i]["id_kab"]) {
          a+=`id_kab,`
          b+=`${result[i]["id_kab"]?result[i]["id_kab"]:null} ,`
        }
        if (result[i]["id_kec"]) {
          a+=`id_kec,`
          b+=`${result[i]["id_kec"]?result[i]["id_kec"]:null} ,`
        }
        // if (result[i]["id_desakel"]) {
        //   a+=`id_desakel,`
        //   b+=`${result[i]["id_desakel"]?result[i]["id_desakel"]:null} ,`
        // }
        if (result[i]["jumlah_sr"]) {
          a+=`jumlah_sr,`
          b+=`'${result[i]["jumlah_sr"]?result[i]["jumlah_sr"]:null}',`
        }
        if (result[i]["penerimaan_manfaat_jiwa"]) {
          a+=`penerimaan_manfaat_jiwa,`
          b+=`'${result[i]["penerimaan_manfaat_jiwa"]?result[i]["penerimaan_manfaat_jiwa"]:null}',`
        }
        if (result[i]["alamat"]) {
          a+=`alamat,`
          b+=`'${result[i]["alamat"]?result[i]["alamat"]:null}',`
        }
        if (result[i]["foto"]) {
          a+=`foto,`
          b+=`'${result[i]["foto"]?result[i]["foto"]:null}',`
        }
        let sql = `INSERT INTO sumber_air
        (${a.substring(0,a.length-1)})
        VALUES(${b.substring(0,b.length-1)});`
        // await sql_enak.insert(result[i]).into("sumber_air").then(async function (hsl) {
          await sql_enak.raw(sql).then(async function (hsl) {
            let post = {}
            post.insertedAt = new Date()
            post.lastUpdateAt = new Date()
            console.log(hsl[0]);

            await sql_enak('sumber_air').where('OGR_FID','=',hsl[0].insertId).update(post)
          arr.push(hsl[0].insertId)
    
        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      if (pesan == 'Sukses') {
        res.json(pesan)
      }else{
        for (let k = 0; k < arr.length; k++) {
        await  sql_enak('sumber_air').where('OGR_FID', arr[k]).del()
        }
        res.json(pesan)
      }
    }else{
      res.json('file salah')
    }
}else{
  res.json('error')
}
  } catch (error) {
  console.log(error);
  // Handle the error appropriately
  res.status(500).send('Internal Server Error');
  }
})
router.post('/kemiskinan', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  await sql_enak('kemiskinan').truncate();
  try {
  if (req.files) {
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },	
        // columnToKey:{  E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
        columnToKey:{  B:"id_desa",C :"penduduk_miskin", D:"total_selesai", E:"total_rencana",F:"total_blank",
        //   B:"id_kab",C :"id_kec", D:"id_desa", E:"status",
        // F:"jumlah_penduduk", G:"penduduk_miskin",   H:'persentase'    
      },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'

      for (let i = 0; i < result.length; i++) {    

        result[i]["insertedAt"]=new Date()
        result[i]["lastUpdateAt"]=new Date()
        await sql_enak.insert(result[i]).into("kemiskinan").then(function (hsl) {
          arr.push(hsl[0])

        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      if (pesan == 'Sukses') {
        res.json(pesan)
      }else{
        for (let k = 0; k < arr.length; k++) {
        await  sql_enak('kemiskinan').where('kemiskinan_id', arr[k]).del()
        }
        res.json(pesan)
      }
    }else{
      res.json('file salah')
    }
}else{
  res.json('error')
}
  } catch (error) {
  console.log(error);
  // Handle the error appropriately
  res.status(500).send('Internal Server Error');
  }
})
router.post('/pdam', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
    if (req.files['excel']) {
      let file = req.files.excel[0];
      let hasil = await importExcel({
        sourceFile: file.path,
        header: { rows: 1 },	
        columnToKey:{  
          // E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
          C:"kab_id",E :"kec_id", G:"desa_id", H:"jumlah_penduduk",
        I:"PDAM_SR", J:"PDAM_jiwa",  
      },
        sheets: ["Sheet1"],
      });	
      let result = hasil["Sheet1"]
      let arr = []
      let pesan = 'Sukses'
      for (let i = 0; i < result.length; i++) {    
          await sql_enak('modal').where('desa_id','=',result[i].desa_id).update(result[i]).then(data=>{

          arr.push(data[0])

        }).catch(function (err) {
          console.log(err);
          i+=999999999
          pesan = 'error, terjadi kesalahan upload'
        })
      }
      res.status(200).send(pesan);
    }
})
router.post('/dak', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  if (req.files['excel']) {
    let file = req.files.excel[0];
    let hasil = await importExcel({
      sourceFile: file.path,
      header: { rows: 1 },	
      columnToKey:{  
        // E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
        C:"kab_id",E :"kec_id", G:"desa_id", H:"jumlah_penduduk",
      I:"DAK_SR", J:"DAK_jiwa",  
    },
      sheets: ["Sheet1"],
    });	
    let result = hasil["Sheet1"]
    let arr = []
    let pesan = 'Sukses'
    for (let i = 0; i < result.length; i++) {    
        await sql_enak('modal').where('desa_id','=',result[i].desa_id).update(result[i]).then(data=>{

        arr.push(data[0])

      }).catch(function (err) {
        console.log(err);
        i+=999999999
        pesan = 'error, terjadi kesalahan upload'
      })
    }
    res.status(200).send(pesan);
  }
})
router.post('/APBD', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  if (req.files['excel']) {
    let file = req.files.excel[0];
    let hasil = await importExcel({
      sourceFile: file.path,
      header: { rows: 1 },	
      columnToKey:{  
        // E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
        C:"kab_id",E :"kec_id", G:"desa_id", H:"jumlah_penduduk",
      I:"APBD_SR", J:"APBD_jiwa",  
    },
      sheets: ["Sheet1"],
    });	
    let result = hasil["Sheet1"]
    let arr = []
    let pesan = 'Sukses'
    for (let i = 0; i < result.length; i++) {    
        await sql_enak('modal').where('desa_id','=',result[i].desa_id).update(result[i]).then(data=>{

        arr.push(data[0])

      }).catch(function (err) {
        console.log(err);
        i+=999999999
        pesan = 'error, terjadi kesalahan upload'
      })
    }
    res.status(200).send(pesan);
  }
})
router.post('/APBD_provinsi', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  if (req.files['excel']) {
    let file = req.files.excel[0];
    let hasil = await importExcel({
      sourceFile: file.path,
      header: { rows: 1 },	
      columnToKey:{  
        // E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
        C:"kab_id",E :"kec_id", G:"desa_id", H:"jumlah_penduduk",
      I:"APBD_provinsi_SR", J:"APBD_provinsi_jiwa",  
    },
      sheets: ["Sheet1"],
    });	
    let result = hasil["Sheet1"]
    let arr = []
    let pesan = 'Sukses'
    for (let i = 0; i < result.length; i++) {    
        await sql_enak('modal').where('desa_id','=',result[i].desa_id).update(result[i]).then(data=>{

        arr.push(data[0])

      }).catch(function (err) {
        console.log(err);
        i+=999999999
        pesan = 'error, terjadi kesalahan upload'
      })
    }
    res.status(200).send(pesan);
  }
})
router.post('/SPAM_lainnya', upload.fields([{ name: 'excel', maxCount: 1 }]), async function(req, res){
  if (req.files['excel']) {
    let file = req.files.excel[0];
    let hasil = await importExcel({
      sourceFile: file.path,
      header: { rows: 1 },	
      columnToKey:{  
        // E:"id_desa",F :"jumlah_penduduk", G:"total_selesai", H:"total_rencana",I:"total_blank",
        C:"kab_id",E :"kec_id", G:"desa_id", H:"jumlah_penduduk",
      I:"SPAM_lainnya_SR", J:"SPAM_lainnya_jiwa",  
    },
      sheets: ["Sheet1"],
    });	
    let result = hasil["Sheet1"]
    let arr = []
    let pesan = 'Sukses'
    for (let i = 0; i < result.length; i++) {    
        await sql_enak('modal').where('desa_id','=',result[i].desa_id).update(result[i]).then(data=>{

        arr.push(data[0])

      }).catch(function (err) {
        console.log(err);
        i+=999999999
        pesan = 'error, terjadi kesalahan upload'
      })
    }
    res.status(200).send(pesan);
  }
})
module.exports = router;
