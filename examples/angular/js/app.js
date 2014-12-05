var app = angular.module('h54s_example', [
  'ngRoute'
]);
app.config(function($routeProvider) {
  $routeProvider.when('/', {
    templateUrl: 'partials/dashboard.html',
    controller: 'dashboardCtrl'
  });
  $routeProvider.when('/login', {
    templateUrl: 'partials/login.html',
    controller: 'loginCtrl'
  });
});
