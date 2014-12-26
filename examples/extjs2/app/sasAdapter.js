Ext.define('h54sExample.sasAdapter', {
  alternateClassName: 'sasAdapter',
  singleton: true,

  constructor: function() {
    this._adapter = new h54s({
      hostUrl: serverData.url
    });
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
      callback(e.message);
    }
  },

  call: function(sasProgram, callback) {
    this.sasProgram = sasProgram;
    this.callback = callback;
    try {
      this._adapter.call(sasProgram, function(err, res) {
        if(err && (err.type === 'notLoggedinError' || err.type === 'loginError')) {
          var loginWindow = Ext.create('h54sExample.view.LoginWindow');
          var loading = Ext.get('loadingWrapper');
          if (loading){
            loading.remove();
          }
          loginWindow.show();
        } else {
          callback(err, res);
        }
      });
    } catch(e) {
      callback(e.message);
    }
  },

  addTable: function(table, macro) {
    this._adapter.addTable(table, macro);
  },

  retry: function() {
    this.call(this.sasProgram, this.callback);
  },

  setDebugMode: function() {
    this._adapter.setDebugMode();
  },

  unsetDebugMode: function() {
    this._adapter.unsetDebugMode();
  },

  getDebugMode: function() {
    return this._adapter.debug;
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

  //TODO: remove when date values are prefixed wit dt_ in SAS
  fromSasDateTime: function(time) {
    return this._adapter._utils.fromSasDateTime(time);
  }
});
