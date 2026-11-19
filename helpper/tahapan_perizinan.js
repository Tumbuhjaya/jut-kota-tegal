// Tahapan backoffice permohonan izin jaringan utilitas:
// verifikasi -> peninjauan lapangan (berita acara) -> persetujuan prinsip -> verifikasi persyaratan
// -> penerbitan izin (perjanjian sewa -> SK, lihat helpper/permohonan.js -> upload izin TTD)
var path = require('path');
var fs = require('fs');
var multer = require('multer');
var sql_enak = require('../database/mysql_enak.js').connection;
var helper = require('./permohonan.js');
var email = require('./email.js');

// Satu folder dengan dokumen persyaratan (di luar public)
var DIR_DOKUMEN = path.join(__dirname, '..', 'uploads', 'permohonan');

var TAHAP = {
  verifikasi: 'Verifikasi',
  peninjauan_lapangan: 'Peninjauan Lapangan',
  persetujuan_prinsip: 'Persetujuan Prinsip',
  verifikasi_persyaratan: 'Verifikasi Persyaratan',
  penerbitan_izin: 'Penerbitan Izin'
};

var KELAYAKAN = { layak: 'Layak', tidak_layak: 'Tidak Layak' };

var JUMLAH_FOTO = 6;
var FIELD_FOTO = [];
for (var i = 1; i <= JUMLAH_FOTO; i++) FIELD_FOTO.push('foto_' + i);

function buatUpload(ekstensi, pesan, fields) {
  return multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) { cb(null, DIR_DOKUMEN); },
      filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.fieldname + path.extname(file.originalname).toLowerCase());
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
      if (fields.indexOf(file.fieldname) === -1) return cb(new Error('Field file tidak dikenal'));
      if (ekstensi.indexOf(path.extname(file.originalname).toLowerCase()) === -1) return cb(new Error(pesan));
      cb(null, true);
    }
  }).fields(fields.map(function (f) { return { name: f, maxCount: 1 }; }));
}

// Foto dokumentasi ditampilkan di cetak BA, jadi hanya gambar
var upload_foto = buatUpload(['.jpg', '.jpeg', '.png'], 'Foto dokumentasi harus JPG / PNG', FIELD_FOTO);
var upload_ttd = buatUpload(['.pdf', '.jpg', '.jpeg', '.png'], 'File harus PDF / JPG / PNG', ['file']);

// Bungkus multer agar error upload dikembalikan sebagai JSON
function pakaiUpload(upload) {
  return function (req, res, next) {
    upload(req, res, function (err) {
      if (err) return res.status(400).json({ status: 400, message: err.message, data: null });
      next();
    });
  };
}

function hapusFile(nama_file) {
  if (!nama_file) return;
  fs.unlink(path.join(DIR_DOKUMEN, path.basename(nama_file)), function () {});
}

// File upload (inline = tampil di browser, mis. foto pada halaman cetak)
function kirimFile(res, nama_file, nama_asli, inline) {
  var file = nama_file && path.join(DIR_DOKUMEN, path.basename(nama_file));
  if (!file || !fs.existsSync(file)) return res.status(404).send('File tidak ditemukan');
  if (inline) return res.sendFile(file);
  res.download(file, nama_asli || nama_file);
}

// Rekap permohonan per tahap + data berita acara & persetujuan prinsip
function sqlListTahap() {
  return `
    SELECT x.*,
           pl.tim_teknis, pl.no_ba, pl.tanggal_ba, pl.kelayakan, pl.file_ba, pl.uploadBaAt,
           (pl.permohonan_peninjauan_id IS NOT NULL) AS ada_ba,
           pp.no_pp, pp.tanggal_pp, pp.file_ttd AS file_pp, pp.uploadTtdAt AS uploadPpAt, pp.keterangan_persyaratan,
           (pp.permohonan_persetujuan_prinsip_id IS NOT NULL) AS ada_pp
      FROM (${helper.SQL_REKAP}) x
      LEFT JOIN permohonan_peninjauan pl ON pl.permohonan_id = x.permohonan_id
      LEFT JOIN permohonan_persetujuan_prinsip pp ON pp.permohonan_id = x.permohonan_id`;
}

