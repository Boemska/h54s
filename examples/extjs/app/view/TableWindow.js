Ext.define('h54sExample.view.TableWindow', {
  extend: 'Ext.window.Window',

  id: 'detailWindow',
  maximized: true,
  title: 'Detail View',
  autoScroll: true,
  layout: 'fit',

  items: [
    {
      id: 'detailTableGrid',
      xtype: 'gridpanel',
      store: 'DetailTableStore',
      dockedItems: [{
        id:'detailTableGridPaging',
        xtype: 'pagingtoolbar',
        store: Ext.getStore('TableStore'),
        dock: 'bottom',
        displayInfo: true,
        displayMsg: '{0} - {1} of {2}'
      }],
      listeners: {
        afterrender: function(e) {
          var me = this;
          var detailWindow = Ext.getCmp('detailWindow');
          detailWindow.setLoading();
          sasAdapter.call('/AJAX/h54s_test/getData', function (err, res) {
            if (err) {
              me.up('#detailWindow').close();
              alert(err.message);
            } else {
              var outputRow = res.outputdata[0];
              var store = Ext.getStore('DetailTableStore');
              var fields = Object.keys(outputRow);
              var grid = Ext.getCmp('detailTableGrid');


              var columns = [];
              var extFields = [];
              for(var key in outputRow) {
                columns.push({
                  xtype: 'gridcolumn',
                  dataIndex: key,
                  text: key,
                  flex: 1,
                  menuDisabled: true
                });

                if (!isNaN(outputRow[key])){
                  extFields.push({name: key, type: 'number' });
                } else {
                  extFields.push({name: key, type: 'string'});
                }
              }

              store.setFields(extFields);
              grid.reconfigure(null, columns);

              store.getProxy().setData(res.outputdata);
              Ext.getCmp('detailTableGridPaging').setStore(store);
              store.loadPage(1);

              detailWindow.setLoading(false);
            }
          });
        }
      }
    }
  ]
});
