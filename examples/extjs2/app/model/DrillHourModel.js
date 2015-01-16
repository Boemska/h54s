Ext.define('h54sExample.model.DrillHourModel', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'string',
      name: 'shortname'
    }, {
      type: 'string',
      name: 'username'
    }, {
      type: 'string',
      name: 'datetime'
    }, {
      type: 'string',
      name: 'pType'
    }
  ]
});
