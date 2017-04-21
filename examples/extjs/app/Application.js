/* global Ext, sasAdapter, alert */
Ext.define('h54sExample.Application', {
  extend: 'Ext.app.Application',
  name: 'h54s Example',
  stores: [],

  requires: [
    'h54sExample.sasAdapter',
    'h54sExample.view.TableWindow',
    'h54sExample.view.LoginWindow',
    'h54sExample.view.DebugWindow'
  ],

  launch: function () {
    sasAdapter.call('/AJAX/h54s_test/libraryList', null, function (err, res) {
      if (err) {
        alert(err.message);
      } else {
        Ext.getCmp('mainPanel').setLoading(false);
        Ext.getStore('LibraryListStore').loadData(res.libraryList);
      }
    });

    new Ext.util.KeyMap(Ext.getBody(), {
      key: 68,
      ctrl: true,
      alt: true,
      handler: function() {
        if(!sasAdapter.getDebugMode()) {
          sasAdapter.setDebugMode();
          Ext.getCmp('debugWindowBtn').show();
        } else {
          sasAdapter.unsetDebugMode();
          Ext.getCmp('debugWindowBtn').hide();
        }
      },
      scope: this,
      defaultEventAction: "stopEvent"
    });
  }
});
