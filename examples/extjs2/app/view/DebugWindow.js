Ext.define('h54sExample.view.DebugWindow', {
  extend: 'Ext.window.Window',

  id: 'debugWindow',
  width: Math.min(Ext.getBody().getViewSize().width, 800),
  height: Ext.getBody().getViewSize().height,
  title: 'Debug Information',
  closable: true,
  maximizable: true,
  collapsible: true,
  focusOnToFront: false,

  layout: 'fit',
  items: [
    {
      xtype: 'tabpanel',
      activeTab: 0,
      items: [
        {
          title: 'Application Logs',
          autoScroll: true,
          bodyPadding: 10,
          listeners: {
            activate: function (tab) {
              var logArray = sasAdapter.getApplicationLogs();
              var html = "<div>";
              for (var i = 0; i < logArray.length; i++) {
                html += '<p>' + logArray[i].time.toString() + '</p>';
                html += '<pre>' + logArray[i].message + '</pre>';
                html += '<hr class="x-component  x-component-default" style="margin-top:20px;margin-bottom:15px;">';
              }
              html += "</div>";
              this.update(html);
            },
            added: function () {
              var logArray = sasAdapter.getApplicationLogs();
              var badgeHtml = this.up().getBadge(logArray.length);
              this.setTitle(this.title + badgeHtml);
            }
          },
        },
        {
          title: 'Debug Data',
          bodyPadding: 10,
          overflowY: 'scroll',
          listeners: {
            activate: function (tab) {
              var debugArray = sasAdapter.getDebugData();
              for (var i = 0; i < debugArray.length; i++) {
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
              this.doLayout();
            },
            added: function () {
              var debugArray = sasAdapter.getDebugData();
              var badgeHtml = this.up().getBadge(debugArray.length);
              this.setTitle(this.title + badgeHtml);
            }
          },
        },
        {
          title: 'Sas Errors',
          autoScroll: true,
          bodyPadding: 10,
          listeners: {
            activate: function (tab) {
              var errArray = sasAdapter.getSasErrors();
              var html = "<div>";
              for (var i = 0; i < errArray.length; i++) {
                html += '<p>' + errArray[i].time.toString() + '</p>';
                html += '<p>Sas Program: ' + errArray[i].sasProgram + '</p>';
                html += '<pre>' + errArray[i].message + '</pre>';
                html += '<hr class="x-component  x-component-default" style="margin-top:20px;margin-bottom:15px;">';
              }
              html += "</div>";
              this.update(html);
            },
            added: function () {
              var errArray = sasAdapter.getSasErrors();
              var badgeHtml = this.up().getBadge(errArray.length);
              this.setTitle(this.title + badgeHtml);
            }
          },
        }
      ],

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
      }
    }
  ],
  listeners: {
    close: function() {
      sasAdapter.unsetDebugMode();
    },
    afterrender: function() {
      var width = Math.min(Ext.getBody().getViewSize().width, 800);
      this.setWidth(width);
      this.setHeight(Ext.getBody().getViewSize().height);
    }
  }
});
