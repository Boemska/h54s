/* global app, alert, $, window */
app.controller('dashboardCtrl', ['$scope', '$location', 'sasAdapter', '$rootScope', 'stateData', function($scope, $location, sasAdapter, $rootScope, stateData) {
  $scope.loaded = false;
  if(stateData.libraryList) {
    $scope.libraryList = stateData.libraryList;
    $scope.loaded = true;
  } else {
    sasAdapter.call('/AJAX/h54s_test/libraryList').then(function(res) {
      $scope.libraryList = res.libraryList;
      $scope.loaded = true;
      stateData.libraryList = res.libraryList;
    }, function(err) {
      if(err.type === 'notLoggedinError' || err.type === 'loginError') {
        $location.path('/login');
      }
    });
  }

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);

  $scope.LIBNAME = stateData.current.name;
  $scope.rowCollection = stateData.current.rows;

  $scope.loadLib = function(lib) {
    $scope.LIBNAME = lib.LIBNAME;
    var table = sasAdapter.createTable([
      {
        libraryName: lib.LIBNAME
      }
    ], 'lib');
    stateData.current.name = lib.LIBNAME;

    sasAdapter.call('/AJAX/h54s_test/datasetList', table).then(function(res) {
      $scope.rowCollection = res.tableList;
      stateData.current.rows = res.tableList;
    }, function(err) {
      if(err.type === 'notLoggedinError' || err.type === 'loginError') {
        $location.path('/login');
      } else {
        alert(err.message);
      }
    });
  };

  $scope.go = function(libname, memname) {
    var path = '/data/' + libname + '/' + memname;
    $location.path(path);
  };

  $rootScope.$watch('debugMode', function() {
    $scope.debugMode = $rootScope.debugMode;
  });

  $scope.showDebugWindow = function() {
    $rootScope.showDebugWindow = true;
  };

}]);


app.controller('loginCtrl', ['$scope', '$location', 'sasAdapter', function($scope, $location, sasAdapter) {
  $scope.login = function() {
    if(!$scope.user)
      return;

    if(!$scope.loggingIn) {
      $scope.loggingIn = true;
      sasAdapter.login($scope.user.username, $scope.user.password).then(function() {
        $scope.loggingIn = false;
        $location.path('/');
      }, function(err) {
        $scope.loggingIn = false;
        $scope.error = err.message;
      });
    }
  };
}]);

app.controller('dataCtrl', ['$scope', '$location', '$routeParams', 'sasAdapter', function($scope, $location, $routeParams, sasAdapter) {
  $scope.loaded = false;
  var table = sasAdapter.createTable([
    {
      libname: $routeParams.libname,
      memname: $routeParams.memname
    }
  ], 'data');

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);
  $scope.keys = [];

  sasAdapter.call('/AJAX/h54s_test/getData', table).then(function(res) {
    $scope.rowCollection = res.outputdata;
    $scope.keys = Object.keys(res.outputdata[0]);
    $scope.loaded = true;
  }, function(err) {
    if(err.type === 'notLoggedinError' || err.type === 'loginError') {
      $location.path('/login');
    } else {
      $location.path('/');
      alert(err.message);
    }
  });
}]);

app.controller('appCtrl', ['$scope', '$location', 'sasAdapter', function($scope, $location, sasAdapter) {
  var keys = [
    {
      code: 17,
      name: 'ctrl',
      pressed: false
    }, {
      code: 18,
      name: 'alt',
      pressed: false
    }, {
      code: 68,
      name: 'd',
      pressed: false
    }
  ];
  var allPressed;

  $scope.keydown = function(e) {
    allPressed = true;
    for(var i = 0; i < keys.length; i++) {
      if(e.keyCode === keys[i].code) {
        keys[i].pressed = true;
      }
      if(!keys[i].pressed) {
        allPressed = false;
      }
    }

    if(allPressed) {
      sasAdapter.setDebugMode();
    }
  };

  $scope.keyup = function(e) {
    for(var i = 0; i < keys.length; i++) {
      if(e.keyCode === keys[i].code) {
        keys[i].pressed = false;
      }
    }
  };
}]);

app.controller('debugWindowCtrl', ['$scope', 'sasAdapter', '$rootScope', '$sce', function($scope, sasAdapter, $rootScope, $sce) {

  $rootScope.$watch('showDebugWindow', function() {
    if($rootScope.showDebugWindow) {
      $scope.appLogs = sasAdapter.getApplicationLogs();
      $scope.debugData = sasAdapter.getDebugData().map(function(el) {
        return {
          time: el.time,
          message: $sce.trustAsHtml(el.debugHtml),
          sasProgram: el.sasProgram
        };
      });
      $scope.sasErrors = sasAdapter.getSasErrors();
      $scope.failedRequests = sasAdapter.getFailedRequests().map(function(el) {
        return {
          time: el.time,
          message: $sce.trustAsHtml(el.responseHtml),
          sasProgram: el.sasProgram
        };
      });
      setHeight();
    }
  });

  $scope.closeDebugWindow = function() {
    $rootScope.showDebugWindow = false;
  };

  $scope.clearSasErrors = function() {
    sasAdapter.clearSasErrors();
    $scope.sasErrors = [];
  };

  $scope.clearDebugData = function() {
    sasAdapter.clearDebugData();
    $scope.debugData = [];
  };

  $scope.clearApplicationLogs = function() {
    sasAdapter.clearApplicationLogs();
    $scope.appLogs = [];
  };

  $scope.clearFailedRequests = function() {
    sasAdapter.clearFailedRequests();
    $scope.failedRequests = [];
  };

  function setHeight() {
    var headerHeight = $('.nav.nav-tabs').height();
    var height = $(window).height() - headerHeight - 10;
    $('#debugWindow div').height(height);
  }
}]);
