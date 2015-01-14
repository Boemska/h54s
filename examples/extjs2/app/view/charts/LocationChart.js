Ext.define('h54sExample.view.charts.LocationChart', {
  extend: 'Ext.container.Container',
  alias: 'widget.locationchart',

  layout: 'fit',

  items: [{
    id: 'pieChart',
    xtype:'highcharts',
    store: 'ByLocationStore',
    series: [{
      dataKey: 'lev0Data',
      name: 'Level 0',
      size: '30%',
      dataLabels: {
        formatter: function () {
          return this.point.name;
        },
        color: 'white',
        distance: -20
      },
      seriesLevel: 0
    }, {
      dataKey: 'lev1Data',
      name: 'Level 1',
      size: '55%',
      innerSize: '30%',
      dataLabels: {
        formatter: function () {
          return this.point.name;
        },
        color: 'white',
        distance: -20
      },
      seriesLevel: 1
    }, {
      dataKey: 'lev2Data',
      name: 'Level 2',
      size: '80%',
      innerSize: '55%',
      seriesLevel: 2
    }],
    chartConfig: {
      chart: {
        type: 'pie'
      },
      exporting: {
        enabled: false
      },
      title: {
        text: null
      },
      tooltip: {
        formatter: function() {

          if(this.point.name === '' || this.point.name === ' ' ){
            return false ;
          } else {
            return this.point.name +': '+ this.y;
          }
        }
      },
      credits: {
        enabled: false
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          slicedOffset: 0,
          cursor: 'pointer',
          dataLabels: {
            enabled: true,
            style: {
              color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
            }
          }
        },
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click: function(e) {
                if (this.name !== '' && this.name !== ' '){
                  var controller = h54sExample.app.getController('MainController');
                  controller.onSubdirectoryClick(this);
                  controller.lastClicked = this.name;
                }
              }
            }
          }
        }
      }
    },
  }]
});
