/* global sasAdapter:true, setTimeout, serverData, w2popup, $, w2ui, h54s, document */
sasAdapter = new h54s({
  hostUrl: serverData.url
});

sasAdapter.openLoginPopup = function() {
  var looginPopup = w2popup.open({
    title: 'SAS Logon Manager',
    body: '<div id="login-form"></div>',
    width: 400,
    height: 220,
    modal: true,
    showClose: false,
    onOpen: function() {
      setTimeout(function() {
        $('#login-form').w2form({
          name: 'loginForm',
          fields: [
            {
              name: 'user',
              type: 'text',
              required: true,
              html: {
                caption: 'User ID'
              }
            }, {
              name: 'pass',
              type: 'password',
              required: true,
              html: {
                caption: 'Password'
              }
            }
          ],
          actions: {
            save: function() {
              if(this.validate().length <= 0) {
                if(!this.loggingIn) {
                  this.loggingIn = true;
                  this.lock();

                  var self = this;
                  sasAdapter.login(this.record.user, this.record.pass, function(status) {
                    self.loggingIn = false;
                    self.unlock();

                    if(status === -1) {
                      self.error('Wrong username or password');
                    } else if(status === 200) {
                      looginPopup.close();
                    } else {
                      self.error('There was an error. Please try again.');
                    }
                  });
                }
              }
            }
          }
        });

        w2ui.loginForm.fields[1].$el.on('keypress', function (event) {
          if(event.keyCode === 13) {
            setTimeout(function() {
              w2ui.loginForm.action('save');
            }, 0);
          }
        });
      }, 0);
    },
    onClose: function() {
      w2ui.loginForm.destroy();
    }
  });
};

sasAdapter.showDebugPopup = function() {
  var debugPopup = w2popup.open({
    body: '<div id="debug-tabs"></div><div id="debug-tab-data"></div><button id="debug-clear-btn" class="btn">Clear</button>',
    width: 10000,
    height: 10000,
    showClose: true,
    onOpen: function() {
      setTimeout(function() {
        $('#debug-tabs').w2tabs({
          name: 'debugTabs',
          active: 'appLogs',
          right: '<span id="debug-popup-close"></span>',
          tabs: [
            {
              id: 'appLogs',
              caption: 'Application Logs <span class="badge">0</span>',
              onRefresh: function(evt) {
                updateTab(evt.target);
              }
            }, {
              id: 'debugData',
              caption: 'Debug Data <span class="badge">0</span>',
              onRefresh: function(evt) {
                updateTab(evt.target);
              }
            }, {
              id: 'sasErrors',
              caption: 'SAS Errors <span class="badge">0</span>',
              onRefresh: function(evt) {
                updateTab(evt.target);
              }
            }, {
              id: 'failedReq',
              caption: 'Failed Requests <span class="badge">0</span>',
              onRefresh: function(evt) {
                updateTab(evt.target);
              }
            }
          ],
          onClick: function() {
            setTimeout(function() {
              $('#debug-popup-close').on('click', function() {
                debugPopup.close();
              });
            }, 0);
          },
          onRender: function() {
            setTimeout(function() {
              $('#debug-popup-close').on('click', function() {
                debugPopup.close();
              });

              $('#debug-clear-btn').on('click', function() {
                $('#debug-tab-data').empty();

                switch(w2ui.debugTabs.active) {
                  case 'appLogs':
                    $('#tabs_debugTabs_tab_appLogs .badge').html(0);
                    sasAdapter.clearApplicationLogs();
                    break;
                  case 'debugData':
                    $('#tabs_debugTabs_tab_debugData .badge').html(0);
                    sasAdapter.clearDebugData();
                    break;
                  case 'sasErrors':
                    $('#tabs_debugTabs_tab_sasErrors .badge').html(0);
                    sasAdapter.clearSasErrors();
                    break;
                  case 'failedReq':
                    $('#tabs_debugTabs_tab_failedReq .badge').html(0);
                    sasAdapter.clearFailedRequests();
                    break;
                }
              });
            }, 0);
          }
        });
        var tabDataHeight = $('#w2ui-popup').height() - $('#debug-tabs').outerHeight() - 17;
        $('#debug-tab-data').height(tabDataHeight);
      }, 0);
    },
    onClose: function() {
      w2ui.debugTabs.destroy();
    }
  });
};

