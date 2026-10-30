 module.exports.connection = require('knex')({
  client: 'mysql',
  connection: {
    host : '147.139.167.33',
    user : 'root',
    port: '3306',
    password : 'Grafika9',
    database : '2026_jut_tegal'
  }
});