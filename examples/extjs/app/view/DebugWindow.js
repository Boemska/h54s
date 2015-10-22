/* global Ext, sasAdapter, setTimeout */
Ext.define('h54sExample.view.DebugWindow', {
  extend: 'Ext.window.Window',
  alias: 'widget.debugwindow',

  alternateClassName: [
    'h54sDebugWindow'
  ],
  requires: [
    'Ext.tab.Panel',
    'Ext.tab.Tab',
    'Ext.toolbar.Toolbar',
    'Ext.toolbar.Fill'
  ],

  focusOnToFront: false,
  frame: true,
  height: 500,
  id: 'debugWindow',
  width: 800,
  layout: 'fit',
  bodyStyle: 'overflowX: none',
  collapsible: true,
  constrainHeader: true,
  title: 'Debug Information',
  maximizable: true,
  defaultListenerScope: true,

  items: [
    {
      xtype: 'tabpanel',
      getBadge: function (num) {
        var width = '30px';
        if (num < 10) {
          width = '15px';
        } else if (num < 100) {
          width = '24px';
        }
        return '&nbsp;<span ' +
          'style="width: ' + width + '; ' +
          'height: 15px; border-radius: 15px; background-color:#157FCC; display:inline-block; color: #fff">' +
          num + '</span>';
      },
      activeTab: 0,
      items: [
        {
          xtype: 'panel',
          updateTabData: function () {
            var logArray = sasAdapter.getApplicationLogs();
            var html = "<div>";
            for (var i = 0; i < logArray.length; i++) {
              html += '<p>' + logArray[i].time.toString() + '</p>';
              html += '<pre style="word-wrap: break-word;">' + logArray[i].message + '</pre>';
              html += '<hr class="x-component  x-component-default" style="margin-top:20px;margin-bottom:15px;">';
            }
            html += "</div>";
            this.update(html);
          },
          updateBadge: function () {
            var logArray = sasAdapter.getApplicationLogs();
            var badgeHtml = this.up().getBadge(logArray.length);
            this.setTitle('Application Logs' + badgeHtml);
          },
          autoScroll: true,
          itemId: 'appLogs',
          scrollable: 'y',
          bodyPadding: 10,
          title: 'Application Logs'
        },
        {
          xtype: 'panel',
          updateTabData: function () {
            var debugArray = sasAdapter.getDebugData();
            for (var i = 0; i < debugArray.length; i++) {
              //continue if item is already added
              if (this.addedItems.indexOf(debugArray[i].time.getTime()) !== -1) {
                continue;
              }
              this.addedItems.push(debugArray[i].time.getTime());
              this.add({
                xtype: 'container',
                items: [
                  {
                    xtype: 'label',
                    text: debugArray[i].time.toString()
                  },
                  {
                    layout: 'fit',
                    xtype: 'panel',
                    title: debugArray[i].sasProgram,
                    html: debugArray[i].debugHtml,
                    collapsible: true,
                    collapsed: true,
                    autoScroll: true,
                    style: {
                      'word-wrap': 'break-word !important'
                    }
                  },
                  {
                    xtype: 'component',
                    autoEl: {
                      tag: 'hr'
                    },
                    style: {
                      marginTop: '20px',
                      marginBottom: '15px'
                    }
                  }
                ]
              });
            }

            var self = this;
            setTimeout(function () {
              self.doLayout();
            }, 0);
          },
          updateBadge: function () {
            var debugArray = sasAdapter.getDebugData();
            var badgeHtml = this.up().getBadge(debugArray.length);
            this.setTitle('Debug Data' + badgeHtml);
          },
          addedItems: [

          ],
          itemId: 'debugData',
          scrollable: true,
          bodyPadding: 10,
          title: 'Debug Data',
          listeners: {
            destroy: 'onDebugDataDestroy'
          }
        },
        {
          xtype: 'panel',
          updateTabData: function () {
            var errArray = sasAdapter.getSasErrors();
            var html = "<div>";
            for (var i = 0; i < errArray.length; i++) {
              html += '<p>' + errArray[i].time.toString() + '</p>';
              html += '<p>SAS Program: ' + errArray[i].sasProgram + '</p>';
              html += '<pre style="word-wrap: break-word;">' + errArray[i].message + '</pre>';
              html += '<hr class="x-component  x-component-default" style="margin-top:20px;margin-bottom:15px;">';
            }
            html += "</div>";
            this.update(html);
          },
          updateBadge: function () {
            var errArray = sasAdapter.getSasErrors();
            var badgeHtml = this.up().getBadge(errArray.length);
            this.setTitle('SAS Errors' + badgeHtml);
          },
          autoScroll: true,
          itemId: 'sasErrors',
          scrollable: 'y',
          bodyPadding: 10,
          title: 'SAS Errors'
        },
        {
          xtype: 'panel',
          updateTabData: function () {
            var failedReqArray = sasAdapter.getFailedRequests();
            for (var i = 0; i < failedReqArray.length; i++) {
              //continue if item is already added
              if (this.addedItems.indexOf(failedReqArray[i].time.getTime()) !== -1) {
                continue;
              }
              this.addedItems.push(failedReqArray[i].time.getTime());
              this.add({
                xtype: 'container',
                items: [
                  {
                    xtype: 'label',
                    text: failedReqArray[i].time.toString()
                  },
                  {
                    layout: 'fit',
                    xtype: 'panel',
                    title: failedReqArray[i].sasProgram,
                    html: failedReqArray[i].responseHtml,
                    collapsible: true,
                    collapsed: true,
                    autoScroll: true,
                    style: {
                      'word-wrap': 'break-word !important'
                    }
                  },
                  {
                    xtype: 'component',
                    autoEl: {
                      tag: 'hr'
                    },
                    style: {
                      marginTop: '20px',
                      marginBottom: '15px'
                    }
                  }
                ]
              });
            }
            this.doLayout();
          },
          updateBadge: function () {
            var failedReqArray = sasAdapter.getFailedRequests();
            var badgeHtml = this.up().getBadge(failedReqArray.length);
            this.setTitle('Failed Requests' + badgeHtml);
          },
          autoScroll: true,
          addedItems: [],
          itemId: 'failedRequests',
          scrollable: true,
          bodyPadding: 10,
          title: 'Failed Requests',
          listeners: {
            destroy: 'onFailedRequestsDestroy'
          }
        }
      ],
      dockedItems: [
        {
          xtype: 'toolbar',
          dock: 'bottom',
          items: [
            {
              xtype: 'tbfill'
            },
            {
              xtype: 'button',
              handler: function () {
                var win = this.up('window');
                var tab = win.down('tabpanel').getActiveTab();
                switch (tab.itemId) {
                  case 'appLogs':
                    sasAdapter.clearApplicationLogs();
                    break;
                  case 'debugData':
                    sasAdapter.clearDebugData();
                    break;
                  case 'sasErrors':
                    sasAdapter.clearSasErrors();
                    break;
                  case 'failedRequests':
                    sasAdapter.clearFailedRequests();
                    break;
                }
                tab.removeAll();
                tab.updateBadge();
                tab.updateTabData();
              },
              text: 'Clear'
            }
          ]
        }
      ],
      listeners: {
        tabchange: 'onTabpanelTabChange'
      }
    }
  ],
  listeners: {
    close: 'onDebugWindowClose',
    afterrender: 'onDebugWindowAfterRender'
  },

  onDebugDataDestroy: function (component) {
    component.addedItems.length = 0;
  },

  onFailedRequestsDestroy: function (component) {
    component.addedItems.length = 0;
  },

  onTabpanelTabChange: function (tabPanel, newCard) {
    newCard.mask('Loading');
    setTimeout(function () {
      newCard.updateTabData();
      newCard.unmask();
    }, 0);
  },

  onDebugWindowClose: function () {
    sasAdapter.unsetDebugMode();
  },

  onDebugWindowAfterRender: function (component) {
    var width = Math.min(Ext.getBody().getViewSize().width, 800);
    this.setWidth(width);
    this.setHeight(Ext.getBody().getViewSize().height);

    this.updateData();

    component.down('tabpanel').getActiveTab().updateTabData();
  },

  updateData: function () {
    var tabPanel = this.down('tabpanel');
    tabPanel.items.each(function (el) {
      el.updateBadge();
    });

    tabPanel.getActiveTab().updateTabData();
  }

});
