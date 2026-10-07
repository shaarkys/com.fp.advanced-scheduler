<template>
    <v-container>
        <div>
            {{ longStringWithDate }}
        </div>
        <v-slider
            class="mb-6"
            v-model="slider"
            max="365"
            min="0"
            :hint="$t('Slide_to_select_a_date')"
            persistent-hint
            >
        </v-slider>
        <v-simple-table>
            <thead>
                
                <tr>
                    <th> <b><p style="font-size:16px"> {{ $t('Event') }} </p> </b></th>
                    <th> <b><p style="font-size:16px"> {{ $t('Time') }} </p> </b></th>
               </tr>
            </thead>
            <tbody>
                <tr v-for="se in sunEvents" :key="se.id">
                    <td>
                         {{ $t(se.id) }}
                    </td>
                    <td v-if="isValidDate(se.time)">
                        {{ formatSunTime(se.time) }}
                    </td>
                    <td v-if="!isValidDate(se.time)">
                        {{ $t('Will_not_occur') }}
                    </td>
                </tr>
            </tbody>

        </v-simple-table>


    </v-container>

</template>

<script>

import { DateTime } from 'luxon';
 

export default {
  name: 'AsvSunEventTimes',
  components: {
  },

  props: {

  },
  data() {
    return {
        slider : 0,
        };
    },
    methods : {
        getSettingsApp() {
            return this.$root && this.$root.$children ? this.$root.$children[0] : null;
        },
        getSunWrapper() {
            const app = this.getSettingsApp();
            return app ? app.sunWrapper : null;
        },
        getSunTimezone() {
            const app = this.getSettingsApp();
            return app ? app.sunTimezone : null;
        },
        getSunEvents() {
            const sunWrapper = this.getSunWrapper();
            if (!sunWrapper || typeof sunWrapper.getTimes !== 'function') return [];
            return sunWrapper.getTimes(this.sliderDate);
        },
        isValidDate(d) {
            return d instanceof Date && !isNaN(d.getTime());
        },
        formatSunTime(d) {
            const options = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hourCycle: 'h23',
            };
            const timezone = this.getSunTimezone();
            if (timezone) options.timeZone = timezone;
            return d.toLocaleTimeString(this.$t('extended-locale'), options);
        },
        

    },
    computed: {
        longStringWithDate : function () {
            let res = this.$t('List_of_solar_events_long');
            let d = this.sliderDate;
            return res.replace('%date%', this.sliderDateText);
        },
        sliderDate : function() {
            const timezone = this.getSunTimezone();
            let date = DateTime.now();
            if (timezone) {
                const zonedDate = date.setZone(timezone);
                if (zonedDate.isValid) date = zonedDate;
            }
            return date.startOf('day').plus({ days: Number(this.slider), hours: 12 }).toJSDate();
        },
        sliderDateText : function() {
            const options = {};
            const timezone = this.getSunTimezone();
            if (timezone) options.timeZone = timezone;
            return this.sliderDate.toLocaleDateString(this.$t('extended-locale'), options);
        },
        
        sunEvents : function() {
            return this.getSunEvents();
        } 
    },
    
  

};
</script>

<style scoped>

</style>