// tahap: satu tahap / beberapa tahap; status: daftar status permohonan yang ditampilkan
async function listTahap(tahap, status) {
  tahap = [].concat(tahap);
  function isian(a) { return a.map(function () { return '?'; }).join(','); }
  var [rows] = await sql_enak.raw(
    sqlListTahap() + ` WHERE x.tahap IN (${isian(tahap)}) AND x.status IN (${isian(status)})
      ORDER BY FIELD(x.status, 'diajukan') DESC, x.diajukanAt ASC`,
    tahap.concat(status)
  );
  return rows;
}

// ---------------- Peninjauan lapangan ----------------
async function getPeninjauan(permohonan_id) {
  var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_peninjauan WHERE permohonan_id = ?`, [permohonan_id]);
  if (!rows.length) return null;
  var [foto] = await sql_enak.raw(
    `SELECT permohonan_peninjauan_foto_id, urutan, nama_asli FROM permohonan_peninjauan_foto
      WHERE permohonan_peninjauan_id = ? ORDER BY urutan`,
    [rows[0].permohonan_peninjauan_id]
  );
  rows[0].foto = foto;
  return rows[0];
}

// Buat / ubah draft BA; foto yang diupload mengganti slot urutan yang sama
async function simpanPeninjauan(permohonan_id, b, files, id_user) {
  var kolom = [b.tim_teknis || null, b.no_ba || null, b.tanggal_ba || null,
    b.no_surat_permohonan || null, b.tanggal_surat_permohonan || null, b.hasil || null, b.kelayakan || null];
  var ada = await getPeninjauan(permohonan_id);
  var id;
  if (ada) {
    id = ada.permohonan_peninjauan_id;
    await sql_enak.raw(
      `UPDATE permohonan_peninjauan
          SET tim_teknis = ?, no_ba = ?, tanggal_ba = ?, no_surat_permohonan = ?, tanggal_surat_permohonan = ?, hasil = ?,
              kelayakan = ?, lastUpdateAt = NOW()
        WHERE permohonan_peninjauan_id = ?`,
      kolom.concat([id])
    );
  } else {
    var [hasil] = await sql_enak.raw(
      `INSERT INTO permohonan_peninjauan
         (permohonan_id, tim_teknis, no_ba, tanggal_ba, no_surat_permohonan, tanggal_surat_permohonan, hasil, kelayakan, dibuat_oleh, insertedAt, lastUpdateAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [permohonan_id].concat(kolom, [id_user])
    );
    id = hasil.insertId;
  }

  for (var i = 0; i < FIELD_FOTO.length; i++) {
    var f = files && files[FIELD_FOTO[i]] && files[FIELD_FOTO[i]][0];
    if (!f) continue;
    var [lama] = await sql_enak.raw(
      `SELECT nama_file FROM permohonan_peninjauan_foto WHERE permohonan_peninjauan_id = ? AND urutan = ?`, [id, i + 1]);
    if (lama.length) hapusFile(lama[0].nama_file);
    await sql_enak.raw(
      `INSERT INTO permohonan_peninjauan_foto (permohonan_peninjauan_id, urutan, nama_file, nama_asli, insertedAt, lastUpdateAt)
       VALUES (?, ?, ?, ?, NOW(), NOW()) AS baru
       ON DUPLICATE KEY UPDATE nama_file = baru.nama_file, nama_asli = baru.nama_asli, lastUpdateAt = NOW()`,
      [id, i + 1, f.filename, f.originalname]
    );
  }
  return id;
}

async function hapusFotoPeninjauan(permohonan_id, urutan) {
  var [rows] = await sql_enak.raw(
    `SELECT f.permohonan_peninjauan_foto_id, f.nama_file FROM permohonan_peninjauan_foto f
       JOIN permohonan_peninjauan pl ON pl.permohonan_peninjauan_id = f.permohonan_peninjauan_id
      WHERE pl.permohonan_id = ? AND f.urutan = ?`,
    [permohonan_id, urutan]
  );
  if (!rows.length) return;
  hapusFile(rows[0].nama_file);
  await sql_enak.raw(`DELETE FROM permohonan_peninjauan_foto WHERE permohonan_peninjauan_foto_id = ?`, [rows[0].permohonan_peninjauan_foto_id]);
}

