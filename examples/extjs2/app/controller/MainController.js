/* global Ext, sasAdapter, Highcharts, $ */
Ext.define('h54sExample.controller.MainController', {
  extend : 'Ext.app.Controller',

  onLaunch: function() {
    this.startup();
  },

  startup: function() {
    var me = this;
    sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', null, function (err, res) {
      var loading = Ext.get('loadingWrapper');
      if (err) {
        if (loading) {
          loading.remove();
        }
        Ext.MessageBox.alert('Error', 'Could not make initial contact with server.');
      } else {
        if (res.person) {
          Ext.create('h54sExample.view.MainViewport', {
            listeners: {
              afterRender: function () {
                var loading = Ext.get('loadingWrapper');
                if (loading) {
                  loading.remove();
                }

                me.updateReports(res);
                me.updatePieData(res);
                me.updateByUser(res);
                me.updateGrid(res);
              }
            }
          });
        } else {
          if (loading) {
            loading.remove();
          }
          Ext.MessageBox.alert('Error', 'No user found.');
        }
      }
    });
  },

  updateReports: function(data) {
    if (!data.last30daysrpt || !data.last30daysstp) {
      Ext.MessageBox.alert('Error', 'No data for last 30 days found.');
      return;
    }

    if (!data.last30daysrpt || !data.last30daysstp) {
      Ext.MessageBox.alert('Error', 'No data for last 30 days found.');
      return;
    }


    var chartData = [];
    var rec, i;
    for (i = 0; i < data.last30daysrpt.length; i++) {
      rec = data.last30daysrpt[i];
      chartData.push([rec.nearestHour, rec.wrsCount]);
    }


    var chartDataStp = [];
    for (i = 0; i < data.last30daysstp.length; i++) {
      rec = data.last30daysstp[i];

      //TODO: rename nearestHour to dt_nearestHour in SAS
      var jsHour = sasAdapter.fromSasDateTime(rec.nearestHour);

      chartDataStp.push([jsHour.getTime(), rec.stpCount]);
    }

    var store = Ext.getStore('ByTimeStore');
    store.getProxy().setData({
      wrsReports: chartData,
      stpReports: chartDataStp
    });
    store.load();
  },

  updatePieData: function(data) {
    var donutLev0 = data.donutLev0;
    var donutLev1 = data.donutLev1;
    var donutLev2 = data.donutLev2;

    if (!donutLev1 || !donutLev2) {
      Ext.MessageBox.alert('Error', 'No donutLev1 or donutLev2 found.');
      return;
    }

    function getParentIndex(donutLev1, parent) {
      for (var i = 0 ; i < donutLev1.length ; i++){
        var rec = donutLev1[i];
        if (rec.value === parent){
          return i;
        }
      }
    }

    var lev0Data = [];
    var i, rec, point;
    for (i = 0 ; i < donutLev0.length ; i++) {
      // btw. level 0 always have 0 point...
      rec = donutLev0[i];

      point = {
        name: rec.value,
        y: rec.count,
        level: 0,
        parent: rec.parent && rec.parent
      };
      point.color = '#FFFFFF';


      lev0Data.push(point);
    }

    var lev1Data = [];
    for (i = 0 ; i < donutLev1.length ; i++) {
      rec = donutLev1[i];

      point = {
        name: rec.value,
        y: rec.count,
        level: 1,
        parent: rec.parent && rec.parent
      };
      point.color = Highcharts.getOptions().colors[i];

      if (rec.color){
        point.color = rec.color;
      }
      if (point.name === '' || point.name === ' '){
        point.color = '#F1F1F1';
      }

      lev1Data.push(point);
    }

    var lev2Data = [];
    for (i = 0 ; i < donutLev2.length ; i++) {
      rec = donutLev2[i];

      point = {
        name: rec.value,
        y: rec.count,
        level: 2,
        parent: rec.parent && rec.parent
      };

      var index = getParentIndex(donutLev1 , rec.parent);
      if (index !== undefined && index >= 0){
        var brightness = 0.2 - (i / donutLev2.length) / 5;
        var newColor = Highcharts.Color(Highcharts.getOptions().colors[index]).brighten(brightness).get();
        point.color = newColor;
      }

      if (rec.color){
        point.color = rec.color;
      }
      if (point.name === '' || point.name === ' '){
        point.color = '#F1F1F1';
      }

      lev2Data.push(point);
    }

    var store = Ext.getStore('ByLocationStore');
    store.getProxy().setData({
      lev0Data: lev0Data,
      lev1Data: lev1Data,
      lev2Data: lev2Data
    });
    store.load();

    this.updateBreadcrumb(donutLev0[0].value);
  },

  updateByUser: function(data) {
    var toplevelUser = data.toplevelUser;

    if (!toplevelUser){
      Ext.MessageBox.alert('Error', 'No toplevelUser found.');
      return;
    }

    var chartData = [];
    var categories = [];
    for (var i = 0 ; i < toplevelUser.length ; i++){
      var rec = toplevelUser[i];

      chartData.push([rec.username, rec.count]);
      categories.push(rec.username);
    }

    var store = Ext.getStore('ByUserStore');
    store.getProxy().setData({
      data: chartData,
      categories: categories
    });
    store.load();
  },

  updateGrid: function(res) {
    var data = res.toplevelProcess;
    var store = Ext.getStore('GridStore');
    store.getProxy().setData(data);
    store.load();
  },

  updateTimespan: function(javastart, javaend, sasstart, sasend) {
    var me = this;

    var table = sasAdapter.createTable([{
      javastart: javastart,
      javaend: javaend,
      sasstart: sasstart,
      sasend: sasend
    }],'timespan');

    sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/updateTimespan', table, function(err, res){
      if (err){
        Ext.MessageBox.alert('Error', 'Could not call updateTimespan.');
      } else {
        if (res) {
          me.updatePieData(res);
          me.updateByUser(res);
          me.updateGrid(res);
        }
      }
    });
  },

  updateBreadcrumb: function(data) {
    var me = this;
    var path = '';
    var breadcrumb = Ext.getCmp('breadcrumbNav');

    if (breadcrumb){
      breadcrumb.removeAll(true);
      var buttons = data.split('/');
      if (data === '/' || data === ''){
        buttons = [
          ''
        ];
      }

      var handlerFn = function(){
        var breadcrumbPoint = {
          breadcrumbLevel: 0,
          breadcrumbCentre: this.currentPath,
          breadcrumbY: 0,
          currentDir: this.currentDir
        };
        me.onSubdirectoryClick(breadcrumbPoint);
      };

      for (var i = 0 ; buttons && i < buttons.length ; i++){
        var buttonText = buttons[i] + '/';
        path += buttonText;
        var disabled = i === buttons.length - 1;
        var dir = i === 0 ? 'up' : 'down';

        var buttonPath = Ext.decode(Ext.encode({text: path})).text;
        buttonPath = buttonPath.substr(0, buttonPath.length - 1);

        var button = Ext.create('Ext.Button', {
          text: buttonText,
          margin: '0 10 0 0',
          disabled: disabled,
          currentPath: buttonPath,
          currentDir: dir,
          handler: handlerFn
        });
        breadcrumb.add(button);
      }
    }
  },

  onSubdirectoryClick: function(point) {
    var me = this;
    var chart = $('#timeReportsChart').highcharts();
    if (chart){
      var extremes = chart.xAxis[0].getExtremes();

      var path = '';
      var dir = 'none';

      var level = point.level || point.breadcrumbLevel;
      var pieChart = $('#pieChart').highcharts();
      var centre = '';
      if (point.breadcrumbCentre !== undefined){
        centre = point.breadcrumbCentre;
      } else {
        centre = pieChart.series[0].data[0].name;
      }

      if (centre === undefined || centre === '/'){
        centre = '';
      }

      if (level === 0){
        path = centre;
        dir = point.currentDir || 'up';
      } else if (level === 1){
        path = centre+'/'+point.name;
        dir = 'down';
      } else if (level === 2){
        path = centre+'/'+point.parent+'/'+point.name;
        dir = 'down';
      }

      var jsMin = Math.round(extremes.min);
      var jsMax = Math.round(extremes.max);

      var table = sasAdapter.createTable([{
        javastart: jsMin,
        javaend: jsMax,
        sasstart: new Date(jsMin),
        sasend: new Date(jsMax)
      }],'timespan');

      table.add([{
        count: point.y || point.breadcrumbY,
        path: $.trim(path), //ie8 doesn't have String.prototype.trim() implemented
        dir: dir
      }],'clicked');


      sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillPie', table, function(err, res){
        if (err){
          Ext.MessageBox.alert('Error', 'Could not call drillPie.');
          return;
        }

        me.updatePieData(res);
        me.updateByUser(res);
        me.updateGrid(res);
      });
    }
  },

  showDrillHour: function(timeMs) {
    if (!timeMs) {
      Ext.MessageBox.alert('Warn: No x timestamp found.');
      return;
    }

    var timeMsEnd = timeMs + 6 * 60 * 60 * 1000 - 1;

    var sasStart = new Date(timeMs);
    var sasEnd = new Date(timeMsEnd);

    var table = sasAdapter.createTable([{
      javastart: timeMs,
      javaend: timeMsEnd,
      sasstart: sasStart,
      sasend: sasEnd
    }], 'timespan');


    sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillHour', table, function(err, res) {
      if (err) {
        Ext.MessageBox.alert('Warning', 'Could not call drillHour.');
      } else {
        var win = Ext.create('h54sExample.view.WindowDrillHour');
        var fromString = Ext.util.Format.date(new Date(timeMs), 'Y-m-d H:i:s');
        var endString = Ext.util.Format.date(new Date(timeMsEnd), 'Y-m-d H:i:s');

        if (!res.byProgram) {
          Ext.MessageBox.alert('Warning', 'No byProgram object found.');
          return;
        }

        win.setTitle('From ' + fromString + ' to ' + endString);

        var ds = res.byProgram;

        var data = [];
        for (var i = 0; i < ds.length; i++) {
          var row = ds[i];

          if (row.pType === 'STP' && row.datetime) {
            row.datetime = Ext.util.Format.date(sasAdapter.fromSasDateTime(row.datetime), 'Y-m-d H:i:s');
          } else {
            row.datetime = Ext.util.Format.date(new Date(row.datetime), 'Y-m-d H:i:s');
          }

          data.push(row);
        }

        var store = Ext.getStore('DrillHourStore');
        store.getProxy().setData(data);
        store.load();

        win.show();
      }
    });
  }
});
