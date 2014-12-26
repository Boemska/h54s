Ext.define('h54sExample.Application', {
  extend: 'Ext.app.Application',
  name: 'h54s Example',

  stores: [],

  requires: [
    'h54sExample.sasAdapter',
  ],

  views: [
    'h54sExample.view.MainViewport',
    'h54sExample.view.HighchartsContainer',
    'h54sExample.view.MyContainer2',
    'h54sExample.view.DateWindow',
    'h54sExample.view.WindowDrillHour',
    'h54sExample.view.WindowDrillUser'
  ],

  launch: function () {

    //    var map = new Ext.util.KeyMap(Ext.getBody(), {
    //      key: 68,
    //      ctrl: true,
    //      alt: true,
    //      handler: function() {
    //        if(!sasAdapter.getDebugMode()) {
    //          sasAdapter.setDebugMode();
    //          Ext.getCmp('debugWindowBtn').show();
    //        } else {
    //          sasAdapter.unsetDebugMode();
    //          Ext.getCmp('debugWindowBtn').hide();
    //        }
    //      },
    //      scope: this,
    //      defaultEventAction: "stopEvent"
    //    });
    this.startupService();
  },

  startupService: function () {
    var me = this;
    sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', function (err, res) {
      var loading = Ext.get('loadingWrapper');
      if (err) {
        if (loading) {
          loading.remove();
        }
        Ext.MessageBox.alert('Warning', 'Could not make initial contact with server.');
      } else {
        if (res.person) {
          Ext.create('h54sExample.view.MainViewport', {
            listeners: {
              afterRender: function () {
                var loading = Ext.get('loadingWrapper');
                if (loading) {
                  loading.remove();
                }

                me.initLast30Days(res);

                setTimeout(function () {
                  me.initPieByUser(res);
                  me.initPieBySubdirectory(res);
                  me.initTopProcesses(res);
                }, 5);
              }
            }
          });
        } else {
          if (loading) {
            loading.remove();
          }
          Ext.MessageBox.alert('Warning', 'No user found.');
        }
      }
    });
  },

  initLast30Days: function (data) {
    if (!data.last30daysrpt || !data.last30daysstp) {
      Ext.MessageBox.alert('No data for last 30 days found.');
      return;
    }

    var me = this;

    if (!data.last30daysrpt || !data.last30daysstp) {
      Ext.MessageBox.alert('No data for last 30 days found.');
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

      var sasHour = rec.nearestHour;
      //TODO: rename nearestHour to dt_nearestHour in SAS
      var jsHour = sasAdapter.fromSasDateTime(rec.nearestHour);

      chartDataStp.push([jsHour.getTime(), rec.stpCount]);
    }


    var chart = new Highcharts.StockChart({
      chart: {
        renderTo: 'highchartsContainer',
        type: 'column',
        zoomType: 'x'
      },
      rangeSelector: {
        buttons: [{
          type: 'day',
          count: 1,
          text: '1d'
        }, {
          type: 'week',
          count: 1,
          text: '1w'
        }, {
          type: 'all',
          text: 'All'
        }]
      },
      exporting: {
        enabled: false
      },
      xAxis: {
        ordinal: false,
        events: {
          afterSetExtremes: function (e) {
            me.updateTimespan(e.min, e.max, new Date(e.min), new Date(e.max));
            me.lastClicked = undefined;
          }
        }
      },
      legend: {
        enabled: true,
        verticalAlign: 'top'
      },
      navigator: {
        enabled: false,
        height: 0,
        margin: 0
      },
      scrollbar: {
        enabled: false
      },

      credits: {
        enabled: false
      },

      plotOptions: {
        column: {
          stacking: 'normal',
          dataGrouping: {
            forced: false,
            units: [[
              'hour',
              [6]
            ]]
          }
        },
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click: function (e) {
                var timeMs = this.x;
                if (!timeMs) {
                  Ext.MessageBox.alert('Warn: No x timestamp found.');
                  return;
                }

                var timeMsEnd = timeMs + 60 * 60 * 1000;

                var sasStart = new Date(timeMs);
                var sasEnd = new Date(timeMsEnd);

                var me = this;

                sasAdapter.addTable([{
                  javastart: timeMs,
                  javaend: timeMsEnd,
                  sasstart: sasStart,
                  sasend: sasEnd
                }], 'timespan');


                sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillHour', function(err, res) {
                  if (err) {
                    Ext.MessageBox.alert('Warning', 'Could not call drillHour.');
                  } else {
                    var win = Ext.create('h54sExample.view.WindowDrillHour');
                    var fromString = Ext.util.Format.date(new Date(timeMs), 'Y-m-d H:i:s');
                    var endString = Ext.util.Format.date(new Date(timeMsEnd), 'Y-m-d H:i:s');

                    win.setTitle('From ' + fromString + ' to ' + endString);
                    win.setData(res);

                    win.show();
                  }
                });
              }
            }
          }
        }
      },

      series: [{
        name: 'WRS Reports',
        data: chartData
      }, {
        name: 'STP Reports',
        data: chartDataStp
      }]

    });
  },

  initPieByUser: function(data) {
    var toplevelUser = data.toplevelUser;

    if (!toplevelUser){
      Ext.MessageBox.alert('No toplevelUser found.');
      return;
    }

    var chartData = [];
    var categories = [];
    for (var i = 0 ; i < toplevelUser.length ; i++){
      var rec = toplevelUser[i];

      chartData.push([rec.username, rec.count]);
      categories.push(rec.username);
    }

    $('#pieByUser').highcharts({
      title: {
        text: null
      },
      exporting: {
        enabled: false
      },
      tooltip: {
        formatter: function() {
          return '<b>' + this.point.name +':</b> '+ this.y;
        }
      },
      xAxis: {
        categories: categories,
        title: {
          text: null
        }
      },
      yAxis: {
        title: {
          text: null
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      },
      series: [{
        type: 'bar',
        name: 'Usage by User',
        data: chartData
      }]
    });
  },

  initPieBySubdirectory: function(data) {
    var me = this;
    var donutLev0 = data.donutLev0;
    var donutLev1 = data.donutLev1;
    var donutLev2 = data.donutLev2;

    if (!donutLev1 || !donutLev2){
      Ext.MessageBox.alert('No donutLev1 or donutLev2 found.');
      return;
    }

    function getParentIndex(donutLev1, parent){
      for (var i = 0 ; i < donutLev1.length ; i++){
        var rec = donutLev1[i];
        if (rec.value === parent){
          return i;
        }
      }
    }

    var lev0Data = [];
    var rec, i, point;
    for (i = 0 ; i < donutLev0.length ; i++){
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
    // initialize breadcrumb to level 0 folder
    me.updateBreadcrumb(donutLev0[0].value);



    var chartData = [];
    for (i = 0 ; i < donutLev1.length ; i++){
      rec = donutLev1[i];

      point = {
        name: rec.value,
        y: rec.count,
        level: 1,
        parent: rec.parent && rec.parent
      };
      point.color = Highcharts.getOptions().colors[i%(Highcharts.getOptions().colors.length)];

      if (rec.color){
        point.color = rec.color;
      }
      if (point.name === '' || point.name === ' '){
        point.color = '#FFFFFF';
      }

      chartData.push(point);
    }

    var chartDataLev2 = [];
    for (i = 0 ; i < donutLev2.length ; i++){
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
        var newColor = Highcharts.Color(
          Highcharts.getOptions().colors[index%(Highcharts.getOptions().colors.length)]
        ).brighten(brightness).get();
        point.color = newColor;
      }

      if (rec.color){
        point.color = rec.color;
      }
      if (point.name === '' || point.name === ' '){
        point.color = '#FFFFFF';
      }

      chartDataLev2.push(point);
    }


    $('#pieSubdirectory-innerCt').highcharts({
      chart: {
        type: 'pie'
      },
      exporting: {
        enabled: false
      },
      title: {
        text: null
      },
      tooltip: {
        formatter: function() {

          if(this.point.name === '' || this.point.name === ' ' ){
            return false ;
          } else {
            return this.point.name +': '+ this.y;
          }
        }
      },
      credits: {
        enabled: false
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          slicedOffset: 0,
          cursor: 'pointer',
          dataLabels: {
            enabled: true,
            style: {
              color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
            }
          }
        },
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click: function(e) {
                if (this.name !== '' && this.name !== ' '){
                  me.onSubdirectoryClick(this);
                  me.lastClicked = this.name;
                }

              }
            }
          }
        }
      },
      series: [
        {
          name: 'Level 0',
          data: lev0Data,
          size: '30%',
          dataLabels: {
            formatter: function () {
              return this.point.name;
            },
            color: 'white',
            distance: -20
          },
          seriesLevel: 0
        },
        {
          name: 'Level 1',
          data: chartData,
          size: '55%',
          innerSize: '30%',
          dataLabels: {
            formatter: function () {
              return this.point.name;
            },
            color: 'white',
            distance: -20
          },
          seriesLevel: 1
        },
        {
          name: 'Level 2',
          data: chartDataLev2,
          size: '80%',
          innerSize: '55%',
          seriesLevel: 2
        }]
    });
  },

  initTopProcesses: function(data) {

    var me = this;
    var res = data;

    var grid = Ext.getCmp('toplevelProcess');

    var newFields = [];
    var newColumns = [];


    var fields = [{
      dataIndex: 'shortName',
      text: 'Report Name',
      flex: 1
    }, {
      dataIndex: 'count',
      text: 'Count',
      flex: 0,
      width: 60
    }, {
      xtype: 'gridcolumn',
      dataIndex: 'pType',
      width: 60,
      text: '',
      flex: 0
    }];

    var renderFn = function(value, metaData, record, rowIndex, colIndex, store, view) {
      var newTooltip = record.get('programname');

      metaData.tdAttr = 'data-qtip="' + newTooltip + '"';
      return value;
    };

    var i;
    for (i = 0 ; i < fields.length ; i++){
      var descField = fields[i];

      var columnXType = 'gridcolumn';
      var fieldType = 'string';

      newFields.push({name: descField.dataIndex });

      var column = {
        xtype: columnXType,
        format: '0', // for numbercolumn , format it to whole number
        dataIndex: descField.dataIndex,
        text: descField.text,
        flex: descField.flex,
        width: descField.width,
        renderer: renderFn
      };

      newColumns.push(column);
    }

    if (!res.toplevelProcess){
      Ext.MessageBox.alert('Warning' , 'No toplevelProcess object found.');
      return;
    }
    var ds = res.toplevelProcess;

    var newData = [];
    for (i = 0 ; i < ds.length ; i++){
      var row = ds[i];
      newData.push(row);
    }


    var newStore = Ext.create('Ext.data.Store', {
      autoLoad: true,
      storeId: 'GridStore',
      fields: newFields,
      proxy: {
        type: 'memory',
        data: newData,
        reader: {
          type: 'json'
        }
      }
    });

    grid.reconfigure(newStore, newColumns);
  },

  updateTimespan: function(javastart, javaend, sasstart, sasend) {
    var me = this;

    sasAdapter.addTable([{
      javastart: javastart,
      javaend: javaend,
      sasstart: sasstart,
      sasend: sasend
    }],'timespan');


    sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/updateTimespan', function(err, res){
      if (err){
        Ext.MessageBox.alert('Warning', 'Could not call updateTimespan.');
      } else {
        if (res){
          setTimeout(function() {
            me.initPieByUser(res);
            me.updatePieBySubdirectory(res);
            me.initTopProcesses(res);
          }, 3);
        }
      }
    });
  },

  updatePieBySubdirectory: function(res) {
    var me = this;
    var data = res;
    var donutLev0 = data.donutLev0;
    var donutLev1 = data.donutLev1;
    var donutLev2 = data.donutLev2;

    if (!donutLev1 || !donutLev2){
      Ext.MessageBox.alert('No donutLev1 or donutLev2 found.');
      return;
    }

    function getParentIndex(donutLev1, parent){
      for (var i = 0 ; i < donutLev1.length ; i++){
        var rec = donutLev1[i];
        if (rec.value === parent){
          return i;
        }
      }
    }

    var lev0Data = [];
    var i, rec, point;
    for (i = 0 ; i < donutLev0.length ; i++){
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

    var chartData = [];
    for (i = 0 ; i < donutLev1.length ; i++){
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

      chartData.push(point);
    }

    var chartDataLev2 = [];
    for (i = 0 ; i < donutLev2.length ; i++){
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

      chartDataLev2.push(point);
    }


    var chart = $('#pieSubdirectory-innerCt').highcharts();
    if (chart){
      chart.series[0].setData(lev0Data, true, true);
      chart.series[1].setData(chartData, true, true);
      chart.series[2].setData(chartDataLev2, true, true);
    }
    me.updateBreadcrumb(chart.series[0].data[0].name);
  },

  onSubdirectoryClick: function(point) {
    var me = this;
    var chart = $('#highchartsContainer').highcharts();
    if (chart){
      var extremes = chart.xAxis[0].getExtremes();

      var path = '';
      var dir = 'none';

      var level = point.level || point.breadcrumbLevel;
      var pieChart = $('#pieSubdirectory-innerCt').highcharts();
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

      sasAdapter.addTable([{
        javastart: jsMin,
        javaend: jsMax,
        sasstart: new Date(jsMin),
        sasend: new Date(jsMax)
      }],'timespan');

      sasAdapter.addTable([{
        count: point.y || point.breadcrumbY,
        path: path.trim(),
        dir: dir
      }],'clicked');


      sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillPie', function(err, res){
        if (err){
          Ext.MessageBox.alert('Warning', 'Could not call drillPie.');
          return;
        }

        if (res.donutLev1.length === 0){
          return;
        }

        setTimeout(function(){
          me.initPieByUser(res);
          me.updatePieBySubdirectory(res);
          me.initTopProcesses(res);
        }, 3);
      });

    }
  },

  updateBreadcrumb: function(data) {
    var me = this;

    var view = Ext.ComponentQuery.query('viewport')[0];
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

      var handlerFn = function(e){
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
  }
});
