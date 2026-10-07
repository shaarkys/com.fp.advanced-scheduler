<template>
  <v-app>
    <v-main class="ma-1">
      <v-tabs
        v-model="tab"
        background-color="primary"
        dark
        next-icon="mdi-arrow-right-bold-box-outline"
        prev-icon="mdi-arrow-left-bold-box-outline"
        show-arrows
      >
        <v-tabs-slider color="yellow"></v-tabs-slider>
        <v-tab key="schedules">{{ $t('Schedules') }}</v-tab>
        <v-tab key="suneventtimes">{{ $t('Sun_event_times') }}</v-tab>
        <v-tab key="help">{{ $t('Help') }}</v-tab>
        <v-tab key="rawsettings">{{ $t('Raw_settings') }}</v-tab>
      </v-tabs>
      <v-tabs-items v-model="tab">
        <v-tab-item key="schedules">
          <v-expansion-panels>
            <!--h1 style="text-align:left;">{{ $t('Schedules') }}</h1-->
            <asv-schedule v-for="(schedule) in assettings.schedules" :key="schedule.id" :schedule="schedule" :settings="assettings" />
          </v-expansion-panels>
          <v-btn class="mt-2" color="green darken-1" text @click="addSchedule()"><v-icon dark>mdi-plus-circle-outline</v-icon> {{ $t('Add_new_schedule') }}</v-btn>
          <v-btn class="mt-2" color="green darken-1" text :disabled="!settingsLoaded" @click="saveSettings()"><v-icon dark>mdi-content-save</v-icon> {{ $t('Save_settings') }}</v-btn>
          <v-btn class="mt-2" color="green darken-1" text @click="getSettings()"><v-icon dark>mdi-download-circle-outline</v-icon> {{ $t('Reload_last_saved_settings') }}</v-btn>
        </v-tab-item>
        <v-tab-item key="suneventimes">
          <asv-sun-event-times></asv-sun-event-times>
        </v-tab-item>

        <v-tab-item key="help">
          <v-container>
            <v-row>
                  <v-btn class="mt-2" color="green darken-1" text @click="openURL('Help')"> {{ $t('Help_page') }}</v-btn>            
              </v-row>
              <v-row>
                  <v-btn class="mt-2" color="green darken-1" text @click="openURL('Community')"> {{ $t('Community_page') }}</v-btn>            
              </v-row>
          </v-container>
        </v-tab-item>
        <v-tab-item key="rawsettings">
          <v-textarea
            solo
            :label="$t('Raw_settings')"
            v-model="rawSettings"
          ></v-textarea>
          <div v-html="$t('Raw_settings_long_description')"></div>

          <v-btn class="mt-2" color="green darken-1" text @click="getRawSettings()"><v-icon dark>mdi-download-circle-outline</v-icon> {{ $t('Get_current_raw_settings') }}</v-btn>
          <v-btn class="mt-2" color="green darken-1" text @click="saveRawSettings()"><v-icon dark>mdi-content-save</v-icon> {{ $t('Save_raw_settings') }}</v-btn>
        </v-tab-item>
      </v-tabs-items>
    </v-main>
  </v-app>
</template>

<script>
import { ASSettings } from '../../.homeybuild/src/CommonContainerClasses';
import { SettingsPersistance } from '../../.homeybuild/src/SettingsPersistance';
import { SunWrapper } from '../../.homeybuild/src/SunWrapper';

