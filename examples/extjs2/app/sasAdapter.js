/* global Ext, h54s, serverData, setTimeout */
Ext.define('h54sExample.sasAdapter', {
  alternateClassName: 'sasAdapter',
  singleton: true,

  constructor: function () {
    //TODO: edit/remove url
    this._adapter = new h54s({
      hostUrl: 'http://server57562.uk2net.com/'
    });
  },

  login: function (user, pass, callback) {
    try {
      this._adapter.login(user, pass, function (status) {
        if (status === -1) {
          callback('Wrong username or password');
        } else {
          callback();
        }
      });
    } catch (e) {
      callback(e.message);
    }
  },

  call: function (sasProgram, tables, callback) {
    if (!this.msgWindow) {
      this.msgWindow = Ext.create('widget.h54stoast');
    }

    var me = this;
    var msg = this.msgWindow.addLoadingMessage(sasProgram);

    try {
      this._adapter.call(sasProgram, tables, function (err, res) {
        if (err && (err.type === 'notLoggedinError' || err.type === 'loginError')) {
          //TODO: edit app name
          var loginWindow = Ext.create('widget.LoginWindow');
          loginWindow.show();
        } else {
          if (err) {
            msg.setError();
          } else {
            msg.setLoaded();
          }
          if (res && res.usermessage) {
            me.msgWindow.addUserMessage(res.usermessage);
          }
          callback(err, res);
        }

        //update debug data
        setTimeout(function () {
          var debugWindow = Ext.getCmp('debugWindow');
          if (debugWindow) {
            debugWindow.updateData();
          }
        }, 10);
      });
    } catch (e) {
      callback(e.message);
      setTimeout(function () {
        msg.setError();
      }, 200);
    }
  },

  createTable: function (table, macro) {
    return new h54s.Tables(table, macro);
  },

  setDebugMode: function () {
    this._adapter.setDebugMode();
  },

  unsetDebugMode: function () {
    this._adapter.unsetDebugMode();
  },

  getDebugMode: function () {
    return this._adapter.debug;
  },

  getSasErrors: function () {
    return this._adapter.getSasErrors();
  },

  getDebugData: function () {
    return this._adapter.getDebugData();
  },

  getApplicationLogs: function () {
    return this._adapter.getApplicationLogs();
  },

  getFailedRequests: function () {
    return this._adapter.getFailedRequests();
  },

  clearApplicationLogs: function () {
    this._adapter.clearApplicationLogs();
  },
  clearDebugData: function () {
    this._adapter.clearDebugData();
  },
  clearSasErrors: function () {
    this._adapter.clearSasErrors();
  },
  clearFailedRequests: function () {
    this._adapter.clearFailedRequests();
  },

  //TODO: remove when date values are prefixed wit dt_ in SAS
  fromSasDateTime: function(time) {
    return this._adapter._utils.fromSasDateTime(time);
  }
});
