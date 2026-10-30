
/*
 * GET home page.
 */
// import database

 var mysql      = require('mysql');

module.exports.connection = mysql.createPool({
  host     : '147.139.167.33',
  user     : 'root',
  port	   : '3306',
  password : 'Grafika9',
  database : '2026_jut_tegal'
});
