const nodemailer = require('nodemailer')
var connection = require('../database').connection;
var sql_enak = require('../database/mysql_enak.js').connection;

const ejs = require('ejs');
const path = require('path');
// lampiran (opsional): [{ filename, path }] sesuai format attachments nodemailer
const email = function (email, subject, isi, lampiran) {
    // Pengiriman email dinonaktifkan sementara: login Gmail pengirim ditolak (EAUTH 534-5.7.9, perlu App Password).
    // Aktifkan lagi dengan membuka komentar di bawah setelah kredensial diperbarui.
    console.log('[email nonaktif] ke: ' + email + ' | subjek: ' + subject);
    return ''
    // var transporter = nodemailer.createTransport({
    //     service: 'Gmail',
    //     auth: {
    //      user: 'dsr010192@gmail.com',
    //      pass: 'utxobdjezzlrzeln'
    //     }
    //     });
    // var mainOptions = {
    //     from: 'Service Desk BRI Insurance',
    //     to:email,
    //     subject: subject,
    //     html: isi,
    //     attachments: lampiran || []
    // };
    // let a =''
    // transporter.sendMail(mainOptions, function (err, info) {
    //     if (err) {
    //         console.log(err);
    //         a = err
    //     } else {
    //         console.log('Message sent: ' + info.response + ' else');
    //         a = 'Message sent: ' + info.response
    //     }
    // });
    // console.log(a);
    // return a

}
module.exports = {
    email
}
