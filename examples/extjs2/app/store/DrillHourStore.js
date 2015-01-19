/* global Ext */
Ext.define('h54sExample.store.DrillHourStore', {
  extend: 'Ext.data.Store',

  groupField: 'username',

  requires: [
    'h54sExample.model.DrillHourModel'
  ],

  model: 'h54sExample.model.DrillHourModel',

  proxy: {
    type: 'memory',
    enablePaging: false,
    reader: {
      type: 'json'
    }
  },

});
