Ext.define('h54sExample.model.ByLocationModel', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'auto',
      name: 'lev0Data'
    }, {
      type: 'auto',
      name: 'lev1Data'
    }, {
      type: 'auto',
      name: 'lev2Data'
    }
  ]
});
