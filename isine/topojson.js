var connection = require('../database').connection;
var sql_enak = require('../database/mysql_enak.js').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , session = require('express-session')
  , cookieParser = require('cookie-parser');
var cek_login = require('./login').cek_login;
var dbgeo = require("dbgeo");


router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());
router.use(cookieParser());
router.use(session({ secret: 'bhagasitukeren', cookie: { maxAge: 1200000 }, saveUninitialized: true, resave: true }));
router.use(passport.initialize());
router.use(passport.session());

// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  console.log('Time: ', Date.now());
  next();
});



router.get('/json_kec', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  connection.query("SELECT x(centroid(a.SHAPE)) as x, y(centroid(a.SHAPE)) as y, a.kecamatan as kec FROM kecamatan a", function (err, rows, fields) {
    if (err) throw err;

    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    res.send(JSON.stringify(rows))
  });

  //connection.end();
})
router.get('/json_center_kel', function (req, res) {
  let kel =''
  if (req.query.kel) {
    kel = ' where a.id_kelurahan = '+req.query.kel
  }
  connection.query("SELECT x(centroid(a.SHAPE)) as x, y(centroid(a.SHAPE)) as y, a.desa as kel  , a.id_kelurahan  FROM kelurahan  a"+kel, function (err, rows, fields) {
    if (err) throw err;
    res.send(JSON.stringify(rows))
  });
})
router.get('/sk_jalan', function (req, res) {  
   var tambahan = ''
  if (req.query.no) {
     tambahan += "where no= '" + req.query.no + "'";
  }
  connection.query("SELECT asWkt(SHAPE) as geometry , id , no , nm_ruas, tk_ruas_aw, tk_ruas_ak, lbr_keras, t_k30cm, t_l30cm, tower_tele, jr_btk15cm, jr_btl15cm, jr_atk15cm, jr_atl15cm, kbbt_k15cm, kbbt_l15cm, jl_pribadi, usaha_kcl, usaha_mngh, usaha_bsr, brng_lain  FROM master_retribusi " + tambahan, function (err, rows, fields) {
    if (err) throw err;
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      res.send(JSON.stringify(result))
    });
  });
})
router.get('/ruas_kabel', function (req, res) {
  let a = ` CONCAT(kode_ruas ,kode_gps_p , kode_gps_u) kode_x ,jumlah jumlah_kabel,
    id, no, kode_ruas, kode_gps_p, kode_gps_u, provider, 
    ciri_kabel, jumlah, jr_atk15cm, jr_atl15cm, kode_foto, 
    kode_fot_1, surveyor, panjang, kd_kec, kd_kel,provider_id,
    asWkt(SHAPE) as geometry  `
 
  let tambahan = ' where SHAPE IS NOT NULL  '
  if (req.query.no) {
     tambahan += " and kode_ruas= '" + req.query.no + "' ";
  }
    if (req.query.kd_kec) {
     tambahan += " and kd_kec= '" + req.query.kd_kec + "' ";
  }
     if (req.query.kd_kel) {
     tambahan += " and kd_kel= '" + req.query.kd_kel + "' ";
  }
    if (req.query.provider_id) {
     tambahan += " and provider_id= '" + req.query.provider_id + "' ";
  }
   if (req.query.sum) {
  a = ` sum(jumlah * panjang ) panjang_kabel `
}else if (req.query.group_x) {
  tambahan += '  group by kode_x'

}
let sql = `SELECT ${a}
FROM kabel ` 
console.log(sql+tambahan);

  connection.query(sql+ tambahan, function (err, rows, fields) {
    if (err) throw err;
    if (req.query.sum) {
          res.send(rows);

    }else{
 dbgeo.parse({
    "data": rows,
    "outputFormat": "geojson",   // sementara
    "geometryColumn": "geometry",
    "geometryType": "wkt"
}, function (error, result) {
    if (error) return console.log(error);
    console.log('GeoJSON result:', result);
    res.send(result);
});
    }
  
  });
})
router.get('/tiang', function (req, res) {
  let a =   ` asWkt(t.SHAPE) as geometry ,SUM(t.id ) as total_tiang , CONCAT(t.kode_ruas ,t.kode_gps) as kode_x
, mr.t_k30cm , mr.t_l30cm , t.id,  kode_ruas, kode_gps, jumlah_tia, provider, kd_foto_1, kd_foto_2, kd_foto_3, kondisi, ciri_tiang, surveyor, kd_kec, kd_kel , k.kecamatan ,k2.desa `
let tambahan = ' where t.SHAPE IS NOT NULL  '

  if (req.query.no) {
     tambahan += " and kode_ruas= '" + req.query.no + "' ";
  }
    if (req.query.kd_kec) {
     tambahan += " and kd_kec= '" + req.query.kd_kec + "' ";
  }
     if (req.query.kd_kel) {
     tambahan += " and kd_kel= '" + req.query.kd_kel + "' ";
  }
    if (req.query.provider_id) {
     tambahan += " and provider_id= '" + req.query.provider_id + "' ";
  }
if (req.query.sum) {
  a = ` sum(jumlah_tia) jumlah_tiang `
}else{
  tambahan += '  group by kode_x'

}
try {
  let sql = `SELECT  ${a}
FROM tiang t left join master_retribusi mr on mr.no = t.kode_ruas left join kecamatan k on k.kec_id = t.kd_kec left join kelurahan k2 on k2.kel_id = t.kd_kel ` + tambahan
console.log(sql);
 
connection.query(sql, function (err, rows, fields) {
    if (err) throw err;
        if (req.query.sum) {
          res.send(rows);

    }else{
   dbgeo.parse({
    "data": rows,
    "outputFormat": "geojson",   // sementara
    "geometryColumn": "geometry",
    "geometryType": "wkt"
}, function (error, result) {
    if (error) return console.log(error);
    console.log('GeoJSON result:', result);
    res.send(result);
});
    }
  });
} catch (error) {
  console.log(error);
      res.send(error);

}
})
router.post('/drainase_radius', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  var tambahan = "";
  let long =110.42042833988218;
  let lat = -7.080342556193872;
  let jarak = 100;
  if (req.query.status) {
    tambahan += " and status='" + req.query.status + "'";
  }

  if(req.query.long && req.query.lat){
    long = req.query.long;
    lat = req.query.lat;
  }
  if(req.query.jarak){
      jarak = req.query.jarak;
  }
  //  console.log(tambahan)
// let setup = `(ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_StartPoint(a.SHAPE)) < ${jarak} or ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_EndPoint(a.SHAPE)) < ${jarak})`
let setup = `MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}', 1 , 4326), a.SHAPE) = 1`  
if (req.query.id_jln) {
  setup =    `(MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}',1,4326), a.SHAPE) = 1`+" or a.id='" + req.query.id + "')";
}
connection.query(`SELECT asWkt(a.SHAPE) as geometry  from drainase a  WHERE ${setup} and a.deletedAt is null order by a.id asc`, function (err, rows, fields) {
    if (err) throw err;
    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "geojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})
router.get('/drainase_permasalahan', function (req, res) {
  if (req.query.kode_ruas) {
    var tambahan = "where kode_ruas= '" + req.query.kode_ruas + "'";
  } else {
    var tambahan = "";

  }
  connection.query("SELECT *,asWkt(SHAPE) as geometry  FROM drainase_permasalahan " + tambahan, function (err, rows, fields) {
    if (err) throw err;
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      res.send(JSON.stringify(result))
    });
  });
})
router.get('/drainase_bangunan', function (req, res) {
  if (req.query.kd_ruas) {
    var tambahan = "where kd_ruas= '" + req.query.kd_ruas + "'";
  } else {
    var tambahan = "";

  }
  connection.query("SELECT *,asWkt(SHAPE) as geometry  FROM drainase_bangunan " + tambahan, function (err, rows, fields) {
    if (err) throw err;
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      res.send(JSON.stringify(result))
    });
  });
})
router.get('/topojson_kec', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  if (req.query.id_kec) {
    var tambahan = "where id_kec= '" + req.query.id_kec + "'";
  } else {
    var tambahan = "";

  }
  connection.query("SELECT asWkt(SHAPE) as geometry, kecamatan FROM kecamatan " + tambahan, function (err, rows, fields) {
    if (err) throw err;

    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });

  //connection.end();
})

