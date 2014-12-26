Ext.define('h54sExample.view.HighchartsContainer', {
  extend: 'Ext.container.Container',
  alias: 'widget.highchartscontainer',

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
