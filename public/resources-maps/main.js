  //  var root ="https://pindah.fosan.id/";
  var root = "http://survplus.id:8940/"
   String.prototype.replaceAll = function(search, replacement) {
       var target = this;
       return target.split(search).join(replacement);
   };

   function pisah_wkt(poligon){
    inputan_koordinat ="";
    end_koordinat = "";
    poligon = poligon.replaceAll("(", "");
       poligon = poligon.replaceAll(")", "");
       poligon = poligon.replace("POLYGON ", "");
       poligon = poligon.replace("POINT ", "");
       poligon = poligon.replace("LINESTRING ", "");
       poligon = poligon.replace("POLYGON", "");
       poligon = poligon.replace("POINT", "");
       poligon = poligon.replace("LINESTRING", "");

       var haha = 0;
       var a = poligon.split(",");
     //  console.log(a)
       $('#myTable tbody').html('');
       var koordinat_akhir = a.length - 1;
       a.forEach(function(item, index){
        var b = item.split(" ");
      
        if(index != koordinat_akhir){
              var newRow = $("<tr>");
              var cols = "";

              cols += '<td><input type="text" name="x[]" value="'+b[0]+'" style="width:100%"/></td>';
              cols += '<td><input type="text" name="y[]" value="'+b[1]+'" style="width:100%"/></td>';
               cols += '<td><input type="button" class="ibtnDel"  value="Hapus" style="width:100%"></td>';
            
              newRow.append(cols);
            //  if (counter == 4) $('#addrow').attr('disabled', true).prop('value', "You've reached the limit");
              $("table.order-list").append(newRow);
                
              inputan_koordinat = inputan_koordinat+''+b[0]+' '+b[1]+',';
        }else{
              end_koordinat= ''+b[0]+' '+b[1]
        }
        if(koordinat_akhir == 0){
            var newRow = $("<tr>");
            var cols = "";

            cols += '<td><input type="text" name="x[]" value="'+b[0]+'" style="width:100%"/></td>';
            cols += '<td><input type="text" name="y[]" value="'+b[1]+'" style="width:100%"/></td>';

             cols += '<td><input type="button" class="ibtnDel"  value="Hapus" style="width:100%"></td>';
            
            newRow.append(cols);
          //  if (counter == 4) $('#addrow').attr('disabled', true).prop('value', "You've reached the limit");
            $("table.order-list").append(newRow);
        }
         
       })
   

   }
    function peta_pemohon(poligon){
      //SELECT  SUBSTRING(md5(id + nama)FROM 1 FOR 6) AS kunci FROM `data_pemohon` WHERE 1
      drawnItems.clearLayers();
   //   var poligon = "<%= data[0]['wkt']%>";
     // console.log(poligon)
     poligon = poligon.replace('"', "");
      $('#SHAPE').val(poligon)
      layer_parse=   omnivore.wkt.parse(poligon);
     
   pisah_wkt(poligon)

      $('#wkt_inputan').val(poligon);
            layer_parse.eachLayer(function (layer) {
             // console.log(layer.feature.geometry.type)
              if(layer.feature.geometry.type != "Point"){
                var bounds = layer.getBounds();
                var center = bounds.getCenter();
                   map.setView(center, 18);
                    map.fitBounds(bounds);
               
              }
                      drawnItems.addLayer(layer);
               })
    }
     