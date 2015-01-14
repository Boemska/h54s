Ext.define('h54sExample.view.MainViewport', {
  extend: 'Ext.container.Viewport',
  alias: 'widget.mainviewport',
  itemId: 'mainView',

  layout: 'fit',
  defaultListenerScope: true,

  items: [
    {
      xtype: 'container',
      layout: {
        type: 'vbox',
        align: 'stretch'
      },
      items: [
        {
          xtype: 'container',
          flex: 1,
          layout: {
            type: 'hbox',
            align: 'stretch'
          },
          items: [
            {
              xtype: 'panel',
              flex: 385,
              frame: true,
              margin: '20 20 0 20',
              padding: '20 20 0 20',
              title: 'Total Reports Opened',
              items: [
                {
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
                }
              ]
            }, {
              xtype: 'panel',
              flex: 615,
              frame: true,
              margin: '20 20 0 0',
              title: 'By Location',
              header: {
                titlePosition: 0,
                items: [
                  {
                    xtype: 'container',
                    id: 'breadcrumbNav',
                    layout: 'hbox'
                  }
                ]
              },
              layout: {
                type: 'hbox',
                align: 'stretch'
              },
              items: [
                {
                  id: 'pieChart',
                  xtype: 'highcharts',
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
                  flex: 55
                }, {
                  xtype: 'gridpanel',
                  flex: 45,
                  frame: true,
                  id: 'toplevelProcess',
                  margin: '5 5 5 5',
                  store: 'GridStore',
                  columns: [
                    {
                      xtype: 'gridcolumn',
                      dataIndex: 'shortName',
                      text: 'Report Name',
                      flex: 1
                    }, {
                      xtype: 'numbercolumn',
                      width: 60,
                      dataIndex: 'count',
                      text: 'Count',
                      flex: 0
                    }, {
                      xtype: 'gridcolumn',
                      width: 60,
                      dataIndex: 'pType',
                      text: '',
                      flex: 0
                    }
                  ]
                }
              ]
            }
          ]
        }, {
          xtype: 'panel',
          flex: 1,
          frame: true,
          margin: '20 20 2 20',
          header: {
            titlePosition: 0,
            items: [
              {
                xtype: 'button',
                text: 'Select Date Range',
                handler: function () {
                  var chart = $('#timeReportsChart').highcharts();
                  var minDate = new Date(chart.xAxis[0].getExtremes().min);
                  var maxDate = new Date(chart.xAxis[0].getExtremes().max);

                  h54sExample.view.DateWindow.show(minDate, maxDate, function (from, to) {
                    if (chart) {
                      chart.xAxis[0].setExtremes(from && from.getTime(), to && to.getTime());
                    }
                  });
                }
              }
            ]
          },
          title: 'Usage over Time',
          layout: {
            type: 'vbox',
            align: 'stretch'
          },
          items: [
            {
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
            }
          ]
        }
      ]
    }
  ]
});
