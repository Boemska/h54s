/* global Ext, setTimeout */
Ext.define('h54sExample.view.MessageWindow', {
  extend: 'Ext.window.Toast',

  align: 'tr',
  paddingX: 10,
  autoShow: false,
  shadow: true,
  header: false,
  slideInDuration: 100,
  hideDuration: 100,
  autoCloseDelay: 3000,
  closeAction: 'hide',
  layout: 'vbox',
  style: {
    'border-radius': 0
  },
  autoClose: false,

  addLoadingMessage: function(msg) {
    var me = this;
    var program = msg.substring(msg.lastIndexOf('/') + 1);
    var label = this.superclass.add.call(this, {
      xtype: 'label',
      text: 'Loading ' + program + '... ',
      style: {
        color: 'blue'
      }
    });
    this.show();
    //don't resize to smaller
    me.setMinWidth(me.getWidth());

    return {
      setLoaded: function() {
        label.setText(label.text + 'loaded');
        me._animateLabel(label);
      },
      setError: function() {
        label.setText(label.text + 'error');
        me._animateLabel(label);
        label.setStyle('color', 'red');
      },
      remove: function() {
        label.animate({
          duration: 100,
          to: {
            opacity: 0
          },
          listeners: {
            afteranimate: function() {
              setTimeout(function() {
                me.remove(label);
              }, 101);
              if(me.items.items.length <= 1) {
                me.close();
                //reset min width
                me.setMinWidth('initial');
              }
            }
          }
        });
      }
    };
  },

  _animateLabel: function(label) {
    var me = this;
    setTimeout(function() {
      label.animate({
        duration: 100,
        to: {
          opacity: 0
        },
        listeners: {
          afteranimate: function() {
            setTimeout(function() {
              me.remove(label);
            }, 101);
            if(me.items.items.length <= 1) {
              me.close();
              //reset min width
              me.setMinWidth('initial');
            }
          }
        }
      });
    }, 3000);
  },

  addUserMessage: function(msg) {
    var me = this;
    if(msg !== 'blank') {
      var label = this.superclass.add.call(this, {
        xtype: 'label',
        text: msg,
        style: {
          marginLeft: '12px'
        }
      });

      this.show();

      setTimeout(function() {
        me.remove(label);
      }, 2999);
    }
  },

  listeners: {
    afterlayout: function() {
      this.alignTo(Ext.getBody(), 'tr-tr', [-10, 10]);
    }
  }

});
