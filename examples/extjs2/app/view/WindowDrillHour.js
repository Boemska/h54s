Ext.define('h54sExample.view.WindowDrillHour', {
  extend: 'Ext.window.Window',
  alias: 'widget.windowdrillhour',

  requires: [
    'Ext.grid.Panel',
    'Ext.grid.column.Number',
    'Ext.grid.View',
    'Ext.grid.feature.Grouping',
    'Ext.XTemplate'
  ],

  height: 500,
  width: 700,
  layout: 'fit',
  title: '',

  items: [
    {
      xtype: 'gridpanel',
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
      ],
      features: [
        {
          ftype: 'grouping',
          groupHeaderTpl: [
            'User: {name} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
          ],
          startCollapsed: true
        }
      ]
    }
  ],

  setData: function (data) {
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
        xtype: 'gridcolumn',
        dataIndex: 'datetime',
        text: 'Date',
        flex: 0,
        width: 150,
        format: 'Y-m-d H:i:s'
      }, {
        xtype: 'gridcolumn',
        dataIndex: 'pType',
        width: 60,
        text: 'Type',
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
    var ds = res.byProgram;

    var newData = [];
    for (i = 0; i < ds.length; i++) {
      var row = ds[i];

      if (row.pType === 'STP' && row.datetime) {
        row.datetime = Ext.util.Format.date(sasAdapter.fromSasDateTime(row.datetime), 'Y-m-d H:i:s');
      } else {
        row.datetime = Ext.util.Format.date(new Date(row.datetime), 'Y-m-d H:i:s');
      }

      newData.push(row);
    }


    var newStore = Ext.create('Ext.data.Store', {
      autoLoad: true,
      storeId: 'GridStore',
      fields: newFields,
      groupField: 'username',
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
