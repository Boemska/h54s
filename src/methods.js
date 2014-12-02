/*global h54s*/
h54s.prototype.call = function(sasProgram, callback) {
  var self = this;
  var callArgs = arguments;
  if (!callback && typeof callback !== 'function'){
    throw new Error('You must provide callback');
  }
  if(!sasProgram) {
    throw new Error('You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new Error('First parameter should be string');
  }

  // initialize dynamically generated xhr options first
  var myprogram;
  if (this.systemtype == 'WPS') {
    myprogram = this.metaProgram + '.sas';
  } else if (this.systemtype == 'SAS') {
    myprogram = this.metaProgram;
  }

  ajax.post(this.url, {
    _program: sasProgram,
    _debug: this.debug ? 1 : 0,
    _service: this.sasService,
  }).success(function(res) {
    if(/<form.+action="Logon.do".+/.test(res.responseText) && self.autoLogin) {
      self.logIn(function(status) {
        if(status === 200) {
          self.call.apply(self, callArgs);
        } else {
          callback(new Error('Unable to login'));
        }
      });
    } else if(/<form.+action="Logon.do".+/.test(res.responseText) && !self.autoLogin) {
      callback(callback(new Error('You are not logged in')));
    } else {
      callback(undefined, res);
    }
  }).error(function(res) {
    callback(res);
  });
};

h54s.prototype.setCredentials = function(user, pass) {
  if(!user || !pass) {
    throw new Error('Missing credentials');
  }
  this.user = user;
  this.pass = pass;
};

h54s.prototype.logIn = function(/* (user, pass, callback) | callback */) {
  var callback;
  if((!this.user && !arguments[0]) || (!this.pass && !arguments[1])) {
    throw new Error('Credentials not set');
  }
  if(typeof arguments[0] === 'string' && typeof arguments[1] === 'string') {
    this.setCredentials(this.user || arguments[0], this.pass || arguments[1]);
    callback = arguments[2];
  } else {
    callback = arguments[0];
  }

  var callCallback = function(status) {
    if(typeof callback === 'function') {
      callback(status);
    }
  };

  if(this.hostUrl) {
    this.loginUrl = this.hostUrl + this.loginUrl.slice();
  }

  ajax.post(this.loginUrl, {
    _debug: this.debug ? 1 : 0,
    _sasapp: "Stored Process Web App 9.3",
    _service: this.sasService,
    ux: this.user,
    px: this.pass,
  }).success(function(res) {
    callCallback(res.status);
  }).error(function(res) {
    callCallback(res.status);
  });
};


