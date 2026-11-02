// ============================================================
// Digitasi kabel: tampilkan tiang ruas sebagai acuan & snap titik kabel ke tiang.
// Untuk Leaflet 1.3 + Leaflet.draw 0.4.x. Dipakai halaman digitasi vendor & backoffice.
//   DigitasiSnap.muatTiang(map, url)  -> url API digitasi tiang ruas yang sama
// Selama belum ada tiang yang dimuat, handler Leaflet.draw berjalan seperti biasa.
// ============================================================
var DigitasiSnap = (function () {
  var JARAK_PX = 20;     // radius tarikan ke tiang (piksel layar)
  var map = null;
  var tiang = [];        // L.LatLng tiang acuan
  var penanda = null;    // lingkaran penanda tiang yang sedang ditarik

  // Titik tiang terdekat dalam radius JARAK_PX, atau null
  function terdekat(latlng) {
    if (!map || !latlng || !tiang.length) return null;
    var p = map.latLngToContainerPoint(latlng), hasil = null, min = JARAK_PX;
    tiang.forEach(function (t) {
      var d = p.distanceTo(map.latLngToContainerPoint(t));
      if (d <= min) { min = d; hasil = t; }
    });
    return hasil;
  }

  function tandai(t) {
    if (!t) { if (penanda) map.removeLayer(penanda); return; }
    if (!penanda) penanda = L.circleMarker(t, { radius: 12, color: '#f7ca18', weight: 3, fill: false, interactive: false });
    penanda.setLatLng(t);
    if (!map.hasLayer(penanda)) penanda.addTo(map);
  }

  function snap(latlng) {
    var t = terdekat(latlng);
    tandai(t);
    return t ? L.latLng(t.lat, t.lng) : latlng;
  }

  // Saat menggambar garis baru: kursor & titik yang diklik ditarik ke tiang
  var P = L.Draw.Polyline.prototype;
  var asliMouseMove = P._onMouseMove, asliAddVertex = P.addVertex, asliRemoveHooks = P.removeHooks;
  P._onMouseMove = function (e) {
    asliMouseMove.call(this, e);
    var s = snap(this._currentLatLng);
    if (s !== this._currentLatLng) {
      this._currentLatLng = s;
      this._mouseMarker.setLatLng(s);
      this._updateGuide(this._map.latLngToLayerPoint(s));
    }
  };
  P.addVertex = function (latlng) {
    return asliAddVertex.call(this, snap(latlng));
  };
  P.removeHooks = function () {
    tandai(null);
    return asliRemoveHooks.apply(this, arguments);
  };

  // Saat mengedit garis: vertex yang digeser ditarik ke tiang
  var E = L.Edit.PolyVerticesEdit.prototype;
  var asliDrag = E._onMarkerDrag;
  E._onMarkerDrag = function (e) {
    var s = snap(e.target.getLatLng());
    if (s !== e.target.getLatLng()) e.target.setLatLng(s);
    e.target.off('dragend', hapusTanda).once('dragend', hapusTanda);
    return asliDrag.call(this, e);
  };
  function hapusTanda() { tandai(null); }

  function muatTiang(petaAktif, url) {
    map = petaAktif;
    var layer = L.featureGroup().addTo(map);
    return $.get(url).done(function (res) {
      tiang = [];
      (res.data.fitur || []).forEach(function (f, i) {
        var c = f.geojson.coordinates, ll = L.latLng(c[1], c[0]);
        tiang.push(ll);
        L.circleMarker(ll, { radius: 6, color: '#ffffff', weight: 2, fillColor: '#0d4aa2', fillOpacity: 1 })
          .bindTooltip('Tiang ' + (i + 1) + (Number(f.jumlah) > 1 ? ' (' + f.jumlah + ' unit)' : ''))
          .addTo(layer);
      });
      layer.bringToBack();
    });
  }

  return { muatTiang: muatTiang, jumlahTiang: function () { return tiang.length; } };
})();
