/* global Ext */
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
  frame: true,
  closeAction: 'destroy',

  items: [
    {
      xtype: 'gridpanel',
      store: 'DrillHourStore',
      columns: [
        {
          xtype: 'gridcolumn',
          dataIndex: 'shortname',
          text: 'Report Name',
          flex: 1,
          renderer: function (value, metaData, record) {
            var newTooltip = record.get('programname');

            metaData.tdAttr = 'data-qtip="' + newTooltip + '"';
            return value;
          }
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
  ]
});

//Grouping feature - startCollapsed override fix
Ext.override(Ext.grid.feature.GroupStore, {
  processStore: function (store) {
    var me = this,
      groups = store.getGroups(),
      groupCount = groups ? groups.length : 0,
      i,
      group,
      groupPlaceholder,
      data = me.data,
      oldGroupCache = me.groupingFeature.groupCache,
      groupCache = me.groupingFeature.clearGroupCache(),
      collapseAll = me.groupingFeature.startCollapsed,
      groupField = store.getGroupField(),
      key, modelData, Model;

    if (data) {
      data.clear();
    } else {
      data = me.data = new Ext.util.Collection({
        rootProperty: 'data',
        extraKeys: {
          byInternalId: {
            property: 'internalId',
            rootProperty: ''
          }
        }
      });
    }

    if (store.getCount()) {

      //THE FIX
      //commented out 104 line
//      me.groupingFeature.startCollapsed = false;

      if (groupCount > 0) {
        for (i = 0; i < groupCount; i++) {
          group = groups.getAt(i);


          key = group.getGroupKey();
          groupCache[key] = group;
          group.isCollapsed = collapseAll || (oldGroupCache[key] && oldGroupCache[key].isCollapsed);



          if (group.isCollapsed) {
            Model = store.getModel();
            modelData = {};
            modelData[Model.idProperty] = 'group-' + key + '-placeholder';
            modelData[groupField] = key;
            group.placeholder = groupPlaceholder = new Model(modelData);
            groupPlaceholder.isNonData = groupPlaceholder.isCollapsedPlaceholder = true;
            groupPlaceholder.group = group;
            data.add(groupPlaceholder);
          } else {
            data.insert(me.data.length, group.items);
          }
        }
      } else {
        data.add(store.getRange());
      }
    }
  }
});
