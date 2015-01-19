/* global Ext, h54sExample */
Ext.define('h54sExample.view.charts.TimeChart', {
  extend: 'Ext.container.Container',
  alias: 'widget.timechart',

  layout: 'fit',
  flex: 1,

  items: [{
    id: 'timeReportsChart',
    xtype: 'highcharts',
    stockChart: true,
    store: 'ByTimeStore',
    series: [
      {
        name: 'WRS Reports',
        dataKey: 'wrsReports'
      }, {
        name: 'STP Reports',
        dataKey: 'stpReports'
      }
    ],
    chartConfig: {
      chart: {
        type: 'column',
        zoomType: 'x'
      },
      rangeSelector: {
        buttons: [{
          type: 'day',
          count: 1,
          text: '1d'
        }, {
          type: 'week',
          count: 1,
          text: '1w'
        }, {
          type: 'all',
          text: 'All'
        }]
      },
      exporting: {
        enabled: false
      },
      xAxis: {
        ordinal: false,
        events: {
          afterSetExtremes: function (e) {
            var controller = h54sExample.app.getController('MainController');
            controller.updateTimespan(e.min, e.max, new Date(e.min), new Date(e.max));
            controller.lastClicked = undefined;
          }
        }
      },
      legend: {
        enabled: true,
        verticalAlign: 'top'
      },
      navigator: {
        enabled: false,
        height: 0,
        margin: 0
      },
      scrollbar: {
        enabled: false
      },

      credits: {
        enabled: false
      },

      plotOptions: {
        column: {
          stacking: 'normal',
          dataGrouping: {
            forced: false,
            units: [[
              'hour',
              [6]
            ]]
          }
        },
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click: function () {
                var controller = h54sExample.app.getController('MainController');
                controller.showDrillHour(this.x);
              }
            }
          }
        }
      }
    }
  }]

});
