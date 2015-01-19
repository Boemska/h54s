/* global Ext */
Ext.define('h54sExample.model.GridModel', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'string',
      name: 'shortName'
    }, {
      type: 'int',
      name: 'count'
    }, {
      type: 'string',
      name: 'pType'
    }
  ]
});
