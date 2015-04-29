/* global $, w2popup, w2ui, document, h54s, alert, sasAdapter */
$(document).ready(function () {
  var popupId = 0;
  $('#lib-grid').w2grid({
    name: 'libGrid',
    show: {
      toolbar: false,
      footer: true
    },
    columns: [
      {
        field: 'libname',
        caption: 'Library Name',
        sortable: true,
        size: '50%'
      },
      {
        field: 'memname',
        caption: 'Memory Name',
        sortable: true,
        size: '50%'
      },
    ],
    onClick: function (evt) {
      var pId = popupId;
      var record = this.get(evt.recid);
      var table = new h54s.Tables([{
        libname: record.libname,
        memname: record.memname
      }], 'data');

      w2popup.open({
        title: 'Detail View',
        body: '<div id="detail-grid' + pId + '" class="detail-grid"></div>',
        width: 10000,
        height: 10000
      });

      sasAdapter.call('/AJAX/h54s_test/getData', table, function (err, res) {
        if (err) {
          if(err.type === 'notLoggedinError' || err.type === 'loginError') {
            sasAdapter.openLoginPopup();
          } else {
            alert(err.message);
          }
          return;
        }

        var data = res.outputdata;
        var keys = Object.keys(data[0]);
        var columns = keys.map(function (key) {
          return {
            field: key,
            caption: key,
            sortable: true,
            size: 100 / keys.length + '%'
          };
        });

        data.map(function (item, ind) {
          item.recid = ind;
          return item;
        });


        if ($('#detail-grid' + pId).length > 0) {
          if (w2ui.detailGrid) {
            w2ui.detailGrid.destroy();
          }
          w2ui.detailGrid = $('#detail-grid' + pId).w2grid({
            name: 'detailGrid',
            show: {
              toolbar: false,
              footer: true
            },
            columns: columns,
            records: data
          });
        }

      });

      popupId++;
    }
  });

  sasAdapter.call('/AJAX/h54s_test/libraryList', null, function (err, res) {
    if (err) {
      if(err.type === 'notLoggedinError' || err.type === 'loginError') {
        sasAdapter.openLoginPopup();
      } else {
        alert(err.message);
      }
      return;
    }

    var listItems = res.librarylist.map(function (item) {
      return item.libname;
    });
    var liblist = $('input[name="libname"]').w2field('list', {
      items: listItems
    });

    liblist.on('change', function (evt) {
      var libname = $(evt.currentTarget).val();

      var table = new h54s.Tables([
        {
          libraryName: libname
        }
      ], 'lib');

      sasAdapter.call('/AJAX/h54s_test/datasetList', table, function (err, res) {
        if (err) {
          if(err.type === 'notLoggedinError' || err.type === 'loginError') {
            sasAdapter.openLoginPopup();
          } else {
            alert(err.message);
          }
          return;
        }

        var memListItems = res.tablelist.map(function (item, ind) {
          return {
            recid: ind,
            libname: item.libname,
            memname: item.memname
          };
        });
        w2ui.libGrid.clear(true);
        w2ui.libGrid.add(memListItems);
      });
    });
  });


  $('input[name="filter"]').on('keyup', function () {
    var val = $(this).val();
    w2ui.libGrid.search('memname', val);
  });

});
