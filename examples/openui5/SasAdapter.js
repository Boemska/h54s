sap.ui.define([
  'sap/ui/base/Object',
  'h54s/view/LoginDialog'
], function(Object, LoginDialog) {
  var instance;

	var sasAdapter = Object.extend("h54s.sasAdapter",{
    _adapter: new h54s({hostUrl: serverData.url}),

    call: function(sasProgram, tables, callback) {
      var self = this;
      try {
        this._adapter.call(sasProgram, tables, function(err, res) {
          if(err && (err.type === 'notLoggedinError' || err.type === 'loginError')) {
            LoginDialog.open();
          } else {
            callback(err, res);
          }
        });
      } catch(e) {
        callback(e);
      }
    },

    createTable: function(table, macro) {
      return new h54s.Tables(table, macro);
    },

    login: function(user, pass, callback) {
      try {
        this._adapter.login(user, pass, function(status) {
          if(status === -1) {
            callback('Wrong username or password');
          } else {
            callback();
          }
        });
      } catch (e) {
        callback(e);
      }
    },

    setDebugMode: function() {
      this._adapter.setDebugMode();
    },

    unsetDebugMode: function() {
      this._adapter.unsetDebugMode();
    },

    getSasErrors: function() {
      return this._adapter.getSasErrors();
    },

    getDebugData: function() {
      return this._adapter.getDebugData();
    },

    getApplicationLogs: function() {
      return this._adapter.getApplicationLogs();
    },

    getFailedRequests: function() {
      return this._adapter.getFailedRequests();
    },

    clearApplicationLogs: function() {
      this._adapter.clearApplicationLogs();
    },

    clearDebugData: function() {
      this._adapter.clearDebugData();
    },

    clearSasErrors: function() {
      this._adapter.clearSasErrors();
    },

    clearFailedRequests: function() {
      this._adapter.clearFailedRequests();
    }

	});

  return {
    getInstance: function () {
      if (!instance) {
        instance = new sasAdapter();
      }
      return instance;
    }
  };
});
