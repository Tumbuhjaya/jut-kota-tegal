var express = require('express');
var router = express.Router();
var passport = require('passport')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser');
var sql_enak = require('../database/mysql_enak.js').connection;
var helper = require('../helpper/permohonan.js');
var tahapan = require('../helpper/tahapan_perizinan.js');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

function getUser(req) {
  return (req.user && req.user[0]) ? req.user[0] : null;
}

// Hanya administrator (is_admin = 1) yang memproses permohonan
function cek_admin(req, res, next) {
  var user = getUser(req);
  if (req.isAuthenticated() && user && Number(user.is_admin) === 1) return next();
  if (req.xhr || req.method !== 'GET') return res.status(403).json({ status: 403, message: 'Khusus administrator', data: null });
  res.redirect('/');
}

function gagal(res, err, status) {
  if (err) console.log(err);
  res.status(status || 500).json({ status: status || 500, message: (err && err.message) || err || 'gagal', data: null });
}

var AKSI = { setujui: 'disetujui', tolak: 'ditolak', revisi: 'revisi' };
// Status yang masih boleh diproses admin
var BISA_DIPROSES = ['diajukan', 'disetujui', 'ditolak'];

// ---------------- VIEW ----------------
router.get('/', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/list', { user: getUser(req) });
});

// Admin mengisi permohonan atas nama vendor (?id_user=): buat draft lalu ke halaman edit.
// API simpan / syarat / digitasi memakai /perizinan/jaringan_utilitas/api yang juga melayani admin.
router.get('/insert', cek_admin, async function (req, res) {
  try {
    var [v] = await sql_enak.raw(
      `SELECT id_user, fullname, telp, email FROM user WHERE id_user = ? AND is_admin = 3 AND deleted = 0`,
      [req.query.id_user || 0]
    );
    if (!v.length) return res.redirect('/manajemen_perizinan');
    var id = await helper.buatDraft(v[0], getUser(req).id_user);
    res.redirect('/manajemen_perizinan/edit/' + id);
  } catch (err) {
    console.log(err);
    res.redirect('/manajemen_perizinan');
  }
});

async function localsPengisian(p) {
  var [v] = await sql_enak.raw(`SELECT fullname, username FROM user WHERE id_user = ?`, [p.id_user]);
  return {
    permohonan: p,
    bisa_ubah: helper.bisaUbah(p, true),
    bisa_ajukan: helper.bisaUbah(p),
    kode_wilayah: helper.KODE_WILAYAH,
    komponen: helper.KOMPONEN_RETRIBUSI,
    atas_nama: v[0] ? (v[0].fullname || v[0].username) : '-'
  };
}

router.get('/edit/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) return res.redirect('/manajemen_perizinan');
  var locals = await localsPengisian(p);
  locals.user = getUser(req);
  res.render('content-backoffice/manajemen_perizinan/edit', locals);
});

function viewDigitasi(jenis) {
  return async function (req, res) {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return res.redirect('/manajemen_perizinan');
    var [ruas] = await sql_enak.raw(
      `SELECT r.permohonan_ruas_id, r.ruas_id, mr.nm_ruas FROM permohonan_ruas r
         LEFT JOIN master_retribusi mr ON mr.id = r.ruas_id
        WHERE r.permohonan_ruas_id = ? AND r.permohonan_id = ? AND r.deletedAt IS NULL`,
      [req.params.id_ruas, p.permohonan_id]
    );
    if (!ruas.length) return res.redirect('/manajemen_perizinan/edit/' + p.permohonan_id);
    // Kabel baru bisa didigitasi setelah ruas punya tiang
    var jumlah = await helper.hitungDigitasi(ruas[0].permohonan_ruas_id);
    if (jenis === 'kabel' && !jumlah.tiang && !jumlah.kabel) return res.redirect('/manajemen_perizinan/edit/' + p.permohonan_id);
    // Jalan Lain hanya punya titik dummy: peta tidak di-zoom ke sana
    if (ruas[0].nm_ruas === helper.NAMA_RUAS_LAIN) ruas[0].ruas_id = null;
    var locals = await localsPengisian(p);
    locals.user = getUser(req);
    locals.ruas = ruas[0];
    locals.jenis = jenis;
    res.render('content-backoffice/manajemen_perizinan/digitasi', locals);
  };
}
router.get('/tiang/:id/:id_ruas', cek_admin, viewDigitasi('tiang'));
router.get('/kabel/:id/:id_ruas', cek_admin, viewDigitasi('kabel'));

