/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
h54s.prototype.call = function(sasProgram, callback) {
  var self = this;
  var callArgs = arguments;
  var retryCount = 0;
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

  var params = {
    _program: sasProgram,
    _debug: this.debug ? 1 : 0,
    _service: this.sasService,
  };

  ajax.post(this.url, params).success(function(res) {
    if(/<form.+action="Logon.do".+/.test(res.responseText) && self.autoLogin) {
      self.login(function(status) {
        if(status === 200) {
          self.call.apply(self, callArgs);
        } else {
          callback(new Error('Unable to login'));
        }
      });
    } else if(/<form.+action="Logon.do".+/.test(res.responseText) && !self.autoLogin) {
      callback(callback(new Error('You are not logged in')));
    } else {
      if(!self.debug) {
        try {
          var resObj = JSON.parse(res.responseText);
          callback(undefined, resObj);
        } catch(e) {
          if(retryCount < self.counters.maxXhrRetries) {
            ajax.post(self.url, params).success(this.success).error(this.error);
            retryCount++;
            console.log("Retrying #" + retryCount);
          } else {
            callback(new Error('Unable to parse response json'));
          }
        }
      } else {
        //TODO: find and parse json
      }
    }
  }).error(function(res) {
    callback(new Error(res.statusText));
  });
};


/*
* Set credentials
*
* @param {string} user - Login username
* @param {string} pass - Login password
*
*/
h54s.prototype.setCredentials = function(user, pass) {
  if(!user || !pass) {
    throw new Error('Missing credentials');
  }
  this.user = user;
  this.pass = pass;
};

/*
* Login method
*
* @param {string} user - Login username
* @param {string} pass - Login password
* @param {function} callback - Callback function called when ajax call is finished
*
* OR
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/
h54s.prototype.login = function(/* (user, pass, callback) | callback */) {
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
    if(/<form.+action="Logon.do".+/.test(res.responseText)) {
      callCallback(-1);
    } else {
      callCallback(res.status);
    }
  }).error(function(res) {
    callCallback(res.status);
  });
};
