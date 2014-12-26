Ext.define('h54sExample.view.MyContainer2', {
  extend: 'Ext.container.Container',
  alias: 'widget.mycontainer21',

  defaultListenerScope: true,

  listeners: {
    resize: 'onContainerResize'
  },

  onContainerResize: function (component, width, height, oldWidth, oldHeight, eOpts) {
    var chart = $('#' + this.id + 'innerCt').highcharts();
    if (chart) {
      chart.setSize(width, height, false);
    }
  }

});
