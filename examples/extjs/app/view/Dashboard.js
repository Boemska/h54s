Ext.define('h54sExample.view.Dashboard', {
  extend: 'Ext.panel.Panel',

  layout: {
    type: 'vbox',
    align: 'center',
  },

  items: [{
    xtype: 'panel',
    height: 100,
    width: 500,
    items: [
      {
        id: 'debugWindowBtn',
        xtype: 'button',
        text: 'Show debug data and logs',
        hidden: true,
        height: '34px',
        style: {
          position: 'absolute',
          top: '50px',
          right: '0'
        },
        listeners: {
          click: function() {
            var debugWindow = Ext.create('h54sExample.view.DebugWindow');
            debugWindow.show();
          }
        }
      }
    ]
  }, {
    xtype: 'panel',
    width: 500,
    flex: 1,
    id: 'mainPanel',
    layout: {
      type: 'vbox',
      align: 'stretch',
    },

    listeners: {
      afterrender: function () {
        this.setLoading(true);
      },
    },

    items: [
      {
        xtype: 'container',
        layout: {
          type: 'hbox'
        },
        style: {
          marginBottom: '5px'
        },
        items: [
          {
            xtype: 'textfield',
            name: 'filter',
            allowBlank: true,
            emptyText: 'Search',
            width: 250,
            listeners: {
              change: function (e) {
                var store = Ext.getStore('TableStore');
                store.filterBy(function (record, id) {
                  var recValue = record.get('memname').toLowerCase();
                  var value = e.getValue().toLowerCase();
                  if (!e.getValue() || recValue.indexOf(value) !== -1)
                    return true;
                  else
                    return false;
                });
              }
            }
          }, {
            xtype: 'tbfill'
          }, {
            xtype: 'combobox',
            emptyText: 'Library',
            store: 'LibraryListStore',
            displayField: 'libname',
            queryMode: 'local',
            listeners: {
              select: function (e) {
                var me = this;
                sasAdapter.addTable([
                  {
                    libraryName: e.getValue()
                  }
                ], 'lib');
                sasAdapter.call('/AJAX/h54s_test/datasetList', function (err, res) {
                  if (err) {
                    alert(err.message);
                  } else {
                    var store = Ext.getStore('TableStore');
                    store.getProxy().setData(res.tablelist);
                    Ext.getCmp('tableGridPaging').setStore(store);
                    store.loadPage(1);
                  }
                });
              }
            }
          }
        ]
      },
      {
        id: 'tableGrid',
        xtype: 'gridpanel',
        flex: 1,
        store: 'TableStore',
        columns: [
          {
            xtype: 'gridcolumn',
            dataIndex: 'libname',
            text: 'Library Name',
            flex: 1,
            menuDisabled: true
          },
          {
            xtype: 'gridcolumn',
            dataIndex: 'memname',
            text: 'Memory Name',
            flex: 1,
            menuDisabled: true
          }
        ],
        listeners: {
          select: function (e) {
            var row = e.getSelection()[0];
            e.clearSelections();
            e.view.refresh();
            var detailWindow = Ext.create('h54sExample.view.TableWindow');
            sasAdapter.addTable([
              {
                libname: row.data.libname,
                memname: row.data.memname
              }
            ], 'data');
            detailWindow.show();
          }
        },
        dockedItems: [{
          id: 'tableGridPaging',
          xtype: 'pagingtoolbar',
          store: Ext.getStore('TableStore'),
          dock: 'bottom',
          displayInfo: true,
          displayMsg: '{0} - {1} of {2}'
        }],
      },
    ]
  }],

});
