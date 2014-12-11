Ext.define('h54sExample.store.DetailTableStore', {
  extend: 'Ext.data.Store',

  proxy: {
    type: 'memory',
    enablePaging: true,
    reader: {
      type: 'json'
    }
  },

  pageSize : 20,

});