import AsvSchedule from '@/components/Schedule';
import AsvSunEventTimes from '@/components/SunEventTimes';
export default {
  name: 'App',
  components: {
    AsvSchedule,
    AsvSunEventTimes
  },
  data() {
    return {
      assettings: new ASSettings(),
      tab: null,
      rawSettings:'',
      settingsLoaded: false,
      sunWrapper: null,
      sunTimezone: null,
    };
  },
  mounted() {
    this.getSettings();
    this.getLanguage();
    this.getSunWrapper();
  },
  methods: {
        homeyGet : function(key) {
            return new Promise((resolve, reject) => {
                this.Homey.get(key, (err, value) => {
                    if (err) reject(err);
                    else resolve(value);
                });
            });
        },

        homeySet : function(key, value) {
            return new Promise((resolve, reject) => {
                this.Homey.set(key, value, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },

        alertError : function(error) {
            const message = error && error.message ? error.message : String(error);
            return this.Homey.alert(message);
        },

        parseSettings : function(settingstext) {
            const sp = new SettingsPersistance();
            sp.readSettings(settingstext);
            return sp.getSettings() || new ASSettings();
        },

        getSettings : async function() {
            this.settingsLoaded = false;
            try {
                const settingstext = await this.homeyGet('settings');
                this.assettings = this.parseSettings(settingstext);
                this.settingsLoaded = true;
            } catch (err) {
                await this.alertError(err);
            }
        },

        getLanguage : function() {
            try {
                const language = this.Homey.__({ en: 'en', sv: 'sv', de: 'de', nl: 'nl' });
                this.$i18n.locale = ['sv', 'de', 'nl'].includes(language) ? language : 'en';
            } catch (err) {
                this.$i18n.locale = 'en';
            }
        },

        getSunWrapper : async function () {
            try {
                const geoinfo = await this.homeyGet('geolocation');
                const geo = typeof geoinfo === 'string' ? JSON.parse(geoinfo) : geoinfo;
                if (!geo || geo.latitude === null || geo.longitude === null ||
                    !Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) {
                    throw new Error('Invalid geolocation settings');
                }

                this.sunTimezone = typeof geo.timezone === 'string' && geo.timezone ? geo.timezone : null;
                const sunWrapper = new SunWrapper();
                sunWrapper.webInit(Number(geo.latitude), Number(geo.longitude), this.sunTimezone || undefined);
                this.sunWrapper = sunWrapper;
            } catch (err) {
                await this.alertError(err);
            }
        },

        setupWebApi : function () {
            /*
            this.Homey.api(('GET', '/getScheduleState/',
            {
                notify: true
            }, function(err, result)
            {
                if (err)
                {
                    return Homey.alert(err);
                }
                else
                {
                    diagLogElement.value = result;
                }
            });
            
            */
        },

        addSchedule : function () {
            this.assettings.addNewSchedule(this.$t('New_schedule'),true);
            
        },

        saveSettings : async function () {
            try {
                if (!this.settingsLoaded) {
                    throw new Error('Settings have not loaded successfully');
                }

                const sp = new SettingsPersistance();
                const settingstxt = sp.buildSettings(this.assettings);
                this.parseSettings(settingstxt);
                await this.homeySet('settings', settingstxt);
            } catch (err) {
                await this.alertError(err);
            }
        },

        saveRawSettings : async function () {
            try {
                if (typeof this.rawSettings !== 'string' || this.rawSettings.trim() === '') {
                    throw new Error('Raw settings cannot be empty');
                }
                if (JSON.parse(this.rawSettings) === null) {
                    throw new Error('Raw settings cannot be null');
                }

                const parsedSettings = this.parseSettings(this.rawSettings);
                await this.homeySet('settings', this.rawSettings);
                this.assettings = parsedSettings;
                this.settingsLoaded = true;
            } catch (err) {
                await this.alertError(err);
            }
        },

        getRawSettings : function () {
            const sp = new SettingsPersistance();
            this.rawSettings = sp.buildSettings(this.assettings);
        },

        openURL : async function(urlType) {
            try {
                let url = "";
                if (urlType=='Help') {
                    url = this.$t('Help_page_url');
                }
                if (urlType=='Community') {
                    url = this.$t('Community_page_url');
                }
                
                await this.Homey.openURL(url);
            } catch (error) {
                await this.Homey.alert(this.$t("Couldn't_open_page"));
            }
         
        }
   }
};
</script>
