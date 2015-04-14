/* global app, h54s, serverData */
app.factory('sasAdapter', function($q, $rootScope) {
  var sasAdapter = new h54s({
    hostUrl: serverData.url
  });
  return {
    login: function(user, pass) {
      var deferred = $q.defer();
      try {
        sasAdapter.login(user, pass, function(status) {
          if(status === -1) {
            deferred.reject(new Error("Wrong username or password"));
          } else {
            deferred.resolve();
          }
        });
      } catch(e) {
        deferred.reject(e);
      }
      return deferred.promise;
    },
    //NOTE: h54s pending methods will not execute after login
    //that feature is not supported in angular
    call: function(sasProgram, table) {
      var deferred = $q.defer();
      sasAdapter.call(sasProgram, table, function(err, res) {
        if(err) {
          deferred.reject(err);
        } else {
          deferred.resolve(res);
        }
      });
      return deferred.promise;
    },
    createTable: function(table, macro) {
      return new h54s.Tables(table, macro);
    },
    setDebugMode: function() {
      if(!sasAdapter.debug) {
        sasAdapter.setDebugMode();
        $rootScope.debugMode = true;
      } else {
        sasAdapter.unsetDebugMode();
        $rootScope.debugMode = false;
      }
    },
    getDebugData: function() {
      return sasAdapter.getDebugData();
    },
    getApplicationLogs: function() {
      return sasAdapter.getApplicationLogs();
    },
    getSasErrors: function() {
      return sasAdapter.getSasErrors();
    },
    getFailedRequests: function() {
      return sasAdapter.getFailedRequests();
    },
    setCredentials: function(user, pass) {
      return sasAdapter.setCredentials(user, pass);
    },
    clearApplicationLogs: function() {
      sasAdapter.clearApplicationLogs();
    },
    clearDebugData: function() {
      sasAdapter.clearDebugData();
    },
    clearSasErrors: function() {
      sasAdapter.clearSasErrors();
    },
    clearFailedRequests: function() {
      sasAdapter.clearFailedRequests();
    }
  };
});

app.factory('stateData', function() {
  var libs = {
    librarylist: null,
    current: {
      name: null,
      rows: null
    }
  };
  return libs;
});
