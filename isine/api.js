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
  var deasync = require('deasync');
  path.join(__dirname, '/public/foto')
  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(cookieParser() );
  router.use(passport.initialize());
  router.use(passport.session());
  let table = 'kategori'
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
function buildUserFilter(req, alias, val) {
  // Ambil user (bisa array atau object)
  const user = Array.isArray(req.user) ? req.user[0] : req.user
  console.log('[buildUserFilter] user:', user)

  if (!user) return ''

  const isAdmin = Number(user.is_admin)
  // ============================================================
  // is_admin = 2 => user terhubung ke perusahaan
  // Filter provider lewat kolom perusahaan_id di tabel provider
  // ============================================================
  if (isAdmin === 2) {
    if (!user.perusahaan_id) return ' AND 1=0 '

    val.push(user.perusahaan_id)

 // Filter provider_id: jika aktif, sertakan juga provider 'Tidak Teridentifikasi' dengan pengaku NULL    
    return `  AND ${alias}.pengaku IS NULL  AND ${alias}.provider_id IN (
      SELECT p.provider_id
      FROM provider p
      WHERE p.perusahaan_id = ? 
        AND p.deletedAt IS NULL 
    ) `
    
  }

  // ============================================================
  // is_admin = 3 => user terhubung ke vendor
  // Filter provider lewat tabel perusahaan_provider (kolom vendor_id)
  // ============================================================
  if (isAdmin === 3) {
    // Sesuaikan jika vendor_id mengacu ke user_uuid → ganti ke user.user_uuid
    const vendorId = user.id_user

    if (!vendorId) return ' AND 1=0 '

    val.push(vendorId)

    return ` AND ${alias}.provider_id IN (
      SELECT pp.provider_id
      FROM perusahaan_provider pp
      WHERE pp.vendor_id = ?
        AND pp.deletedAt IS NULL
    )`
  }

  // Admin (is_admin = 1) atau role lain: tidak difilter
  return ''
}
function buildMultiSearch(searchValue, columns, val) {
  if (!searchValue || !columns || columns.length === 0) return ''

  const like = `%${searchValue}%`
  const parts = columns.map(col => `${col} LIKE ?`)
  columns.forEach(() => val.push(like))

  return ` AND (${parts.join(' OR ')})`
}
router.post('/list_kabel', async function (req, res) {
  try {
    let val = []
    let { id, no, kd_kec, kd_kel, provider_id, shape, search,only_unidentified ,pengaku} = req.body
    let tambahan = ' and k.deletedAt is null '

    if (id)          { tambahan += ' and k.id = ? ';          val.push(id) }
    if (no)          { tambahan += ' and k.no = ? ';          val.push(no) }
    if (kd_kec)      { tambahan += ' and k.kd_kec = ? ';      val.push(kd_kec) }
    if (kd_kel)      { tambahan += ' and k.kd_kel = ? ';      val.push(kd_kel) }
    if (provider_id) { tambahan += ' and k.provider_id = ? '; val.push(provider_id) }

    tambahan += buildMultiSearch(search, [
      'k.kode_ruas',
      'k.kode_gps_p',
      'k.kode_gps_u',
      'k.provider',
      'k.ciri_kabel',
      'k.surveyor',
      'k.kode_foto',
      'k.kode_fot_1',
      'p.provider',
      'mr.nm_ruas',
      'kec.kecamatan',
      'kel.desa'
    ], val)


    let t = ''
    if (shape) t += ', k.SHAPE'
    if (only_unidentified) {

      tambahan += ` and  k.provider = 'Tidak Teridentifikasi'`
      if (!pengaku) {
        tambahan += ` and k.pengaku is null `
      }
    }else{
    tambahan += buildUserFilter(req, 'k', val)

    }
    let sql = `
      SELECT k.id, k.kode_ruas, k.kode_gps_p, k.kode_gps_u,
             k.provider, k.ciri_kabel, k.jumlah, k.panjang,
             k.kode_foto, k.kode_fot_1, k.surveyor,
             k.kd_kec, k.kd_kel, k.provider_id, k.insertedAt,
             mr.nm_ruas,
             kec.kecamatan,
             kel.desa,
          p2.provider AS pengaku_nama,
             ST_Y(ST_Centroid(k.SHAPE)) AS lat,
             ST_X(ST_Centroid(k.SHAPE)) AS lng
             ${t}
      FROM kabel k
      LEFT JOIN master_retribusi mr  ON mr.no = k.kode_ruas
      LEFT JOIN kecamatan kec        ON kec.id_kec = k.kd_kec
      LEFT JOIN kelurahan kel        ON kel.id = k.kd_kel
      LEFT JOIN provider p           ON p.provider_id = k.provider_id
                                     LEFT JOIN provider p2 ON p2.provider_id = k.pengaku
      WHERE 1 ${tambahan}
    `
console.log(sql, val);

    let data = await sql_enak.raw(sql, val)
    res.json({ status: 200, data: data[0] })
  } catch (error) {
    console.error('[list_kabel] error:', error)
    res.json({ status: 500, data: error })
  }
})
router.post('/list_tiang', async function (req, res) {
  try {
    let val = []
    let { id, no, kd_kec, kd_kel, kondisi, shape, search, provider_id, only_unidentified,pengaku } = req.body
    let tambahan = ' and t.deletedAt is null '

    if (id)      { tambahan += ' and t.id = ? ';      val.push(id) }
    if (no)      { tambahan += ' and t.no = ? ';      val.push(no) }
    if (kd_kec)  { tambahan += ' and t.kd_kec = ? ';  val.push(kd_kec) }
    if (kd_kel)  { tambahan += ' and t.kd_kel = ? ';  val.push(kd_kel) }
    if (kondisi) { tambahan += ' and t.kondisi = ? '; val.push(kondisi) }

    tambahan += buildMultiSearch(search, [
      't.kode_ruas',
      't.kode_gps',
      't.provider',
      't.ciri_tiang',
      't.kondisi',
      't.surveyor',
      't.kd_foto_1',
      't.kd_foto_2',
      't.kd_foto_3',
      'mr.nm_ruas',
      'k.kecamatan',
      'k2.desa'
    ], val)


    let t = ''
    if (shape) t += ', t.SHAPE'
    
    if (only_unidentified) {
      tambahan += ` and t.provider = 'Tidak Teridentifikasi' `
      if (!pengaku) {
        tambahan += ` and t.pengaku is null `
      }
    }else{
    tambahan += buildUserFilter(req, 't', val)
    }

    // PERBAIKAN: Menambahkan p2.provider AS pengaku_nama dan LEFT JOIN ke provider p2
    let sql = `SELECT k.kecamatan, mr.nm_ruas, k2.desa, t.id, t.kode_ruas, t.kode_gps,
                      t.jumlah_tia, t.provider, t.t_k30cm, t.t_l30cm,
                      t.kd_foto_1, t.kd_foto_2, t.kd_foto_3, t.kondisi,
                      t.ciri_tiang, t.surveyor, t.kd_kec, t.kd_kel,
                      t.provider_id, t.pengaku, t.insertedAt,
                      p2.provider AS pengaku_nama,
                      ST_Y(t.SHAPE) AS lat,
                      ST_X(t.SHAPE) AS lng
                      ${t}
               FROM tiang t
               LEFT JOIN kecamatan k ON k.id_kec = t.kd_kec
               LEFT JOIN kelurahan k2 ON k2.id = t.kd_kel
               LEFT JOIN master_retribusi mr ON mr.no = t.kode_ruas
               LEFT JOIN provider p2 ON p2.provider_id = t.pengaku
               WHERE 1`
console.log(sql+tambahan, val);

    let data = await sql_enak.raw(sql + tambahan, val)
    res.json({ status: 200, data: data[0] })
  } catch (error) {
    console.error('[list_tiang] error:', error)
    res.json({ status: 500, data: error })
  }
})
// router.post('/list_kabel', async function (req, res) {
//     try {
//         let val = []
//         let { id, no, kd_kec, kd_kel, provider_id, shape } = req.body
//         let tambahan = ' and k.deletedAt is null '