// Unduh rincian ruas & retribusi satu permohonan sebagai file Excel (.xlsx)
router.get('/export_excel/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return res.status(404).send('Permohonan tidak ditemukan');
    var wb = await helper.buatExcel(await helper.getDataSk(p));
    var nama = 'Permohonan_Izin_' + p.permohonan_id + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nama + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { gagal(res, err); }
});

// Sinkron tiang permohonan ke tabel tiang: peta + list, admin memilih tiang yang diduplikat
router.get('/sinkron_tiang', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/sinkron_tiang', { user: getUser(req) });
});

router.get('/sinkron_tiang/data', cek_admin, async function (req, res) {
  try {
    res.json({ status: 200, message: 'sukses', data: await helper.daftarSinkronTiang(req.query.status) });
  } catch (err) { gagal(res, err); }
});

// ?bbox=barat,selatan,timur,utara -> data utama tiang di area peta (penuh = melebihi batas)
router.get('/sinkron_tiang/tiang', cek_admin, async function (req, res) {
  try {
    var data = await helper.tiangDalamArea(String(req.query.bbox || '').split(','));
    var penuh = data.length > helper.BATAS_TIANG_AREA;
    res.json({ status: 200, message: 'sukses', data: { tiang: data.slice(0, helper.BATAS_TIANG_AREA), penuh: penuh } });
  } catch (err) { gagal(res, err); }
});

// body: { ids: [permohonan_tiang_id, ...] }
router.post('/sinkron_tiang', cek_admin, async function (req, res) {
  try {
    var ids = (req.body && req.body.ids) || [];
    if (!ids.length) return gagal(res, 'Pilih tiang yang akan diduplikat', 400);
    res.json({ status: 200, message: 'sukses', data: { masuk: await helper.sinkronTiang(ids) } });
  } catch (err) { gagal(res, err); }
});

router.get('/detail/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status === 'draft') return res.redirect('/manajemen_perizinan');
  res.render('content-backoffice/manajemen_perizinan/detail', { user: getUser(req), permohonan_id: p.permohonan_id, komponen: helper.KOMPONEN_RETRIBUSI });
});

// ---------------- API ----------------
// Draft hanya tampil jika difilter status 'draft' (draft vendor yang belum diajukan + isian admin)
router.post('/list', cek_admin, async function (req, res) {
  try {
    var sql = helper.SQL_REKAP;
    var val = [];
    if (req.body.status) { sql += ` AND p.status = ?`; val.push(req.body.status); }
    else sql += ` AND p.status <> 'draft'`;
    var [data] = await sql_enak.raw(sql + ` ORDER BY FIELD(p.status, 'diajukan') DESC, IFNULL(p.diajukanAt, p.insertedAt) DESC`, val);
    data.forEach(function (d) {
      d.bisa_ubah = helper.bisaUbah(d);
      d.bisa_edit = helper.bisaUbah(d, true);
    });
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

// Pilihan vendor saat admin mengisi permohonan atas nama vendor
router.get('/vendor', cek_admin, async function (req, res) {
  try {
    var [data] = await sql_enak.raw(
      `SELECT id_user, username, fullname FROM user WHERE is_admin = 3 AND deleted = 0 ORDER BY fullname ASC, username ASC`
    );
    res.json({ status: 200, message: 'sukses', data: data });
  } catch (err) { gagal(res, err); }
});

router.get('/cetak_sk/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status !== 'disetujui') return res.status(404).send('SK belum tersedia');
  res.render('content-backoffice/manajemen_perizinan/cetak_sk', await helper.getDataSk(p));
});

router.get('/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p || p.status === 'draft') return gagal(res, 'Permohonan tidak ditemukan', 404);
    var detail = await helper.getDetail(p);
    detail.digitasi = await helper.getDigitasi(p.permohonan_id);
    detail.perjanjian_sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
    res.json({ status: 200, message: 'sukses', data: detail });
  } catch (err) { gagal(res, err); }
});

