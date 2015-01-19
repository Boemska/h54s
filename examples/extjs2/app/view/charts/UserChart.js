/* global Ext */
Ext.define('h54sExample.view.charts.UserChart', {
  extend: 'Ext.container.Container',
  alias: 'widget.userchart',

  layout: 'fit',

  items: [{
    xtype: 'highcharts',
    store: 'ByUserStore',
    series: [{
      dataKey: 'data',
      type: 'bar',
      name: 'Usage by User'
    }],
    xAxisField: 'categories',
    chartConfig: {
      title: {
        text: null
      },
      exporting: {
        enabled: false
      },
      tooltip: {
        formatter: function() {
          return '<b>' + this.point.name +':</b> '+ this.y;
        }
      },
      xAxis: {
        title: {
          text: null
        }
      },
      yAxis: {
        title: {
          text: null
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    }
  }]

});
