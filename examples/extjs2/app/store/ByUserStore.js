/* global Ext */
Ext.define('h54sExample.store.ByUserStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.ByUserModel'
  ],

  model: 'h54sExample.model.ByUserModel',

  proxy: {
    type: 'memory',
    enablePaging: false,
    reader: {
      type: 'json'
    }
  },

});
