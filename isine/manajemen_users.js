var connection = require('../database').connection;
var express = require('express');
var router = express.Router();
var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , static = require('serve-static')
  , bodyParser = require('body-parser')
  , session = require('express-session')
  , cookieParser = require('cookie-parser')
  , path = require('path')
  ,  sha1 = require('sha1');
  var regex = /^[a-zA-Z0-9_\s]+$/;
  var sql_enak = require('../database/mysql_enak.js').connection;

 var cek_login = require('./login').cek_login;
var dbgeo = require("dbgeo");
var multer = require("multer");

path.join(__dirname, '/foto')
  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: true }));

  router.use(cookieParser() );
  router.use(session({ secret: 'bhagasitukeren', cookie: { maxAge : 1200000 },saveUninitialized: true, resave: true }));
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
    cb(null, 'foto/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now()+'-'+file.originalname)
  }
})

var upload = multer({ storage: storage })

//start-------------------------------------
router.get('/',cek_login, function(req, res) {
           res.render('content-backoffice/manajemen_user/list',{user:req.user[0]}); 
});

router.get('/insert', cek_login, function(req, res) {
    res.render('content-backoffice/manajemen_user/insert',{user:req.user[0]});
});

router.get('/edit/:id', cek_login, function(req, res) {
     res.render('content-backoffice/manajemen_user/edit', {id : req.params.id,user:req.user[0]});
  })
  router.post('/insert', upload.fields([{ name: 'foto_1', maxCount: 1 }, { name: 'foto_2', maxCount: 1 }]),async function(req, res) {

    let post = req.body
    let sql2 = `SELECT  *  FROM user p where username = ? `
    let user_cek =await sql_enak.raw(sql2,[post["username"]])
    if (user_cek[0].length==0) {
      
    if (post.pwd) {
      post.pwd = sha1(post.pwd)
    }
   if (req.files) {
    if (req.files['foto_1']) {
      var nama_file = req.files['foto_1'][0].filename;
      post['foto_1'] = nama_file;
    }
  
    if (req.files['foto_2']) {
      var nama_file = req.files['foto_2'][0].filename;
      post['foto_2'] = nama_file;
    }
  }
  await sql_enak.insert(post).into('user').then(data=>{
      res.status(200).json({ status: 200, message: "sukses", data: data})
   })
   .catch(err=>{
    console.log(err,'err');
      res.status(500).json({ status: 500, message: "gagal", data: err})
   })
  }else{
    res.status(500).json({ status: 500, message: "gagal", data: 'User Name Telah Terpakai'})

  }

  });
  
  router.post('/edit', upload.fields([{ name: 'foto_1', maxCount: 1 }, { name: 'foto_2', maxCount: 1 }]),async function(req, res) {
    let post = req.body
    if (post.pwd) {
      post.pwd = sha1(post.pwd)
    }
    if (req.files) {
      if (req.files['foto_1']) {
        var nama_file = req.files['foto_1'][0].filename;
        post['foto_1'] = nama_file;
      }
    
      if (req.files['foto_2']) {
        var nama_file = req.files['foto_2'][0].filename;
        post['foto_2'] = nama_file;
      }
    }
    try {
      console.log('data');

      await sql_enak('user').where('id_user','=',post.id_user).update(post).then(data=>{
        console.log('data2');

        console.log(data);
        
        res.status(200).json({ status: 200, message: "sukses", data: data})
     })
    } catch (error) {
      console.log('error');
      
      console.log(error);
      
      res.status(500).json({ status: 500, message: "gagal", data: error})
    }

  //  .catch(err=>{
  //   console.log(err);
    
  //     res.status(500).json({ status: 500, message: "gagal", data: err})
  //  })
  })
  router.get('/hapus/:id',async function(req, res) {
    await sql_enak('user').where('id_user','=',req.params.id).update({deleted:1}).then(data=>{
      res.status(200).json({ status: 200, message: "sukses", data: data[0]})
   })
   .catch(err=>{
      res.status(500).json({ status: 500, message: "gagal", data: err})
   })
  })
  router.get('/list',async function(req, res) {
    let value = [0]
    let counter_set = 0
    let str =' and p.id_user > ?'
    let a = `  *   `
    if (req.query.id_user) {
        str += ' and p.id_user = ?'
        if (!regex.test()) {
          counter_set++
        }
        value.push(req.query.id_user)
    }
      str+='  ORDER BY p.id_user DESC '
  
    if (req.query.limit) {
      str += ` limit ? `
      if (!regex.test()) {
        counter_set++
      }
      value.push(req.query.limit)
  
    }
    if (req.query.offset) {
      str += ` offset ? `
      if (!regex.test()) {
        counter_set++
      }
      value.push(req.query.offset)
    }
  
    let sql = `SELECT  ${a}  FROM user p WHERE p.deleted = 0  `+str
    if (counter_set==0) {
      await sql_enak.raw(sql,value).then(data=>{
        res.status(200).json({ status: 200, message: "sukses", data: data[0]})
     })
     .catch(err=>{
      console.log(err);
        res.status(500).json({ status: 500, message: "gagal", data: err})
     })
    }else{
      res.json({res:500,message:'Invalid Data Input Please Cek Again!!!'})
    }
  })

  router.get('/perusahaan/:id', cek_login, function(req, res) {
      res.render('content-backoffice/manajemen_user/perusahaan',{user:req.user[0],id:req.params.id});
  });

  router.get('/vendor/:id', cek_login, function(req, res) {
      res.render('content-backoffice/manajemen_user/vendor',{user:req.user[0],id:req.params.id});
  });

  router.get('/provider/:id', cek_login, function(req, res) {
      res.render('content-backoffice/manajemen_user/provider',{user:req.user[0],id:req.params.id});
  });
    router.get('/perusahaan_provider/:id', cek_login, function(req, res) {
      res.render('content-backoffice/manajemen_user/perusahaan_provider',{user:req.user[0],id:req.params.id});
  });

module.exports = router;
