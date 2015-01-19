/* global Ext */
Ext.define('h54sExample.store.ByTimeStore', {
  extend: 'Ext.data.Store',

  requires: [
    'h54sExample.model.ByTimeModel'
  ],

  model: 'h54sExample.model.ByTimeModel',

  proxy: {
    type: 'memory',
    enablePaging: false,
    reader: {
      type: 'json'
    }
  },

});
