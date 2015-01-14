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
              click: function (e) {
                var timeMs = this.x;
                if (!timeMs) {
                  Ext.MessageBox.alert('Warn: No x timestamp found.');
                  return;
                }

                var timeMsEnd = timeMs + 60 * 60 * 1000;

                var sasStart = new Date(timeMs);
                var sasEnd = new Date(timeMsEnd);

                var me = this;

                sasAdapter.addTable([{
                  javastart: timeMs,
                  javaend: timeMsEnd,
                  sasstart: sasStart,
                  sasend: sasEnd
                }], 'timespan');


                sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillHour', function(err, res) {
                  if (err) {
                    Ext.MessageBox.alert('Warning', 'Could not call drillHour.');
                  } else {
                    var win = Ext.create('h54sExample.view.WindowDrillHour');
                    var fromString = Ext.util.Format.date(new Date(timeMs), 'Y-m-d H:i:s');
                    var endString = Ext.util.Format.date(new Date(timeMsEnd), 'Y-m-d H:i:s');

                    win.setTitle('From ' + fromString + ' to ' + endString);
                    win.setData(res);

                    win.show();
                  }
                });
              }
            }
          }
        }
      }
    }
  }]

});