router.get('/topojson_desa', function (req, res) {
  connection.query("SELECT asWkt(a.SHAPE) as geometry, a.desa, a.kel_id FROM kelurahan a  WHERE mbrIntersects(a.SHAPE,  GeomFromText('POLYGON((" + req.query.kiri_lng + " " + req.query.kiri_lat + "," + req.query.kiri_lng + " " + req.query.kanan_lat + "," + req.query.kanan_lng + " " + req.query.kanan_lat + "," + req.query.kanan_lng + " " + req.query.kiri_lat + "," + req.query.kiri_lng + " " + req.query.kiri_lat + "))', 1))", function (err, rows, fields) {
    if (err) throw err;
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });

  //connection.end();
})

router.get('/jalan', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  var tambahan = "where a.deleted=0";
  if (req.query.status) {
    tambahan += " and status='" + req.query.status + "'";
  }
  if (req.query.id_jln) {
    tambahan += " and a.id_jln='" + req.query.id_jln + "'";
  }
  if (req.query.id_kec) {
    tambahan += " and b.id_kec='" + req.query.id_kec + "'";
  }
  if (req.query.id_kel) {
    tambahan += " and b.id_kel='" + req.query.id_kel + "'";
  }
  //  console.log(tambahan)

  connection.query("SELECT asWkt(a.SHAPE) as geometry, a.id_jln, a.km_awal, a.km_akhir, a.p_ruas, a.prkrsn, a.l_ruas, a.kdns, a.foto_awal, a.foto_akhir, a.id, b.status from drainase a join daftar_induk2 b on a.id_jln = b.id_jln  " + tambahan, function (err, rows, fields) {
    if (err) throw err;

    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "topojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})


router.post('/drainase_radius', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  var tambahan = "";
  let long =110.42042833988218;
  let lat = -7.080342556193872;
  let jarak = 100;
  if (req.query.status) {
    tambahan += " and status='" + req.query.status + "'";
  }

  if(req.query.long && req.query.lat){
    long = req.query.long;
    lat = req.query.lat;
  }
  if(req.query.jarak){
      jarak = req.query.jarak;
  }
  //  console.log(tambahan)
// let setup = `(ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_StartPoint(a.SHAPE)) < ${jarak} or ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_EndPoint(a.SHAPE)) < ${jarak})`
let setup = `MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}', 1, 1), a.SHAPE) = 1`  
if (req.query.id_jln) {
  setup =    `(MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}', 1, 1), a.SHAPE) = 1`+" or a.id_jln='" + req.query.id_jln + "')";
}
connection.query(`SELECT asWkt(a.SHAPE) as geometry, a.id_jln, a.km_awal, a.km_akhir, a.p_ruas, a.prkrsn, a.l_ruas, a.kdns, a.foto_awal, a.foto_akhir, a.id, b.status, b.nm_ruas, b.kd_ruas from drainase a join daftar_induk2 b on a.id_jln = b.id_jln WHERE ${setup} and b.deleted =0 order by a.id_jln asc`, function (err, rows, fields) {
    if (err) throw err;
    for (let i = 0; i < rows.length; i++) {
      if(rows[i].status=='JALAN LINGKUNGAN'){
        rows[i].color='#ff6600';
      }else if(rows[i].status=='JALAN KOTA'){
        rows[i].color='#00ff00';
      }else if(rows[i].status=='JALAN NASIONAL'){
        rows[i].color='#ff0000';
      }else if(rows[i].status=='JALAN PROVINSI'){
        rows[i].color='#ffff4d';
      }else if(rows[i].status=='JALAN TOL'){
        rows[i].color='#0057A0';
      }else{
        rows[i].color='#ff6600';
      }
      
    }
    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "geojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})
router.get('/drainase_radius', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  var tambahan = "";
  let long =110.42042833988218;
  let lat = -7.080342556193872;
  let jarak = 100;
  if (req.query.status) {
    tambahan += " and status='" + req.query.status + "'";
  }

  if(req.query.long && req.query.lat){
    long = req.query.long;
    lat = req.query.lat;
  }
  if(req.query.jarak){
      jarak = req.query.jarak;
  }
  //  console.log(tambahan)
let setup = `(ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_StartPoint(a.SHAPE)) < ${jarak} or ST_Distance_Sphere(ST_GeomFromText('POINT(${long} ${lat})', 1), ST_EndPoint(a.SHAPE)) < ${jarak})`
// let setup = `MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}', 1, 1), a.SHAPE) = 1`  
// if (req.query.id_jln) {
//   setup =    `(MBRIntersects(ST_GeomFromGeoJSON('${JSON.stringify(req.body.geojsonpoint)}', 1, 1), a.SHAPE) = 1`+" or a.id_jln='" + req.query.id_jln + "')";
// }
connection.query(`SELECT asWkt(a.SHAPE) as geometry, a.id_jln, a.km_awal, a.km_akhir, a.p_ruas, a.prkrsn, a.l_ruas, a.kdns, a.foto_awal, a.foto_akhir, a.id, b.status, b.nm_ruas, b.kd_ruas from drainase a join daftar_induk2 b on a.id_jln = b.id_jln WHERE ${setup} and b.deleted =0 order by a.id_jln asc`, function (err, rows, fields) {
    if (err) throw err;
    for (let i = 0; i < rows.length; i++) {
      if(rows[i].status=='JALAN LINGKUNGAN'){
        rows[i].color='#ff6600';
      }else if(rows[i].status=='JALAN KOTA'){
        rows[i].color='#00ff00';
      }else if(rows[i].status=='JALAN NASIONAL'){
        rows[i].color='#ff0000';
      }else if(rows[i].status=='JALAN PROVINSI'){
        rows[i].color='#ffff4d';
      }else if(rows[i].status=='JALAN TOL'){
        rows[i].color='#0057A0';
      }else{
        rows[i].color='#ff6600';
      }
      
    }
    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "geojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})
router.get('/detail_jalan/:id_jalan', function (req, res) {
  //connection.connect();
  //console.log(req.query)
  var tambahan = " where id_jln='" + req.params.id_jalan + "'";


  connection.query("SELECT * from daftar_induk2  " + tambahan, function (err, rows, fields) {
    if (err) throw err;

    res.send(JSON.stringify(rows))
  });


  
  //connection.end();
})

router.get('/lapor_jalan', function (req, res) {

  let a = ''
  if(req.user){
    if (req.user[0].role == 2) {
      a+= ` and lj.id_user = ${req.user[0].id_user}`
    }
  }

if (req.query.kecamatan) {
  a+= ` and k2.id_kecamatan = ${req.query.kecamatan}`
}
if (req.query.kelurahan && req.query.kelurahan!='null') {
  a+= ` and k.id_kelurahan = ${req.query.kelurahan}`
}
if (req.query.tahun) {
  a+= `  AND DATE_FORMAT(lj.inserted,'%Y') = ${req.query.tahun} `
}else{
  a+= `  AND DATE_FORMAT(lj.inserted,'%Y') = ${new Date().getFullYear()} `

}

connection.query(`SELECT lj.*,di.status, di.nm_ruas ,di.kd_ruas,u.fullname , k.desa, k2.kecamatan ,k3.desa as user_kel , k4.kecamatan as user_kec,  asWkt(jl.SHAPE) as geometry, jl.km_awal, jl.km_akhir, jl.p_ruas, jl.prkrsn, jl.l_ruas, jl.kdns, jl.foto_awal, jl.foto_akhir FROM lapor_jali lj  left join daftar_induk2 di on di.id_jln = lj.id_jln left join user u on u.id_user = lj.id_user  left join kelurahan k on k.id_kelurahan = di.id_kel left join kecamatan k2 on k2.id_kecamatan = k.id_kec   left join kelurahan k3 on k3.id_kelurahan = u.kel_id left join kecamatan k4 on k4.id_kecamatan = k3.id_kec join drainase jl on  di.id_jln = jl.id_jln WHERE ISNULL(lj.deletedAt) ${a}  order by lj.lapor_jali_id desc`, function (err, rows, fields) {
    if (err) throw err;
    for (let i = 0; i < rows.length; i++) {
      if(rows[i].status=='JALAN LINGKUNGAN'){
        rows[i].color='#ff6600';
      }else if(rows[i].status=='JALAN KOTA'){
        rows[i].color='#00ff00';
      }else if(rows[i].status=='JALAN NASIONAL'){
        rows[i].color='#ff0000';
      }else if(rows[i].status=='JALAN PROVINSI'){
        rows[i].color='#ffff4d';
      }else if(rows[i].status=='JALAN TOL'){
        rows[i].color='#0057A0';
      }else{
        rows[i].color='#ff6600';
      }
      
    }
    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "geojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})


// router.get('/usulan_jalan', function (req, res) {

//   let a = ''
//   if(req.user){
//     if (req.user[0].role == 2) {
//       a+= ` and lj.id_user = ${req.user[0].id_user}`
//     }
//   }

//   if (req.query.kecamatan) {
//     a+= ` and k2.id_kecamatan = ${req.query.kecamatan}`
//   }
//   if (req.query.kelurahan && req.query.kelurahan!='null') {
//     a+= ` and k.id_kelurahan = ${req.query.kelurahan}`
//   }
//   if (req.query.tahun) {
//     a+= `  AND DATE_FORMAT(uj.insertedAt,'%Y') = ${req.query.tahun} `
//   }else{
//     a+= `  AND DATE_FORMAT(uj.insertedAt,'%Y') = ${new Date().getFullYear()} `

//   }

// connection.query(`SELECT uj.* , u.fullname ,k.desa ,k2.kecamatan, asWkt(uj.SHAPE) as geometry  FROM usulan_jali uj left join user u on u.id_user = uj.id_user left join  kelurahan k on k.id_kelurahan = u.kel_id left join kecamatan k2 on k2.id_kecamatan = k.id_kec  WHERE ISNULL(uj.deletedAt) and uj.SHAPE is not null ${a}  ORDER BY uj.usulan_jali_id DESC  `, function (err, rows, fields) {
//     if (err) throw err;
//     for (let i = 0; i < rows.length; i++) {
//       if(rows[i].status=='JALAN LINGKUNGAN'){
//         rows[i].color='#ff6600';
//       }else if(rows[i].status=='JALAN KOTA'){
//         rows[i].color='#00ff00';
//       }else if(rows[i].status=='JALAN NASIONAL'){
//         rows[i].color='#ff0000';
//       }else if(rows[i].status=='JALAN PROVINSI'){
//         rows[i].color='#ffff4d';
//       }else if(rows[i].status=='JALAN TOL'){
//         rows[i].color='#0057A0';
//       }else{
//         rows[i].color='#ff6600';
//       }
      
//     }
//     //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

//     //res.end(JSON.stringify(rows))

//     // MySQL query...
//     //ambil geojson
//     dbgeo.parse({
//       "data": rows,
//       "outputFormat": "geojson",
//       "geometryColumn": "geometry",
//       "geometryType": "wkt"
//     }, function (error, result) {
//       if (error) {
//         return console.log(error);
//       }
//       // This will log a valid GeoJSON object
//       // console.log(result)  
//       res.send(JSON.stringify(result))
//     });
//   });


//   //connection.end();
// })
router.get('/usulan_jalan', function (req, res) {

  let a = ''
  if(req.user){
    if (req.user[0].role == 2) {
      a+= ` and uj.id_user = ${req.user[0].id_user}`
    }
  }

  if (req.query.kecamatan) {
    a+= ` and k2.id_kecamatan = ${req.query.kecamatan}`
  }
  if (req.query.id_survey) {
    a+= ` and uj.survey_id = ${req.query.id_survey}`
  }
  if (req.query.kelurahan && req.query.kelurahan!='null') {
    a+= ` and k.id_kelurahan = ${req.query.kelurahan}`
  }
  if (req.query.tahun) {
    a+= `  AND DATE_FORMAT(uj.insertedAt,'%Y') = ${req.query.tahun} `
  }else{
    a+= `  AND DATE_FORMAT(uj.insertedAt,'%Y') = ${new Date().getFullYear()} `

  }

// connection.query(`SELECT uj.* , u.fullname ,k.desa ,k2.kecamatan, asWkt(uj.SHAPE) as geometry  FROM survey uj left join user u on u.id_user = uj.id_user left join  kelurahan k on k.id_kelurahan = u.kel_id left join kecamatan k2 on k2.id_kecamatan = k.id_kec  WHERE ISNULL(uj.deletedAt) and uj.SHAPE is not null ${a}  ORDER BY uj.usulan_jali_id DESC  `, function (err, rows, fields) {
connection.query(`SELECT  uj.* , u.fullname ,k.desa ,k2.kecamatan, asWkt(uj.SHAPE) as geometry  FROM survey uj left join pembangunan_jali pj on uj.pembangunan_jali_id = pj.pembangunan_jali_id left join user u  on u.id_user = uj.id_user  left join  kelurahan k on k.id_kelurahan = u.kel_id left join kecamatan k2 on k2.id_kecamatan = k.id_kec   WHERE ISNULL(uj.deletedAt) and uj.SHAPE is not null ${a}  ORDER BY uj.pembangunan_jali_id DESC   `, function (err, rows, fields) {
if (err) throw err;
    for (let i = 0; i < rows.length; i++) {
      if(rows[i].status=='JALAN LINGKUNGAN'){
        rows[i].color='#ff6600';
      }else if(rows[i].status=='JALAN KOTA'){
        rows[i].color='#00ff00';
      }else if(rows[i].status=='JALAN NASIONAL'){
        rows[i].color='#ff0000';
      }else if(rows[i].status=='JALAN PROVINSI'){
        rows[i].color='#ffff4d';
      }else if(rows[i].status=='JALAN TOL'){
        rows[i].color='#0057A0';
      }else{
        rows[i].color='#ff6600';
      }
      
    }
    //console.log("SELECT asWkt(admin_kec.SHAPE) as geometry FROM admin_kec WHERE MBRContains(GeomFromText( 'POLYGON(("+req.query.kiri_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kanan_lat+","+req.query.kanan_lng+" "+req.query.kiri_lat+","+req.query.kiri_lng+" "+req.query.kiri_lat+"))' ),admin_kec.SHAPE");

    //res.end(JSON.stringify(rows))

    // MySQL query...
    //ambil geojson
    dbgeo.parse({
      "data": rows,
      "outputFormat": "geojson",
      "geometryColumn": "geometry",
      "geometryType": "wkt"
    }, function (error, result) {
      if (error) {
        return console.log(error);
      }
      // This will log a valid GeoJSON object
      // console.log(result)  
      res.send(JSON.stringify(result))
    });
  });


  //connection.end();
})
router.get('/json_kecamatan',async function (req, res) {
  let str = ``
  let val = []
  if (req.query.id_kecamatan) {
    str += ' and id_kecamatan=?'
    val.push(req.query.id_kecamatan)
  }
  console.log(str);
  
  let rows =  await sql_enak.raw(`SELECT a.*,asWkt(a.SHAPE) as geometry FROM kecamatan a where  deleted = 0 `+str,val)
  dbgeo.parse({
    "data": rows[0],
    "outputFormat": "geojson",
    "geometryColumn": "geometry",
    "geometryType": "wkt"
  }, function (error, result) {
    if (error) {
      return console.log(error);
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="data.geojson"'
    );

    // Mengirimkan JSON sebagai file yang dapat diunduh
    res.send(JSON.stringify(result, null, 2));
  });
})
router.get('/json_kelurahan',async function (req, res) {
  let str = ``
  let val = []
  if (req.query.id_kecamatan) {
    str += ' and id_kecamatan=?'
    val.push(req.query.id_kecamatan)
  }
  if (req.query.id_kelurahan) {
    str += ' and id_kelurahan=?'
    val.push(req.query.id_kelurahan)
  }

  
  console.log(str);
  
  let rows =  await sql_enak.raw(`SELECT a.*,asWkt(a.SHAPE) as geometry FROM kelurahan a where deleted = 0 `+str,val)
  dbgeo.parse({
    "data": rows[0],
    "outputFormat": "geojson",
    "geometryColumn": "geometry",
    "geometryType": "wkt"
  }, function (error, result) {
    if (error) {
      return console.log(error);
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="data.geojson"'
    );

    // Mengirimkan JSON sebagai file yang dapat diunduh
    res.send(JSON.stringify(result, null, 2));
  });
})
/* =========================================================
 *  JOIN LAYER: master_retribusi + tiang + kabel
 *  SHAPE = MySQL GEOMETRY → pakai asWkt() + dbgeo.parse
 *  outputFormat = geojson (karena geometri campur)
 * ========================================================= */

// A. Layer MASTER RETRIBUSI (parent) + count child
router.get('/master_retribusi_join', function (req, res) {
  var where = ["m.SHAPE IS NOT NULL"];
  if (req.query.no)     where.push("m.no = "     + connection.escape(req.query.no));
  if (req.query.id_kec) where.push("m.id_kec = " + connection.escape(req.query.id_kec));
  if (req.query.id_kel) where.push("m.id_kel = " + connection.escape(req.query.id_kel));

  var sql = `
    SELECT
      m.id, m.no, m.nm_ruas, m.tk_ruas_aw, m.tk_ruas_ak,
      m.lbr_keras, m.t_k30cm, m.t_l30cm, m.tower_tele,
      m.jr_btk15cm, m.jr_btl15cm, m.jr_atk15cm, m.jr_atl15cm,
      m.kbbt_k15cm, m.kbbt_l15cm, m.jl_pribadi,
      m.usaha_kcl, m.usaha_mngh, m.usaha_bsr, m.brng_lain,
      m.panjang, m.id_kec, m.id_kel,
      (SELECT IFNULL(SUM(t.jumlah_tia),0) FROM tiang t WHERE t.kode_ruas = m.no) AS jml_tiang,
      (SELECT IFNULL(SUM(k.jumlah),0)     FROM kabel k WHERE k.kode_ruas = m.no) AS jml_kabel,
      asWkt(m.SHAPE) AS geometry
    FROM master_retribusi m
    WHERE ${where.join(' AND ')}
  `;

  connection.query(sql, function (err, rows) {
    if (err) { console.log(err); return res.status(500).json({ error: err.message }); }
    dbgeo.parse({
      data: rows,
      outputFormat: "geojson",
      geometryColumn: "geometry",
      geometryType: "wkt"
    }, function (error, result) {
      if (error) { console.log(error); return res.status(500).json({ error: String(error) }); }
      res.json(result);
    });
  });
});

// B. Layer TIANG (child) + info master (nm_ruas)
router.get('/tiang_join', function (req, res) {
  var where = ["t.SHAPE IS NOT NULL", "t.deletedAt IS NULL"];
  if (req.query.no)          where.push("t.kode_ruas = "   + connection.escape(req.query.no));
  if (req.query.kd_kec)      where.push("t.kd_kec = "      + connection.escape(req.query.kd_kec));
  if (req.query.kd_kel)      where.push("t.kd_kel = "      + connection.escape(req.query.kd_kel));
  if (req.query.provider_id) where.push("t.provider_id = " + connection.escape(req.query.provider_id));

  var sql = `
    SELECT
      t.id, t.kode_ruas, t.kode_gps, t.jumlah_tia, t.provider,
      t.t_k30cm, t.t_l30cm, t.kondisi, t.ciri_tiang,
      t.kd_kec, t.kd_kel, t.surveyor,
      m.nm_ruas, m.tk_ruas_aw, m.tk_ruas_ak, m.panjang AS panjang_ruas,
      k.kecamatan, k2.desa,
      asWkt(t.SHAPE) AS geometry
    FROM tiang t
    LEFT JOIN master_retribusi m ON m.no       = t.kode_ruas
    LEFT JOIN kecamatan k        ON k.kec_id   = t.kd_kec
    LEFT JOIN kelurahan k2       ON k2.kel_id  = t.kd_kel
    WHERE ${where.join(' AND ')}
  `;

  connection.query(sql, function (err, rows) {
    if (err) { console.log(err); return res.status(500).json({ error: err.message }); }
    dbgeo.parse({
      data: rows,
      outputFormat: "geojson",
      geometryColumn: "geometry",
      geometryType: "wkt"
    }, function (error, result) {
      if (error) { console.log(error); return res.status(500).json({ error: String(error) }); }
      res.json(result);
    });
  });
});

// C. Layer KABEL (child) + info master
router.get('/kabel_join', function (req, res) {
  var where = ["k.SHAPE IS NOT NULL", "k.deletedAt IS NULL"];
  if (req.query.no)          where.push("k.kode_ruas = "   + connection.escape(req.query.no));
  if (req.query.kd_kec)      where.push("k.kd_kec = "      + connection.escape(req.query.kd_kec));
  if (req.query.kd_kel)      where.push("k.kd_kel = "      + connection.escape(req.query.kd_kel));
  if (req.query.provider_id) where.push("k.provider_id = " + connection.escape(req.query.provider_id));

  var sql = `
    SELECT
      k.id, k.no, k.kode_ruas, k.kode_gps_p, k.kode_gps_u,
      k.provider, k.ciri_kabel, k.jumlah,
      k.jr_atk15cm, k.jr_atl15cm, k.panjang,
      k.kd_kec, k.kd_kel, k.surveyor,
      m.nm_ruas, m.tk_ruas_aw, m.tk_ruas_ak,
      asWkt(k.SHAPE) AS geometry
    FROM kabel k
    LEFT JOIN master_retribusi m ON m.no = k.kode_ruas
    WHERE ${where.join(' AND ')}
  `;

  connection.query(sql, function (err, rows) {
    if (err) { console.log(err); return res.status(500).json({ error: err.message }); }
    dbgeo.parse({
      data: rows,
      outputFormat: "geojson",
      geometryColumn: "geometry",
      geometryType: "wkt"
    }, function (error, result) {
      if (error) { console.log(error); return res.status(500).json({ error: String(error) }); }
      res.json(result);
    });
  });
});
module.exports = router;
