app.controller('dashboardCtrl', ['$scope', '$location', 'sasAdapter', '$rootScope', 'stateData', function($scope, $location, sasAdapter, $rootScope, stateData) {
  $scope.loaded = false;
  if(stateData.librarylist) {
    $scope.libraryList = stateData.librarylist;
    $scope.loaded = true;
  } else {
    sasAdapter.call('/AJAX/h54s_test/libraryList').then(function(res) {
      $scope.libraryList = res.librarylist;
      $scope.loaded = true;
      stateData.librarylist = res.librarylist;
    }, function(err) {
      if(err.type === 'notLoggedinError' || err.type === 'loginError') {
        $location.path('/login');
      }
    });
  }

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);

  $scope.libname = stateData.current.name;
  $scope.rowCollection = stateData.current.rows;

  $scope.loadLib = function(lib) {
    $scope.libname = lib.libname;
    sasAdapter.addTable([
      {
        libraryName: lib.libname
      }
    ], 'lib');
    stateData.current.name = lib.libname;

    sasAdapter.call('/AJAX/h54s_test/datasetList').then(function(res) {
      $scope.rowCollection = res.tablelist;
      stateData.current.rows = res.tablelist;
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
  $scope.login = function(e) {
    if(!$scope.user)
      return;

    sasAdapter.login($scope.user.username, $scope.user.password).then(function() {
      $location.path('/');
    }, function(err) {
      $scope.error = err.message;
    });
  };
}]);

app.controller('dataCtrl', ['$scope', '$location', '$routeParams', 'sasAdapter', function($scope, $location, $routeParams, sasAdapter) {
  $scope.loaded = false;
  sasAdapter.addTable([
    {
      libname: $routeParams.libname,
      memname: $routeParams.memname
    }
  ], 'data');

  $scope.rowCollection = [];
  $scope.displayedCollection = [].concat($scope.rowCollection);
  $scope.keys = [];

  sasAdapter.call('/AJAX/h54s_test/getData').then(function(res) {
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

  function setHeight() {
    var headerHeight = $('.nav.nav-tabs').height();
    var height = $(window).height() - headerHeight - 10;
    $('#debugWindow div').height(height);
  }
}]);