//         if (id)          { tambahan += ' and k.id = ? ';          val.push(id) }
//         if (no)          { tambahan += ' and k.no = ? ';          val.push(no) }
//         if (kd_kec)      { tambahan += ' and k.kd_kec = ? ';      val.push(kd_kec) }
//         if (kd_kel)      { tambahan += ' and k.kd_kel = ? ';      val.push(kd_kel) }
//         if (provider_id) { tambahan += ' and k.provider_id = ? '; val.push(provider_id) }

//         let t = ''
//         if (shape) t += ', k.SHAPE'

//         let sql = `
//             SELECT k.id, k.kode_ruas, k.kode_gps_p, k.kode_gps_u,
//                    k.provider, k.ciri_kabel, k.jumlah, k.panjang,
//                    k.kode_foto, k.kode_fot_1, k.surveyor,
//                    k.kd_kec, k.kd_kel, k.provider_id, k.insertedAt,
//                    mr.nm_ruas,
//                    kec.kecamatan,
//                    kel.desa,
//                    p.provider AS provider_nama ${t}
//             FROM kabel k
//             LEFT JOIN master_retribusi mr  ON mr.no = k.kode_ruas
//             LEFT JOIN kecamatan kec        ON kec.id_kec = k.kd_kec
//             LEFT JOIN kelurahan kel        ON kel.id = k.kd_kel
//             LEFT JOIN provider p           ON p.provider_id = k.provider_id
//             WHERE 1 ${tambahan}
//         `
//         let data = await sql_enak.raw(sql, val)
//         res.json({ status: 200, data: data[0] })
//     } catch (error) {
//         console.error('[list_kabel] error:', error)
//         res.json({ status: 500, data: error })
//     }
// })
// router.post('/list_tiang', async function (req, res) {
//     try {
//         let val = []
//         let { id, no, kd_kec, kd_kel, kondisi, shape } = req.body
//         let tambahan = ''
//         if (id)      { tambahan += ' and t.id = ? ';      val.push(id) }
//         if (no)      { tambahan += ' and t.no = ? ';      val.push(no) }
//         if (kd_kec)  { tambahan += ' and t.kd_kec = ? ';  val.push(kd_kec) }
//         if (kd_kel)  { tambahan += ' and t.kd_kel = ? ';  val.push(kd_kel) }
//         if (kondisi) { tambahan += ' and t.kondisi = ? '; val.push(kondisi) } // ← baru

