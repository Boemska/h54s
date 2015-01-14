Ext.define('h54sExample.model.ByUserModel', {
  extend: 'Ext.data.Model',

  requires: [
    'Ext.data.field.Field'
  ],

  fields: [
    {
      type: 'auto',
      name: 'data'
    }, {
      type: 'auto',
      name: 'categories'
    }
  ]
});
