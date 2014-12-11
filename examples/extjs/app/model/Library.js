Ext.define('h54sExample.model.Library', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'string',
      name: 'libname'
    }
  ]
});
