Ext.define('h54sExample.view.MainViewport', {
  extend: 'Ext.container.Viewport',
  alias: 'widget.mainviewport',
  itemId: 'mainView',

  layout: 'fit',
  defaultListenerScope: true,
  autoScroll: true,

  responsiveConfig: {
    'width < 800': {
      layout: {
        type: 'vbox',
        align: 'stretch'
      },
    }
  },

  items: [
    {
      xtype: 'container',
      layout: {
        type: 'vbox',
        align: 'stretch'
      },
      plugins: 'responsive',
      responsiveConfig: {
        'width < 800': {
          autoScroll: true
        }
      },
      items: [
        {
          xtype: 'container',
          flex: 1,
          layout: {
            type: 'hbox',
            align: 'stretch'
          },
          plugins: 'responsive',
          responsiveConfig: {
            'width < 800': {
              layout: {
                type: 'vbox',
                align: 'stretch'
              },
              height: 1000
            }
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
                  xtype: 'userchart'
                }
              ],

              plugins: 'responsive',
              responsiveConfig: {
                'width < 800': {
                  height: 1000,
                }
              }
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
              plugins: 'responsive',
              responsiveConfig: {
                'width < 800': {
                  height: 1000,
                  margin: '20'
                }
              },
              layout: {
                type: 'hbox',
                align: 'stretch'
              },
              items: [
                {
                  xtype: 'locationchart',
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
                      flex: 1,
                      renderer: function (value, metaData, record, rowIndex, colIndex, store, view) {
                        var newTooltip = record.get('programname');

                        metaData.tdAttr = 'data-qtip="' + newTooltip + '"';
                        return value;
                      }
                    }, {
                      xtype: 'numbercolumn',
                      width: 60,
                      dataIndex: 'count',
                      text: 'Count',
                      flex: 0
                    }, {
                      xtype: 'gridcolumn',
                      width: 50,
                      dataIndex: 'pType',
                      text: 'Type',
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
          plugins: 'responsive',
          responsiveConfig: {
            'width < 800': {
              height: 400,
            }
          },
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
              xtype: 'timechart'
            }
          ]
        }
      ]
    }
  ]
});
