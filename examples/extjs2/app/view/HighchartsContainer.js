/* global Ext, setInterval, clearInterval, Highcharts */
Ext.define('h54sExample.view.HighchartsContainer', {
  extend: 'Ext.container.Container',
  alias: 'widget.highcharts',

  layout: 'fit',
  flex: 1,

  defaultListenerScope: true,

  waitForData: true,

  initComponent : function() {
    if(this.store && typeof this.store === 'string') {
      this.store = Ext.getStore(this.store);
    }

    this.store.on('load', this.onLoad, this);
    this.callParent(arguments);

    if(!this.chartConfig) {
      this.chartConfig = {
        chart: {}
      };
    } else if(!this.chartConfig.chart) {
      this.chartConfig.chart = {};
    }
  },


  onContainerResize: function (component, width, height) {
    if (this.chart) {
      this.chart.setSize(width, height, false);
    }
  },

  listeners: {
    resize: 'onContainerResize',
    afterrender: function() {
      this.chartConfig.chart.renderTo = this.getEl().dom;
      var me = this;
      var interval = setInterval(function() {
        if(me.loadedData) {
          clearInterval(interval);

          if(me.stockChart) {
            me.chart = new Highcharts.StockChart(me.chartConfig);
          } else {
            me.chart = new Highcharts.Chart(me.chartConfig);
          }
        }
      }, 10);
    },
  },

  onLoad: function() {
    var data = this.store.getProxy().getData();

    this.chartConfig.series = [];
    for(var i = 0; i < this.series.length; i++) {
      var key = this.series[i].dataKey;
      this.series[i].data = data[key];
      var sClone = Ext.clone(this.series[i]);
      delete sClone.dataKey;
      this.chartConfig.series.push(sClone);
    }

    if(this.xAxisField) {
      if(!this.chartConfig.xAxis) {
        this.chartConfig.xAxis = {};
      }
      this.chartConfig.xAxis.categories = data[this.xAxisField];
    }

    if(this.yAxisField) {
      if(!this.chartConfig.yAxis) {
        this.chartConfig.yAxis = {};
      }
      this.chartConfig.yAxis.categories = data[this.yAxisField];
    }

    if(this.chart) {
      this.chart.destroy();
      if(this.stockChart) {
        this.chart = new Highcharts.StockChart(this.chartConfig);
      } else {
        this.chart = new Highcharts.Chart(this.chartConfig);
      }
    }

    this.loadedData = true;
  }
});