// ---------------- Persetujuan prinsip ----------------
async function getPersetujuan(permohonan_id) {
  var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_persetujuan_prinsip WHERE permohonan_id = ?`, [permohonan_id]);
  return rows[0] || null;
}

async function simpanPersetujuan(permohonan_id, b, id_user) {
  var kolom = [b.no_pp || null, b.tanggal_pp || null, b.persyaratan || null];
  var ada = await getPersetujuan(permohonan_id);
  if (ada) {
    await sql_enak.raw(
      `UPDATE permohonan_persetujuan_prinsip SET no_pp = ?, tanggal_pp = ?, persyaratan = ?, lastUpdateAt = NOW()
        WHERE permohonan_persetujuan_prinsip_id = ?`,
      kolom.concat([ada.permohonan_persetujuan_prinsip_id])
    );
    return ada.permohonan_persetujuan_prinsip_id;
  }
  var [hasil] = await sql_enak.raw(
    `INSERT INTO permohonan_persetujuan_prinsip (permohonan_id, no_pp, tanggal_pp, persyaratan, dibuat_oleh, insertedAt, lastUpdateAt)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [permohonan_id].concat(kolom, [id_user])
  );
  return hasil.insertId;
}

// Persyaratan persetujuan prinsip terpenuhi -> lanjut ke penerbitan izin;
// belum terpenuhi -> tetap di tahap verifikasi persyaratan, keterangan dikirim ke pemohon
async function simpanVerifikasiPersyaratan(permohonan_id, lanjut, keterangan, id_user) {
  await sql_enak.raw(
    `UPDATE permohonan_persetujuan_prinsip
        SET keterangan_persyaratan = ?, persyaratanAt = ?, persyaratan_oleh = ?, lastUpdateAt = NOW()
      WHERE permohonan_id = ?`,
    [keterangan || null, lanjut ? new Date() : null, id_user, permohonan_id]
  );
  if (lanjut) await pindahTahap(permohonan_id, 'penerbitan_izin');
}

// ---------------- Perjanjian sewa (tahap penerbitan izin, sebelum SK) ----------------
async function getPerjanjianSewa(permohonan_id) {
  var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_perjanjian_sewa WHERE permohonan_id = ?`, [permohonan_id]);
  return rows[0] || null;
}

async function simpanPerjanjianSewa(permohonan_id, b, id_user) {
  var kolom = [b.no_perjanjian || null, b.tanggal_perjanjian || null, b.isi || null];
  var ada = await getPerjanjianSewa(permohonan_id);
  if (ada) {
    await sql_enak.raw(
      `UPDATE permohonan_perjanjian_sewa SET no_perjanjian = ?, tanggal_perjanjian = ?, isi = ?, lastUpdateAt = NOW()
        WHERE permohonan_perjanjian_sewa_id = ?`,
      kolom.concat([ada.permohonan_perjanjian_sewa_id])
    );
    return ada.permohonan_perjanjian_sewa_id;
  }
  var [hasil] = await sql_enak.raw(
    `INSERT INTO permohonan_perjanjian_sewa (permohonan_id, no_perjanjian, tanggal_perjanjian, isi, dibuat_oleh, insertedAt, lastUpdateAt)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [permohonan_id].concat(kolom, [id_user])
  );
  return hasil.insertId;
}

// ---------------- Perpindahan tahap ----------------
async function pindahTahap(permohonan_id, tahap) {
  await sql_enak.raw(`UPDATE permohonan SET tahap = ?, lastUpdateAt = NOW() WHERE permohonan_id = ?`, [tahap, permohonan_id]);
}

// Upload dokumen bertanda tangan, lalu (jika ada) permohonan lanjut ke tahap berikutnya.
// cfg: tabel, kolom file & nama asli & waktu upload, tahap berikutnya
var UPLOAD_TTD = {
  ba: { tabel: 'permohonan_peninjauan', file: 'file_ba', asli: 'nama_asli_ba', waktu: 'uploadBaAt', lanjut: 'persetujuan_prinsip' },
  pp: { tabel: 'permohonan_persetujuan_prinsip', file: 'file_ttd', asli: 'nama_asli_ttd', waktu: 'uploadTtdAt', lanjut: 'verifikasi_persyaratan' },
  sewa: { tabel: 'permohonan_perjanjian_sewa', file: 'file_ttd', asli: 'nama_asli_ttd', waktu: 'uploadTtdAt', lanjut: null },
  sk: { tabel: 'permohonan', file: 'file_sk', asli: 'nama_asli_sk', waktu: 'uploadSkAt', lanjut: null }
};

