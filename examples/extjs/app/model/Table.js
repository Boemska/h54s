Ext.define('h54sExample.model.Table', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'string',
      name: 'libname'
    }, {
      type: 'string',
      name: 'memname'
    }
  ]

});
