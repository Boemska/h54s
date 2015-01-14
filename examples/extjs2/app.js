Ext.application({
  name: 'h54sExample',
  extend: 'h54sExample.Application',

  models: [
    'ByTimeModel',
    'ByLocationModel',
    'ByUserModel',
    'GridModel'
  ],
  stores: [
    'ByTimeStore',
    'ByLocationStore',
    'ByUserStore',
    'GridStore'
  ],

  controllers: [
    'h54sExample.controller.MainController'
  ],

});
