Ext.define('h54sExample.view.WindowDrillUser', {
  extend: 'Ext.window.Window',
  alias: 'widget.windowdrilluser',

  requires: [
    'h54sExample.view.WindowDrillHourViewModel1',
    'h54sExample.view.MyContainer2',
    'Ext.grid.Panel',
    'Ext.grid.column.Number',
    'Ext.grid.View'
  ],

  viewModel: {
    type: 'windowdrilluser'
  },
  height: 500,
  width: 700,
  title: 'User',

  layout: {
    type: 'hbox',
    align: 'stretch'
  },
  items: [
    {
      xtype: 'gridpanel',
      flex: 1,
      columns: [
        {
          xtype: 'gridcolumn',
          dataIndex: 'string',
          text: 'String'
        }, {
          xtype: 'numbercolumn',
          dataIndex: 'number',
          text: 'Number'
        }
      ]
    }, {
      xtype: 'mycontainer21',
      id: 'userScatter',
      flex: 1
    }
  ],

  setData: function (data, sas) {
    var me = this;

    var grid = me.down('gridpanel');

    // reconfigure grid columns, store, data...

    var res = data;

    var newFields = [];
    var newColumns = [];

    var fields = [{
        xtype: 'gridcolumn',
        dataIndex: 'shortname',
        text: 'Report Name',
        flex: 1
      }, {
        xtype: 'gridcolumn',
        dataIndex: 'username',
        text: 'Username',
        flex: 0,
        width: 120
      }, {
        xtype: 'datecolumn',
        dataIndex: 'date',
        text: 'Date',
        flex: 0,
        width: 120,
        format: 'Y-m-d'
      }, {
        xtype: 'gridcolumn',
        dataIndex: 'pType',
        width: 60,
        text: '',
        flex: 0
    }];


    var renderFn = function (value, metaData, record, rowIndex, colIndex, store, view) {
      var newTooltip = record.get('programname');

      metaData.tdAttr = 'data-qtip="' + newTooltip + '"';
      return value;
    };

    for (var i = 0; i < fields.length; i++) {
      var descField = fields[i];

      var fieldType = 'string';

      newFields.push({
        name: descField.dataIndex
      });

      var column = {
        xtype: descField.xtype,
        format: descField.format || '0', // for numbercolumn , format it to whole number
        dataIndex: descField.dataIndex,
        text: descField.text,
        flex: descField.flex,
        width: descField.width,
        renderer: renderFn
      };

      newColumns.push(column);
    }

    if (!res.byProgram) {
      Ext.MessageBox.alert('Warning', 'No byProgram object found.');
      return;
    }
    var ds = sas.unescapeValues(res.byProgram);

    var newData = [];
    for (i = 0; i < ds.length; i++) {
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
  }

});
