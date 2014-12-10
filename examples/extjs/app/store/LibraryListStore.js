Ext.define('h54sExample.store.LibraryListStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.Library'
  ],

  model: 'h54sExample.model.Library'

});
