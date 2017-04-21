sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'h54s/SasAdapter'
], function(Controller, sasAdapter) {
  return Controller.extend('h54s.controllers.App', {

    loadLibNames: function() {
      var self = this;
      sasAdapter.getInstance().call('/AJAX/h54s_test/libraryList', null, function (err, res) {
        if (err) {
          alert(err.message);
        } else {
          var model = new sap.ui.model.json.JSONModel();
          model.setData(res.libraryList);
          sap.ui.getCore().byId('dropDown').setModel(model);
        }
      });
    },

    loadTable: function(libname) {
      var self = this;
      var table = sasAdapter.getInstance().createTable([
        {
          libraryName: libname
        }
      ], 'lib');

      sasAdapter.getInstance().call('/AJAX/h54s_test/datasetList', table, function (err, res) {
        if(err) {
          alert(err.message);
        } else {
          var model = new sap.ui.model.json.JSONModel();
          model.setData(res.tableList);
          sap.ui.getCore().byId('table').setModel(model);
        }
      });
    },

    loadData: function(obj) {
      var self = this;
      var model = new sap.ui.model.json.JSONModel();

      var table = new sasAdapter.getInstance().createTable([
        obj
      ], 'data');

      sasAdapter.getInstance().call('/AJAX/h54s_test/getData', table, function(err, res) {
        if(err) {
          alert(err.message);
        } else {
          var keys = [];
          for(var key in res.outputdata[0]) {
            keys.push(key);
          }

          model.setData({
            keys: keys,
            rows: res.outputdata
          });
        }
      });

      sap.ui.getCore().byId('h54sApp').setModel(model).to('DetailTable');
    }
  });
});
