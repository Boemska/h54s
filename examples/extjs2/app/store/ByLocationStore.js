/* global Ext */
Ext.define('h54sExample.store.ByLocationStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.ByLocationModel'
  ],

  model: 'h54sExample.model.ByLocationModel',

  proxy: {
    type: 'memory',
    enablePaging: false,
    reader: {
      type: 'json'
    }
  },

});
