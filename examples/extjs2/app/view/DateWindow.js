/* global Ext */
Ext.define('h54sExample.view.DateWindow', {
  extend: 'Ext.window.Window',
  alias: 'widget.comboprompt',

  requires: [
    'Ext.form.field.ComboBox',
    'Ext.form.field.Date',
    'Ext.container.Container',
    'Ext.button.Button',
    'Ext.toolbar.Spacer'
  ],

  statics: {
    show: function (minDate, maxDate, fn) {
      var win = Ext.create('h54sExample.view.DateWindow', {
        title: 'Select Date Range',
        promptCallback: fn
      });

      win.down('datefield[fieldLabel="From"]').setValue(minDate);
      win.down('datefield[fieldLabel="To"]').setValue(maxDate);

      win.show();
    }
  },

  width: 328,
  bodyPadding: 10,
  title: 'Choose',
  modal: true,
  defaultListenerScope: true,

  layout: {
    type: 'vbox',
    align: 'stretch'
  },
  items: [
    {
      xtype: 'combobox',
      hidden: true,
      margin: '10 0 15 0',
      fieldLabel: 'Select',
      store: []
    }, {
      xtype: 'datefield',
      flex: 1,
      fieldLabel: 'From'
    }, {
      xtype: 'datefield',
      flex: 1,
      fieldLabel: 'To'
    }, {
      xtype: 'container',
      height: 28,
      margin: '10 0 0 0',
      layout: {
        type: 'hbox',
        align: 'stretch'
      },
      items: [
        {
          xtype: 'button',
          margin: '0 10 0 0',
          width: 120,
          text: 'CANCEL',
          listeners: {
            click: 'onCancelClick'
          }
        }, {
          xtype: 'tbspacer',
          flex: 1
        }, {
          xtype: 'button',
          width: 120,
          text: 'OK',
          listeners: {
            click: 'onOkClick'
          }
        }
      ]
    }
  ],

  onCancelClick: function (button) {
    button.up('window').close();
  },

  onOkClick: function (button) {
    var me = this;
    if (this.promptCallback) {
      var fromDate = me.down('datefield[fieldLabel="From"]').getValue();
      var toDate = me.down('datefield[fieldLabel="To"]').getValue();
      this.promptCallback(fromDate, toDate);
    } else {
      Ext.Msg.alert('Info', 'No callback function provided.');
    }

    button.up('window').close();
  }

});
