Ext.define('h54sExample.store.GridStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.GridModel'
  ],

  model: 'h54sExample.model.GridModel',

  proxy: {
    type: 'memory',
    enablePaging: false,
    reader: {
      type: 'json'
    }
  },

});
