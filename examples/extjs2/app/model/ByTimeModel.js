/* global Ext */
Ext.define('h54sExample.model.ByTimeModel', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'auto',
      name: 'stpReports'
    }, {
      type: 'auto',
      name: 'wrsReports'
    }
  ]
});