async function simpanTtd(jenis, permohonan_id, file) {
  var cfg = UPLOAD_TTD[jenis];
  var [lama] = await sql_enak.raw(`SELECT ${cfg.file} AS nama_file FROM ${cfg.tabel} WHERE permohonan_id = ?`, [permohonan_id]);
  if (lama.length) hapusFile(lama[0].nama_file);
  await sql_enak.raw(
    `UPDATE ${cfg.tabel} SET ${cfg.file} = ?, ${cfg.asli} = ?, ${cfg.waktu} = NOW(), lastUpdateAt = NOW() WHERE permohonan_id = ?`,
    [file.filename, file.originalname, permohonan_id]
  );
  if (cfg.lanjut) await pindahTahap(permohonan_id, cfg.lanjut);
}

// Data halaman cetak BA / persetujuan prinsip / perjanjian sewa: detail + total retribusi (seperti SK) + dokumen tahapan
async function getDataCetak(permohonan) {
  var data = await helper.getDataSk(permohonan);
  data.peninjauan = await getPeninjauan(permohonan.permohonan_id);
  data.persetujuan = await getPersetujuan(permohonan.permohonan_id);
  data.perjanjian_sewa = await getPerjanjianSewa(permohonan.permohonan_id);
  return data;
}

// ---------------- Notifikasi email ke pemohon ----------------
function escHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// File upload sebagai lampiran email (null jika file tidak ada)
function lampiran(nama_file, nama_asli) {
  var file = nama_file && path.join(DIR_DOKUMEN, path.basename(nama_file));
  if (!file || !fs.existsSync(file)) return null;
  return { filename: nama_asli || nama_file, path: file };
}

// isi: potongan HTML (teks isian pengguna harus sudah di-escape); berkas: [{ filename, path }]
// Gagal kirim hanya dicatat di log agar proses tahapan tetap berjalan
async function kirimNotifikasi(permohonan, judul, isi, berkas) {
  try {
    var tujuan = permohonan.email_pemohon;
    if (!tujuan) {
      var [v] = await sql_enak.raw(`SELECT email FROM user WHERE id_user = ?`, [permohonan.id_user]);
      tujuan = v[0] && v[0].email;
    }
    if (!tujuan) return console.log('Notifikasi permohonan ' + permohonan.permohonan_id + ' tidak terkirim: email pemohon kosong');
    var html =
      '<p>Yth. ' + escHtml(permohonan.nama_pemohon || 'Pemohon') + ',</p>' +
      isi +
      '<p>Nomor permohonan: <b>' + permohonan.permohonan_id + '</b></p>' +
      '<p>Terima kasih.<br/>' + escHtml(helper.KONFIG_SK.instansi) + '<br/>' + escHtml(helper.KONFIG_SK.pemerintah) + '</p>';
    email.email(tujuan, judul + ' - Permohonan Izin Jaringan Utilitas', html, (berkas || []).filter(Boolean));
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  TAHAP: TAHAP,
  KELAYAKAN: KELAYAKAN,
  JUMLAH_FOTO: JUMLAH_FOTO,
  upload_foto: pakaiUpload(upload_foto),
  upload_ttd: pakaiUpload(upload_ttd),
  hapusFile: hapusFile,
  kirimFile: kirimFile,
  listTahap: listTahap,
  getPeninjauan: getPeninjauan,
  simpanPeninjauan: simpanPeninjauan,
  hapusFotoPeninjauan: hapusFotoPeninjauan,
  getPersetujuan: getPersetujuan,
  simpanPersetujuan: simpanPersetujuan,
  simpanVerifikasiPersyaratan: simpanVerifikasiPersyaratan,
  getPerjanjianSewa: getPerjanjianSewa,
  simpanPerjanjianSewa: simpanPerjanjianSewa,
  pindahTahap: pindahTahap,
  simpanTtd: simpanTtd,
  getDataCetak: getDataCetak,
  escHtml: escHtml,
  lampiran: lampiran,
  kirimNotifikasi: kirimNotifikasi
};