function updateTab(tabId) {
  var logs;
  setTimeout(function() {
    $('#debug-tab-data').empty();

    switch(tabId) {
      case 'appLogs':
        logs = sasAdapter.getApplicationLogs();
        $('#tabs_debugTabs_tab_appLogs .badge').html(logs.length);
        w2ui.debugTabs.tabs[0].caption = w2ui.debugTabs.tabs[0].caption.replace(/(\d+)/, logs.length);
        break;
      case 'debugData':
        logs = sasAdapter.getDebugData();
        $('#tabs_debugTabs_tab_debugData .badge').html(logs.length);
        w2ui.debugTabs.tabs[1].caption = w2ui.debugTabs.tabs[1].caption.replace(/(\d+)/, logs.length);
        break;
      case 'sasErrors':
        logs = sasAdapter.getSasErrors();
        $('#tabs_debugTabs_tab_sasErrors .badge').html(logs.length);
        w2ui.debugTabs.tabs[2].caption = w2ui.debugTabs.tabs[2].caption.replace(/(\d+)/, logs.length);
        break;
      case 'failedReq':
        logs = sasAdapter.getFailedRequests();
        $('#tabs_debugTabs_tab_failedReq .badge').html(logs.length);
        w2ui.debugTabs.tabs[3].caption = w2ui.debugTabs.tabs[3].caption.replace(/(\d+)/, logs.length);
        break;
    }

    switch(w2ui.debugTabs.active) {
      case 'appLogs':
        logs = sasAdapter.getApplicationLogs();
        $.each(logs, function(ind, logObj) {
          var logDomObj = $('<div>', {class: 'logItem'});
          logDomObj.append('<p>' + logObj.time.toString() + '</p>');
          logDomObj.append('<pre>' + logObj.message + '</pre>');
          $('#debug-tab-data').append(logDomObj);
        });
        break;
      case 'debugData':
        logs = sasAdapter.getDebugData();
        $.each(logs, function(ind, logObj) {
          var logDomObj = $('<div>', {class: 'logItem'});
          logDomObj.append('<p>' + logObj.time.toString() + '</p>');
          logDomObj.append('<pre><a class="toggle" href="#">' + logObj.sasProgram + '</a></pre>');
          logDomObj.append('<div class="collapse">' + logObj.debugHtml + '</div>');

          logDomObj.find('.toggle').click(function() {
            $(this).parent().next().slideToggle(100);
          });
          $('#debug-tab-data').append(logDomObj);
        });
        break;
      case 'sasErrors':
        logs = sasAdapter.getSasErrors();
        $.each(logs, function(ind, logObj) {
          var logDomObj = $('<div>', {class: 'logItem'});
          logDomObj.append('<p>' + logObj.time.toString() + '</p>');
          logDomObj.append('<p>' + logObj.sasProgram + '</p>');
          logDomObj.append('<pre>' + logObj.message + '</pre>');
          $('#debug-tab-data').append(logDomObj);
        });
        break;
      case 'failedReq':
        logs = sasAdapter.getFailedRequests();
        $.each(logs, function(ind, logObj) {
          var logDomObj = $('<div>', {class: 'logItem'});
          logDomObj.append('<p>' + logObj.time.toString() + '</p>');
          logDomObj.append('<pre><a class="toggle" href="#">' + logObj.sasProgram + '</a></pre>');
          logDomObj.append('<div class="collapse">' + logObj.responseHtml + '</div>');

          logDomObj.find('.toggle').click(function() {
            $(this).parent().next().slideToggle(100);
          });
          $('#debug-tab-data').append(logDomObj);
        });
        break;
    }
  }, 0);

}

$(document).ready(function() {
  $(document).on('keydown', function(evt) {
    if(evt.altKey && evt.ctrlKey && evt.keyCode === 68) {
      if(!sasAdapter.debug) {
        sasAdapter.setDebugMode();
        $('#debug-btn').show();
      } else {
        sasAdapter.unsetDebugMode();
        $('#debug-btn').hide();
      }
    }
  });

  $('#debug-btn').click(function() {
    sasAdapter.showDebugPopup();
  });
});
