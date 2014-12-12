Ext.define('h54sExample.Application', {
  extend: 'Ext.app.Application',
  name: 'h54s Example',
  stores: [],

  requires: [
    'h54sExample.sasAdapter',
    'h54sExample.view.TableWindow',
    'h54sExample.view.LoginWindow'
  ],

  launch: function () {
    sasAdapter.call('/AJAX/h54s_test/libraryList', function (err, res) {
      if (err) {
        alert(err.message);
      } else {
        Ext.getCmp('mainPanel').setLoading(false);
        Ext.getStore('LibraryListStore').loadData(res.librarylist);
      }
    });
  }
});
