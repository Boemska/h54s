Ext.define('h54sExample.Application', {
  extend: 'Ext.app.Application',
  name: 'h54s Example',

  stores: [],

  requires: [
    'h54sExample.view.MessageWindow',
    'h54sExample.sasAdapter',
  ],

  views: [
    'h54sExample.view.MainViewport',
    'h54sExample.view.HighchartsContainer',
    'h54sExample.view.DateWindow',
    'h54sExample.view.WindowDrillHour',
    'h54sExample.view.DebugWindow',
    'h54sExample.view.LoginWindow',

    'h54sExample.view.charts.LocationChart',
    'h54sExample.view.charts.TimeChart',
    'h54sExample.view.charts.UserChart'
  ],

  launch: function () {
    var map = new Ext.util.KeyMap(Ext.getBody(), {
      key: 68,
      ctrl: true,
      alt: true,
      handler: function() {
        if(!sasAdapter.getDebugMode()) {
          sasAdapter.setDebugMode();
          Ext.create('h54sExample.view.DebugWindow').show();
        } else {
          sasAdapter.unsetDebugMode();
          Ext.getCmp('debugWindow').close();
        }
      },
      scope: this,
      defaultEventAction: "stopEvent"
    });
  }
});
