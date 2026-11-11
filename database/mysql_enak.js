 module.exports.connection = require('knex')({
  client: 'mysql2',
  connection: {
    host : '147.139.167.33',
    user : 'root',
    port: '33061',
    password : 'grafika9',
    database : '2026_jut_tegal'
  },
  pool: {
    // samakan sql_mode dengan server lama (MySQL 5.7), default MySQL 8.4 jauh lebih ketat
    afterCreate: function (conn, done) {
      conn.query("SET SESSION sql_mode = 'IGNORE_SPACE'", function (err) {
        done(err, conn);
      });
    }
  }
});