router.get('/dokumen/:id_dokumen', cek_admin, async function (req, res) {
  try {
    var [rows] = await sql_enak.raw(`SELECT * FROM permohonan_dokumen WHERE permohonan_dokumen_id = ?`, [req.params.id_dokumen]);
    helper.kirimDokumen(res, rows[0]);
  } catch (err) { gagal(res, err); }
});

// body: { aksi: setujui | tolak | revisi, no_sk, tanggal_sk, keterangan }
router.post('/proses/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    var status = AKSI[b.aksi];
    if (!status) return gagal(res, 'Aksi tidak dikenal', 400);
    var p = await helper.getPermohonan(req.params.id);
    if (!p || BISA_DIPROSES.indexOf(p.status) === -1) return gagal(res, 'Permohonan tidak bisa diproses', 400);
    // SK baru bisa terbit setelah verifikasi s.d. verifikasi persyaratan selesai dan perjanjian sewa TTD diupload
    if (status === 'disetujui' && p.status === 'diajukan') {
      if (p.tahap !== 'penerbitan_izin') return gagal(res, 'Permohonan masih di tahap ' + tahapan.TAHAP[p.tahap], 400);
      var sewa = await tahapan.getPerjanjianSewa(p.permohonan_id);
      if (!sewa || !sewa.file_ttd) return gagal(res, 'Upload perjanjian sewa yang sudah ditandatangani terlebih dahulu', 400);
    }
    if (status === 'disetujui' && !b.no_sk) return gagal(res, 'No. SK wajib diisi', 400);
    if (status !== 'disetujui' && !b.keterangan) return gagal(res, 'Keterangan wajib diisi', 400);

    // Disetujui -> digitasi masuk ke tabel tiang & kabel; dicabut -> salinannya dihapus lagi
    var masuk = null;
    if (status === 'disetujui') masuk = await helper.salinKeDataUtama(p.permohonan_id);
    else if (p.status === 'disetujui') await helper.hapusDariDataUtama(p.permohonan_id);

    await sql_enak.raw(
      `UPDATE permohonan
          SET status = ?, keterangan = ?, no_sk = ?, tanggal_sk = ?,
              diprosesAt = NOW(), diproses_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [status, b.keterangan || null,
       status === 'disetujui' ? b.no_sk : null,
       status === 'disetujui' ? (b.tanggal_sk || null) : null,
       getUser(req).id_user, p.permohonan_id]
    );
    if (status !== 'disetujui') notifikasiDikembalikan(p, status, b.keterangan);
    res.json({ status: 200, message: 'sukses', data: { masuk_data_utama: masuk } });
  } catch (err) { gagal(res, err); }
});



// ================ TAHAPAN: verifikasi -> peninjauan lapangan -> persetujuan prinsip ================
// Permohonan berstatus 'diajukan' berjalan per tahap (permohonan.tahap); tahap terakhir 'penerbitan_izin' = proses SK di atas.

// Permohonan yang sedang berada di `tahap` (status diajukan); null + respon error jika bukan
async function ambilTahap(req, res, tahap) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) { gagal(res, 'Permohonan tidak ditemukan', 404); return null; }
  if (p.status !== 'diajukan' || p.tahap !== tahap) {
    gagal(res, 'Permohonan tidak sedang di tahap ' + tahapan.TAHAP[tahap], 400);
    return null;
  }
  return p;
}

// Email ke pemohon saat permohonan dikembalikan untuk revisi / ditolak
function notifikasiDikembalikan(p, status, keterangan) {
  var tolak = status === 'ditolak';
  tahapan.kirimNotifikasi(p, tolak ? 'Permohonan Ditolak' : 'Permohonan Perlu Revisi',
    '<p>Permohonan izin pemanfaatan ruang milik jalan untuk jaringan utilitas yang Anda ajukan ' +
    (tolak ? '<b>ditolak</b>.' : '<b>dikembalikan untuk direvisi</b>. Silakan perbaiki lalu ajukan kembali.') + '</p>' +
    '<p>Keterangan:<br/>' + tahapan.escHtml(keterangan).replace(/\n/g, '<br/>') + '</p>');
}

function kirimList(tahap, status) {
  return async function (req, res) {
    try {
      res.json({ status: 200, message: 'sukses', data: await tahapan.listTahap(tahap, status) });
    } catch (err) { gagal(res, err); }
  };
}

// ---------------- Permohonan izin (verifikasi) ----------------
router.get('/permohonan', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/permohonan/list', { user: getUser(req) });
});

// Menunggu verifikasi + yang sedang dikembalikan ke vendor untuk revisi
router.post('/permohonan/list', cek_admin, kirimList('verifikasi', ['diajukan', 'revisi']));

router.get('/permohonan/verifikasi/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status === 'draft') return res.redirect('/manajemen_perizinan/permohonan');
  res.render('content-backoffice/manajemen_perizinan/permohonan/verifikasi', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: helper.KOMPONEN_RETRIBUSI,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.JENIS_DOKUMEN
  });
});

// body: { status: diajukan | revisi | tolak | lolos, keterangan }
// lolos -> lanjut ke peninjauan lapangan; revisi -> kembali ke vendor (pengajuan ulang mulai dari verifikasi lagi);
// tolak -> permohonan ditolak. Revisi & tolak dikirim email ke pemohon.
router.post('/permohonan/verifikasi/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    if (['diajukan', 'revisi', 'tolak', 'lolos'].indexOf(b.status) === -1) return gagal(res, 'Status verifikasi tidak dikenal', 400);
    if ((b.status === 'revisi' || b.status === 'tolak') && !b.keterangan) return gagal(res, 'Keterangan wajib diisi', 400);
    var p = await ambilTahap(req, res, 'verifikasi');
    if (!p) return;
    if (b.status === 'diajukan') return res.json({ status: 200, message: 'sukses', data: null });

    if (b.status === 'tolak') {
      await sql_enak.raw(
        `UPDATE permohonan
            SET status = 'ditolak', keterangan = ?, diverifikasiAt = NOW(), diverifikasi_oleh = ?,
                diprosesAt = NOW(), diproses_oleh = ?, lastUpdateAt = NOW()
          WHERE permohonan_id = ?`,
        [b.keterangan, getUser(req).id_user, getUser(req).id_user, p.permohonan_id]
      );
      notifikasiDikembalikan(p, 'ditolak', b.keterangan);
      return res.json({ status: 200, message: 'sukses', data: null });
    }

    await sql_enak.raw(
      `UPDATE permohonan
          SET status = ?, tahap = ?, keterangan = ?, diverifikasiAt = NOW(), diverifikasi_oleh = ?, lastUpdateAt = NOW()
        WHERE permohonan_id = ?`,
      [b.status === 'revisi' ? 'revisi' : 'diajukan',
       b.status === 'revisi' ? 'verifikasi' : 'peninjauan_lapangan',
       b.status === 'revisi' ? b.keterangan : null,
       getUser(req).id_user, p.permohonan_id]
    );
    if (b.status === 'revisi') notifikasiDikembalikan(p, 'revisi', b.keterangan);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// Hapus (soft delete) permohonan yang masih di tahap verifikasi
router.post('/permohonan/hapus/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p || p.tahap !== 'verifikasi' || ['diajukan', 'revisi'].indexOf(p.status) === -1) {
      return gagal(res, 'Hanya permohonan di tahap verifikasi yang bisa dihapus', 400);
    }
    await sql_enak.raw(`UPDATE permohonan SET deletedAt = NOW() WHERE permohonan_id = ?`, [p.permohonan_id]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// ---------------- Peninjauan lapangan (berita acara) ----------------
router.get('/peninjauan_lapangan', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/list', { user: getUser(req), jumlah_foto: tahapan.JUMLAH_FOTO });
});

router.post('/peninjauan_lapangan/list', cek_admin, kirimList('peninjauan_lapangan', ['diajukan']));

// Detail perizinan (peta, tabel ruas, pemohon, dokumen persyaratan) tanpa form verifikasi; data diambil via GET /data/:id
router.get('/peninjauan_lapangan/detail/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status === 'draft') return res.redirect('/manajemen_perizinan/peninjauan_lapangan');
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/detail', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: helper.KOMPONEN_RETRIBUSI,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.JENIS_DOKUMEN
  });
});

router.get('/peninjauan_lapangan/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return gagal(res, 'Permohonan tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: { permohonan: p, peninjauan: await tahapan.getPeninjauan(p.permohonan_id) } });
  } catch (err) { gagal(res, err); }
});

// multipart: tim_teknis, no_ba, tanggal_ba, no_surat_permohonan, tanggal_surat_permohonan, hasil, kelayakan, foto_1..foto_6
router.post('/peninjauan_lapangan/simpan/:id', cek_admin, tahapan.upload_foto, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_ba || !b.tanggal_ba) return gagal(res, 'Nomor & tanggal berita acara wajib diisi', 400);
    if (!tahapan.KELAYAKAN[b.kelayakan]) return gagal(res, 'Hasil peninjauan (layak / tidak layak) wajib dipilih', 400);
    await tahapan.simpanPeninjauan(p.permohonan_id, b, req.files, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.post('/peninjauan_lapangan/hapus_foto/:id/:urutan', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return;
    await tahapan.hapusFotoPeninjauan(p.permohonan_id, req.params.urutan);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/foto/:id/:urutan', cek_admin, async function (req, res) {
  try {
    var [rows] = await sql_enak.raw(
      `SELECT f.nama_file, f.nama_asli FROM permohonan_peninjauan_foto f
         JOIN permohonan_peninjauan pl ON pl.permohonan_peninjauan_id = f.permohonan_peninjauan_id
        WHERE pl.permohonan_id = ? AND f.urutan = ?`,
      [req.params.id, req.params.urutan]
    );
    if (!rows.length) return res.status(404).send('Foto tidak ditemukan');
    tahapan.kirimFile(res, rows[0].nama_file, rows[0].nama_asli, true);
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/cetak/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.peninjauan) return res.status(404).send('Draft berita acara belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/peninjauan_lapangan/cetak', data);
});

// Upload BA bertanda tangan -> lanjut ke persetujuan prinsip (hanya jika hasil peninjauan layak) + email BA ke pemohon.
// Tidak layak -> tetap di tahap peninjauan lapangan untuk ditinjau ulang.
router.post('/peninjauan_lapangan/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File berita acara wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'peninjauan_lapangan');
    if (!p) return tahapan.hapusFile(file.filename);
    var ba = await tahapan.getPeninjauan(p.permohonan_id);
    if (!ba || ba.kelayakan !== 'layak') {
      tahapan.hapusFile(file.filename);
      return gagal(res, ba ? 'Hasil peninjauan tidak layak, lakukan peninjauan ulang terlebih dahulu' : 'Buat draft berita acara terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('ba', p.permohonan_id, file);
    tahapan.kirimNotifikasi(p, 'Berita Acara Hasil Peninjauan Lapangan',
      '<p>Peninjauan lapangan atas permohonan Anda telah dilaksanakan dengan hasil <b>layak</b>. ' +
      'Berita Acara Nomor <b>' + tahapan.escHtml(ba.no_ba) + '</b> terlampir.</p>' +
      '<p>Permohonan dilanjutkan ke tahap Persetujuan Prinsip.</p>',
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/peninjauan_lapangan/file/:id', cek_admin, async function (req, res) {
  try {
    var pl = await tahapan.getPeninjauan(req.params.id);
    if (!pl) return res.status(404).send('Berita acara tidak ditemukan');
    tahapan.kirimFile(res, pl.file_ba, pl.nama_asli_ba);
  } catch (err) { gagal(res, err); }
});

// ---------------- Persetujuan prinsip ----------------
router.get('/persetujuan_prinsip', cek_admin, function (req, res) {
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/list', { user: getUser(req) });
});

// Termasuk yang sudah upload persetujuan prinsip TTD dan menunggu verifikasi persyaratan
router.post('/persetujuan_prinsip/list', cek_admin, kirimList(['persetujuan_prinsip', 'verifikasi_persyaratan'], ['diajukan']));

// Detail perizinan (peta, tabel ruas, pemohon, dokumen persyaratan) tanpa form verifikasi; data diambil via GET /data/:id
router.get('/persetujuan_prinsip/detail/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p || p.status === 'draft') return res.redirect('/manajemen_perizinan/persetujuan_prinsip');
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/detail', {
    user: getUser(req),
    permohonan_id: p.permohonan_id,
    komponen: helper.KOMPONEN_RETRIBUSI,
    kode_wilayah: helper.KODE_WILAYAH,
    jenis_dokumen: helper.JENIS_DOKUMEN
  });
});

router.get('/persetujuan_prinsip/data/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return gagal(res, 'Permohonan tidak ditemukan', 404);
    res.json({ status: 200, message: 'sukses', data: { permohonan: p, persetujuan: await tahapan.getPersetujuan(p.permohonan_id) } });
  } catch (err) { gagal(res, err); }
});

// body: { no_pp, tanggal_pp, persyaratan }
router.post('/persetujuan_prinsip/simpan/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'persetujuan_prinsip');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_pp || !b.tanggal_pp) return gagal(res, 'Nomor & tanggal persetujuan prinsip wajib diisi', 400);
    await tahapan.simpanPersetujuan(p.permohonan_id, b, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/persetujuan_prinsip/cetak/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.persetujuan) return res.status(404).send('Draft persetujuan prinsip belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/persetujuan_prinsip/cetak', data);
});

// Upload persetujuan prinsip bertanda tangan -> lanjut ke verifikasi persyaratan + email beserta persyaratannya
router.post('/persetujuan_prinsip/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File persetujuan prinsip wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'persetujuan_prinsip');
    if (!p) return tahapan.hapusFile(file.filename);
    var pp = await tahapan.getPersetujuan(p.permohonan_id);
    if (!pp) {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Buat draft persetujuan prinsip terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('pp', p.permohonan_id, file);
    // persyaratan = HTML CKEditor isian administrator
    tahapan.kirimNotifikasi(p, 'Persetujuan Prinsip',
      '<p>Permohonan Anda telah mendapatkan Persetujuan Prinsip Nomor <b>' + tahapan.escHtml(pp.no_pp) + '</b> (terlampir).</p>' +
      '<p>Untuk melanjutkan ke penerbitan izin, mohon penuhi persyaratan berikut:</p>' +
      (pp.persyaratan || '<p>-</p>'),
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

// body: { lanjut: '1' | '0', keterangan }
// Lanjut -> penerbitan izin (menu Izin Pemanfaatan Rumija); tidak -> tetap menunggu, keterangan dikirim email ke pemohon
router.post('/persetujuan_prinsip/verifikasi_persyaratan/:id', cek_admin, async function (req, res) {
  try {
    var b = req.body || {};
    var lanjut = b.lanjut === '1';
    if (!lanjut && !b.keterangan) return gagal(res, 'Keterangan persyaratan yang belum dipenuhi wajib diisi', 400);
    var p = await ambilTahap(req, res, 'verifikasi_persyaratan');
    if (!p) return;
    await tahapan.simpanVerifikasiPersyaratan(p.permohonan_id, lanjut, b.keterangan, getUser(req).id_user);
    if (!lanjut) {
      tahapan.kirimNotifikasi(p, 'Persyaratan Persetujuan Prinsip Belum Terpenuhi',
        '<p>Hasil verifikasi menunjukkan persyaratan persetujuan prinsip permohonan Anda <b>belum terpenuhi</b>.</p>' +
        '<p>Keterangan:<br/>' + tahapan.escHtml(b.keterangan).replace(/\n/g, '<br/>') + '</p>' +
        '<p>Mohon segera melengkapi persyaratan tersebut.</p>');
    }
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/persetujuan_prinsip/file/:id', cek_admin, async function (req, res) {
  try {
    var pp = await tahapan.getPersetujuan(req.params.id);
    if (!pp) return res.status(404).send('Persetujuan prinsip tidak ditemukan');
    tahapan.kirimFile(res, pp.file_ttd, pp.nama_asli_ttd);
  } catch (err) { gagal(res, err); }
});

// ---------------- Penerbitan izin: perjanjian sewa (sebelum SK) ----------------
// body: { no_perjanjian, tanggal_perjanjian, isi }
router.post('/perjanjian_sewa/simpan/:id', cek_admin, async function (req, res) {
  try {
    var p = await ambilTahap(req, res, 'penerbitan_izin');
    if (!p) return;
    var b = req.body || {};
    if (!b.no_perjanjian || !b.tanggal_perjanjian) return gagal(res, 'Nomor & tanggal perjanjian sewa wajib diisi', 400);
    await tahapan.simpanPerjanjianSewa(p.permohonan_id, b, getUser(req).id_user);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/perjanjian_sewa/cetak/:id', cek_admin, async function (req, res) {
  var p = await helper.getPermohonan(req.params.id);
  if (!p) return res.status(404).send('Permohonan tidak ditemukan');
  var data = await tahapan.getDataCetak(p);
  if (!data.perjanjian_sewa) return res.status(404).send('Draft perjanjian sewa belum dibuat');
  res.render('content-backoffice/manajemen_perizinan/perjanjian_sewa/cetak', data);
});

// Upload perjanjian sewa bertanda tangan; setelah itu SK bisa diterbitkan (proses setujui)
router.post('/perjanjian_sewa/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File perjanjian sewa wajib dipilih', 400);
    var p = await ambilTahap(req, res, 'penerbitan_izin');
    if (!p) return tahapan.hapusFile(file.filename);
    if (!(await tahapan.getPerjanjianSewa(p.permohonan_id))) {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Buat draft perjanjian sewa terlebih dahulu', 400);
    }
    await tahapan.simpanTtd('sewa', p.permohonan_id, file);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/perjanjian_sewa/file/:id', cek_admin, async function (req, res) {
  try {
    var ps = await tahapan.getPerjanjianSewa(req.params.id);
    if (!ps) return res.status(404).send('Perjanjian sewa tidak ditemukan');
    tahapan.kirimFile(res, ps.file_ttd, ps.nama_asli_ttd);
  } catch (err) { gagal(res, err); }
});

// ---------------- Penerbitan izin: upload izin (SK) bertanda tangan ----------------
// Hanya permohonan yang sudah disetujui (SK dibuat lewat /proses); izin terlampir dikirim email ke pemohon
router.post('/izin/upload/:id', cek_admin, tahapan.upload_ttd, async function (req, res) {
  var file = req.files && req.files.file && req.files.file[0];
  try {
    if (!file) return gagal(res, 'File izin wajib dipilih', 400);
    var p = await helper.getPermohonan(req.params.id);
    if (!p || p.status !== 'disetujui') {
      tahapan.hapusFile(file.filename);
      return gagal(res, 'Izin hanya bisa diupload untuk permohonan yang sudah disetujui', 400);
    }
    await tahapan.simpanTtd('sk', p.permohonan_id, file);
    tahapan.kirimNotifikasi(p, 'Izin Pemanfaatan Ruang Milik Jalan Telah Terbit',
      '<p>Izin pemanfaatan ruang milik jalan untuk jaringan utilitas atas permohonan Anda <b>telah terbit</b> ' +
      'dengan Nomor <b>' + tahapan.escHtml(p.no_sk) + '</b>. Dokumen izin terlampir.</p>',
      [tahapan.lampiran(file.filename, file.originalname)]);
    res.json({ status: 200, message: 'sukses', data: null });
  } catch (err) { gagal(res, err); }
});

router.get('/izin/file/:id', cek_admin, async function (req, res) {
  try {
    var p = await helper.getPermohonan(req.params.id);
    if (!p) return res.status(404).send('Permohonan tidak ditemukan');
    tahapan.kirimFile(res, p.file_sk, p.nama_asli_sk);
  } catch (err) { gagal(res, err); }
});
module.exports = router;
