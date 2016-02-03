/* global Ext */
Ext.define('h54sExample.model.Table', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'string',
      name: 'LIBNAME'
    }, {
      type: 'string',
      name: 'MEMNAME'
    }
  ]

});
