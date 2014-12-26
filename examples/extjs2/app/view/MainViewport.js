Ext.define('h54sExample.view.MainViewport', {
  extend: 'Ext.container.Viewport',
  alias: 'widget.mainviewport',

  requires: [
    'h54sExample.view.MainViewportViewModel',
    'Ext.grid.Panel',
    'Ext.grid.column.Number',
    'Ext.grid.View'
  ],

  viewModel: {
    type: 'mainviewport'
  },
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
              html: '<div style="width: 100%; height: 100% ; margin: 0 auto;" id="pieByUser"></div>',
              margin: '20 20 0 20',
              padding: '20 20 0 20',
              title: 'Total Reports Opened',
              listeners: {
                resize: 'onPanelResize'
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
              layout: {
                type: 'hbox',
                align: 'stretch'
              },
              items: [
                {
                  xtype: 'highchartscontainer',
                  id: 'pieSubdirectory',
                  flex: 55
                }, {
                  xtype: 'gridpanel',
                  flex: 45,
                  frame: true,
                  id: 'toplevelProcess',
                  margin: '5 5 5 5',
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
                  var chart = $('#' + 'highchartsContainer').highcharts();
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
              xtype: 'container',
              flex: 1,
              html: '<div style="width: 100%; height: 100% ; margin: 0 auto;" id="highchartsContainer"></div>',
              layout: 'fit',
              listeners: {
                resize: 'onContainerResize'
              }
            }
          ]
        }
      ]
    }
  ],

  onPanelResize: function (component, width, height, oldWidth, oldHeight, eOpts) {
    var chart = $('#pieByUser').highcharts();
    if (chart) {
      chart.setSize(width, height, false);
    }
  },

  onContainerResize: function (component, width, height, oldWidth, oldHeight, eOpts) {
    var chart = $('#highchartsContainer').highcharts();
    if (chart) {
      chart.setSize(width, height, false);
    }
  },
});
