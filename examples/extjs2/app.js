Ext.application({
  name: 'h54sExample',
  extend: 'h54sExample.Application',

  models: [
    'ByTimeModel',
    'ByLocationModel',
    'ByUserModel',
    'GridModel',
    'DrillHourModel'
  ],
  stores: [
    'ByTimeStore',
    'ByLocationStore',
    'ByUserStore',
    'GridStore',
    'DrillHourStore'
  ],

  controllers: [
    'h54sExample.controller.MainController'
  ],

});
