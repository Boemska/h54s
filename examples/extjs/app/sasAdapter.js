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
    try {
      this._adapter.call(sasProgram, function(err, res) {
        if(err && err.type === 'notLoggedinError') {
          var loginWindow = Ext.create('h54sExample.view.LoginWindow');
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
  }
});
