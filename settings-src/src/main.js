//import 'module-alias/register';
import Vue from 'vue';
import App from '@/App.vue';
import vuetify from '@/plugins/vuetify';
import i18n from '@/plugins/i18n';

import VCurrencyField from 'v-currency-field'
import { VTextField } from 'vuetify/lib'  //Globally import VTextField for Treeshaking to work



Vue.config.productionTip = false;

Vue.component('v-text-field', VTextField); // Needed for treeshaking to work with VCurrencyField
Vue.use(VCurrencyField, {
  locale: 'en-GB',
  decimalLength: {min:0, max:4},
  autoDecimalMode: false,
  min: null,
  max: null,
  defaultValue: 0,
  valueAsInteger: false,
  allowNegative: true
});

let mounted = false;

function mountSettings(Homey) {
  if (mounted || !Homey) return;
  mounted = true;

  Vue.mixin({
    data() {
      return {
        get Homey() {
          return Homey;
        }
      };
    }
  });

  try {
    new Vue({
      i18n,
      render: h => h(App),
      vuetify,
    }).$mount('#app');
  } finally {
    Homey.ready();
  }
}

window.addEventListener('homey-settings-ready', function (event) {
  mountSettings(event.detail);
}, false);

if (window.homeySettings && window.homeySettings.Homey) {
  mountSettings(window.homeySettings.Homey);
}
