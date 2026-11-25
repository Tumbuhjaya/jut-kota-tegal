// Pengingat permohonan izin jaringan utilitas yang belum selesai setelah persetujuan prinsip terbit.
// Hari ke-21 s.d. ke-28 sejak tanggal persetujuan prinsip: email ke pemohon, maksimal sekali per hari.
// Belum selesai = status masih 'diajukan' (belum disetujui / ditolak).
// Matikan dengan env PENGINGAT_PP=0 (mis. saat menjalankan aplikasi lokal yang terhubung ke database server).
var CronJob = require('cron').CronJob;
var sql_enak = require('../database/mysql_enak.js').connection;
var tahapan = require('./tahapan_perizinan.js');

var HARI_MULAI = 21;
var HARI_AKHIR = 28;

// Tahap di mana pemohon masih harus melengkapi persyaratan persetujuan prinsip
var TAHAP_PERSYARATAN = ['persetujuan_prinsip', 'verifikasi_persyaratan'];

async function kirimPengingat() {
  var [rows] = await sql_enak.raw(
    `SELECT p.*, pp.permohonan_persetujuan_prinsip_id, pp.no_pp, pp.tanggal_pp,
            DATEDIFF(CURDATE(), pp.tanggal_pp) AS hari
       FROM permohonan p
       JOIN permohonan_persetujuan_prinsip pp ON pp.permohonan_id = p.permohonan_id
      WHERE p.deletedAt IS NULL AND p.status = 'diajukan'
        AND pp.uploadTtdAt IS NOT NULL
        AND DATEDIFF(CURDATE(), pp.tanggal_pp) BETWEEN ? AND ?
        AND (pp.pengingat_terakhir IS NULL OR pp.pengingat_terakhir < CURDATE())`,
    [HARI_MULAI, HARI_AKHIR]
  );
  for (var i = 0; i < rows.length; i++) {
    var p = rows[i];
    // Tandai dulu agar tidak terkirim dua kali bila ada lebih dari satu server yang menjalankan job ini
    var [klaim] = await sql_enak.raw(
      `UPDATE permohonan_persetujuan_prinsip
          SET pengingat_terakhir = CURDATE(), pengingat_jumlah = pengingat_jumlah + 1
        WHERE permohonan_persetujuan_prinsip_id = ? AND (pengingat_terakhir IS NULL OR pengingat_terakhir < CURDATE())`,
      [p.permohonan_persetujuan_prinsip_id]
    );
    if (!klaim.affectedRows) continue;

    var sisa = HARI_AKHIR - p.hari;
    var link = TAHAP_PERSYARATAN.indexOf(p.tahap) !== -1 ? tahapan.urlPersyaratan(null, p) : null;
    await tahapan.kirimNotifikasi(p, 'Pengingat Penyelesaian Permohonan',
      '<p>Persetujuan prinsip atas permohonan Anda dengan nomor <b>' + tahapan.escHtml(p.no_pp || '-') + '</b> ' +
      'telah terbit <b>' + p.hari + ' hari</b> yang lalu, namun proses permohonan izin Anda <b>belum selesai</b>.</p>' +
      '<p>Mohon segera melengkapi persyaratan dan menyelesaikan proses permohonan' +
      (sisa > 0 ? ' dalam <b>' + sisa + ' hari</b> ke depan.' : ' hari ini.') + '</p>' +
      (link ? '<p>Lengkapi persyaratan melalui link berikut:<br/><a href="' + link + '">' + link + '</a></p>' : ''));
  }
  if (rows.length) console.log('[pengingat_pp] diproses ' + rows.length + ' permohonan');
}

function jalankan() {
  kirimPengingat().catch(function (err) { console.log('[pengingat_pp]', err); });
}

function mulai() {
  if (process.env.PENGINGAT_PP === '0') return console.log('[pengingat_pp] dimatikan (PENGINGAT_PP=0)');
  // Setiap hari pukul 08:00 WIB
  new CronJob('0 0 8 * * *', jalankan, null, true, 'Asia/Jakarta');
  // Susulan saat server baru menyala (mis. restart setelah jam 08:00); sudah terkirim hari ini akan dilewati
  setTimeout(jalankan, 60 * 1000);
}

module.exports = {
  HARI_MULAI: HARI_MULAI,
  HARI_AKHIR: HARI_AKHIR,
  kirimPengingat: kirimPengingat,
  mulai: mulai
};
