Ext.define('h54sExample.store.TableStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.Table'
  ],

  model: 'h54sExample.model.Table',

  proxy: {
    type: 'memory',
    enablePaging: true,
    reader: {
      type: 'json'
    }
  },

  pageSize : 20,

});