//         let t = ''
//         if (shape) t += ', t.SHAPE'

//         let sql = `SELECT k.kecamatan, mr.nm_ruas, k2.desa, t.id, t.kode_ruas, t.kode_gps,
//                           t.jumlah_tia, t.provider, t.t_k30cm, t.t_l30cm,
//                           t.kd_foto_1, t.kd_foto_2, t.kd_foto_3, t.kondisi,
//                           t.ciri_tiang, t.surveyor, t.kd_kec, t.kd_kel,
//                           t.provider_id, t.insertedAt ${t}
//                    FROM tiang t
//                    LEFT JOIN kecamatan k ON k.id_kec = t.kd_kec
//                    LEFT JOIN kelurahan k2 ON k2.id = t.kd_kel
//                    LEFT JOIN master_retribusi mr ON mr.no = t.kode_ruas
//                    WHERE 1`

//         let data = await sql_enak.raw(sql + tambahan, val)
//         res.json({ status: 200, data: data[0] })
//     } catch (error) {
//         res.json({ status: 500, data: error })
//     }
// })
router.post('/list_kecamatan',async function (req, res) {
      try {
          let val = []
    let {id} = req.body
    let tambahan = ''
    if (id) {
      tambahan+= ' and kec_id = ? '
      val.push(id)
    }
    let sql = ` SELECT id_kec, kecamatan, kec_id FROM kecamatan where 1 `
let data = await sql_enak.raw(sql+tambahan,val)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.post('/list_kelurahan',async function (req, res) {
      try {
          let val = []
    let {kec_id,kel_id} = req.body
    let tambahan = ''
    if (kec_id) {
      tambahan+= ' and kec_id = ? '
      val.push(kec_id)
    }
        if (kel_id) {
      tambahan+= ' and kel_id = ? '
      val.push(kel_id)
    }
    let sql = `SELECT id, SHAPE, kecamatan, desa, kec_id, kel_id
FROM kelurahan where 1 `
let data = await sql_enak.raw(sql+tambahan,val)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.post('/list_ruas', async function (req, res) {
  try {
    let val = []
    let { id, kec, kel, shape } = req.body
    let tambahan = ''
    let t = ''
    if (id) {
      tambahan += ' and mr.id = ? '
      val.push(id)
    }
    if (kec) {
      tambahan += ' and mr.id_kec = ? '
      val.push(kec)
    }
    if (kel) {
      tambahan += ' and mr.id_kel = ? '
      val.push(kel)
    }

    if (shape) {
      t+= ', t.SHAPE'
    }

    let sql = `SELECT mr.id, no, nm_ruas, tk_ruas_aw, tk_ruas_ak, lbr_keras, t_k30cm, t_l30cm, 
                      tower_tele, jr_btk15cm, jr_btl15cm, jr_atk15cm, jr_atl15cm, 
                      kbbt_k15cm, kbbt_l15cm, jl_pribadi, usaha_kcl, usaha_mngh, usaha_bsr, 
                      brng_lain, panjang, mr.id_kec, mr.id_kel, 
                      k.kecamatan, k2.desa ${t}
               FROM master_retribusi mr 
               LEFT JOIN kecamatan k ON k.id_kec = mr.id_kec 
               LEFT JOIN kelurahan k2 ON k2.id = mr.id_kel 
               WHERE 1 `

    let data = await sql_enak.raw(sql + tambahan, val)
    res.json({ status: 200, data: data[0] })
  } catch (error) {
    res.json({ status: 500, data: error })
  }
})
router.post('/update_pengaku', async function (req, res) {
  try {
    let { id, pengaku,type } = req.body
console.log(req.body);

    if (!id) {
      return res.json({ status: 400, message: 'ID wajib diisi' })
    }

    await sql_enak(type)
      .where({ id: id })
      .update({ pengaku: pengaku || null })

    res.json({ status: 200, message: 'Pengaku berhasil diperbarui' })
  } catch (error) {
    console.error('[update_pengaku] error:', error)
    res.json({ status: 500, message: error.message })
  }
})
router.get('/data_kabel/:id',async function (req, res) {
  let {g} = req.query
  let tambahan = ''
  if (g) {
    tambahan += ' GROUP by  k.provider'
  }
  try {
    let sql = `select SUM(k.jumlah * k.panjang ) total ,SUM(k.jumlah * k.panjang ) * mr.jr_atk15cm retribusi_k , p.provider , k.jr_atk15cm , mr.jr_atk15cm, k.jr_atl15cm , mr.jr_atl15cm
from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where mr.no = ? and k.jr_atk15cm is not null`
let data = await sql_enak.raw(sql +tambahan,req.params.id)
    let sql2 = `select SUM(k.jumlah * k.panjang ) * mr.jr_atl15cm retribusi_l , p.provider , k.jr_atk15cm , mr.jr_atk15cm, k.jr_atl15cm , mr.jr_atl15cm
from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where mr.no = ? and k.jr_atl15cm is not null`
let data2 = await sql_enak.raw(sql2 +tambahan,req.params.id)

let sql3 = `select distinct provider_id from kabel where kode_ruas = ? and provider_id is not null`
console.log(sql3 +tambahan,req.params.id);

let data3 = await sql_enak.raw(sql3 +tambahan,req.params.id)
    res.json({status : 200 , data:data[0], data2:data2[0],data3:data3[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/data_tiang/:id',async function (req, res) {
  let {g} = req.query
  let tambahan = ''
  if (g) {
    tambahan += ' GROUP by  k.provider'
  }
  try {
    let sql = `SELECT sum(jumlah_tia) total, sum(jumlah_tia*mr.t_k30cm) retribusi_k , p.provider  from tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join provider p on p.provider_id = t.provider_id where t.kode_ruas = ? and t.t_k30cm is not null `
let data = await sql_enak.raw(sql +tambahan,req.params.id)
let sql2 = `SELECT sum(jumlah_tia) total, sum(jumlah_tia*mr.t_l30cm) retribusi_l, p.provider  from tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join provider p on p.provider_id = t.provider_id where t.kode_ruas = ? and t.t_l30cm is not null `
let data2 = await sql_enak.raw(sql2 +tambahan,req.params.id)
let sql3 = `select distinct provider_id from tiang where kode_ruas = ? and  provider_id is not null`
console.log(sql3 +tambahan,req.params.id);

let data3 = await sql_enak.raw(sql3 +tambahan,req.params.id)

    res.json({status : 200 , data:data[0], data2:data2[0], data3:data3[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/detail_kabel_by_code/:id',async function (req, res) {
  try {
    let sql = `select *,k.panjang ,(k.jumlah * k.panjang ) * mr.jr_atk15cm retribusi_k ,(k.jumlah * k.panjang ) * mr.jr_atl15cm retribusi_l  from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where CONCAT(kode_ruas ,kode_gps_p , kode_gps_u) = ?`
let data = await sql_enak.raw(sql,req.params.id)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/detail_kabel_by_kode_ruas/:id',async function (req, res) {
  try {
    let sql = `select *,(k.jumlah * k.panjang ) * mr.jr_atk15cm retribusi_k ,(k.jumlah * k.panjang ) * mr.jr_atl15cm retribusi_l  from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where kode_ruas = ?`
let data = await sql_enak.raw(sql,req.params.id)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/detail_tiang_by_code/:id',async function (req, res) {
  try {
    let sql = `select *,t.jumlah_tia * mr.t_k30cm retribusi_k ,t.jumlah_tia * mr.t_l30cm   retribusi_l  
from tiang t left join master_retribusi mr on mr.no = t.kode_ruas where CONCAT(kode_ruas ,kode_gps) =  ?`
let data = await sql_enak.raw(sql,req.params.id)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/detail_tiang_by_kode_ruas/:id',async function (req, res) {
  try {
    let sql = `select *,t.jumlah_tia * mr.t_k30cm retribusi_k ,t.jumlah_tia * mr.t_l30cm   retribusi_l  
from tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join provider p on p.provider_id = t.provider_id where kode_ruas = ?`
let data = await sql_enak.raw(sql,req.params.id)
    res.json({status : 200 , data:data[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})

router.get('/summary_provider_kabel/:id',async function (req, res) {
  let {g} = req.query
  let tambahan = ''
  if (g) {
    tambahan += ' GROUP by  k.provider'
  }
  try {
    let sql = `select SUM(k.jumlah * k.panjang ) total, SUM(k.jumlah ) jumlah_kab ,mr.nm_ruas ,SUM(k.jumlah * k.panjang ) * mr.jr_atk15cm retribusi_k , p.provider , k.jr_atk15cm , mr.jr_atk15cm, k.jr_atl15cm , mr.jr_atl15cm
from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where mr.no = ? and k.jr_atk15cm is not null GROUP BY k.provider_id `
let data = await sql_enak.raw(sql +tambahan,req.params.id)
    let sql2 = `select SUM(k.jumlah * k.panjang ) * mr.jr_atl15cm retribusi_l, SUM(k.jumlah ) jumlah_kab ,mr.nm_ruas , p.provider , k.jr_atk15cm , mr.jr_atk15cm, k.jr_atl15cm , mr.jr_atl15cm
from kabel k left join master_retribusi mr on mr.no = k.kode_ruas left join provider p on p .provider_id = k.provider_id where mr.no = ? and k.jr_atl15cm is not null GROUP BY k.provider_id `
let data2 = await sql_enak.raw(sql2 +tambahan,req.params.id)

let sql3 = `select distinct provider_id from kabel where kode_ruas = ? and provider_id is not null`
console.log(sql3 +tambahan,req.params.id);

let data3 = await sql_enak.raw(sql3 +tambahan,req.params.id)
    res.json({status : 200 , data:data[0], data2:data2[0],data3:data3[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.get('/summary_provider_tiang/:id',async function (req, res) {
  let {g} = req.query
  let tambahan = ''
  if (g) {
    tambahan += ' GROUP by  k.provider'
  }
  try {
    let sql = `SELECT sum(jumlah_tia) total, sum(jumlah_tia*mr.t_k30cm) retribusi_k ,mr.nm_ruas , p.provider from tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join provider p on p.provider_id = t.provider_id where t.kode_ruas = ? and t.t_k30cm is not null GROUP BY t.provider_id`
let data = await sql_enak.raw(sql +tambahan,req.params.id)
let sql2 = `SELECT sum(jumlah_tia) total, sum(jumlah_tia*mr.t_l30cm) retribusi_l  ,mr.nm_ruas , p.provider from tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join provider p on p.provider_id = t.provider_id where t.kode_ruas = ? and t.t_l30cm is not null GROUP BY t.provider_id`
let data2 = await sql_enak.raw(sql2 +tambahan,req.params.id)
let sql3 = `select distinct provider_id from tiang where kode_ruas = ? and  provider_id is not null`
console.log(sql3 +tambahan,req.params.id);

let data3 = await sql_enak.raw(sql3 +tambahan,req.params.id)

    res.json({status : 200 , data:data[0], data2:data2[0], data3:data3[0]})
  } catch (error) {
    res.json({status : 500 , data:error})
  }
})
router.post('/update_pengaku', async function (req, res) {
  try {
    let { id, pengaku, type } = req.body
    console.log('[update_pengaku]', req.body)

    if (!id) {
      return res.json({ status: 400, message: 'ID wajib diisi' })
    }

    let tableName = (type === 'kabel') ? 'kabel' : 'tiang'

    await sql_enak(tableName)
      .where({ id: id })
      .update({ pengaku: pengaku || null })

    res.json({ status: 200, message: 'Pengaku berhasil diperbarui' })
  } catch (error) {
    console.error('[update_pengaku] error:', error)
    res.json({ status: 500, message: error.message })
  }
})
module.exports = router;
