/* global angular */
var app = angular.module('h54s_example', [
  'ngRoute',
  'smart-table'
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
  $routeProvider.when('/data/:libname/:memname', {
    templateUrl: 'partials/data.html',
    controller: 'dataCtrl'
  });
});
