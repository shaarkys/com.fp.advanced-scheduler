<template>
    <!-- The whole component expects a TimeInfo object in the v-model-->
    <v-form v-model="localValidInput" @input="handleFormValidity">
        <v-row>
            <v-radio-group
                v-model="value.timeType"
                @change="handleInput()"
                row
                mandatory
                hide-details="true"
                >
                <v-radio
                    :label="$t('Time')"
                    :value="1"
                ></v-radio>
                <v-radio
                    :label="$t('Solar')"
                    :value="2"
                ></v-radio>
                </v-radio-group>
        </v-row>
        
        <v-row>
            <v-select v-if="value.timeType==2"
                v-model="value.sunEvent"
                @input="handleInput()"
                :items="translateSunEvents(getSunEvents())"
                item-value="id"
                item-text="desc"
                :label="$t('Sun_event')"
                :hint="$t('Choose_sun_event')"
                persistent-hint
                :rules="rules.suneventvalid"
                ></v-select>
                <!-- :rules="rules.suneventvalid"-->
        </v-row>
        <v-row>
            <v-text-field v-if="value.timeType==1" :label="$t('Trigger_time')" :placeholder="$t('Enter_a_time')" :rules="rules.isTime"
                          v-model="value.time"
                          @input="handleInput()"
                          ></v-text-field>

            <v-text-field v-if="value.timeType==2" :label="$t('Offset_time')" :placeholder="$t('Enter_an_offset')" :rules="rules.isOffsetMaxOneDay"
                        v-model="value.solarOffset" 
                        @input="handleInput()"                         
                        ></v-text-field>
        </v-row>
    </v-form>

</template>

<script>

//The whole component expects a TimeInfo object in the v-model

import { TimeInfo } from '../../../.homeybuild/src/CommonContainerClasses';
export default {
  name: 'AsvTimeSunEvent',
  components: {
  },

  props: {
    value: {
      type: TimeInfo,
      required: true
    },
    validInput: {
      type: Boolean,
      required:false
    }

  },
  data() {
    return {
        localValidInput: Boolean(this.validInput),
        rules: {

            isOffsetMaxOneDay: [
                value => {
                    const pattern = /^(-?)([01]\d?|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
                    return pattern.test(value) || this.$t('Enter_offset_in_format')
                }
            ],
            isTime: [
                value => {
                    const pattern = /^([01]\d?|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
                    return pattern.test(value) || this.$t('Enter_time_in_format');
                }
            ],
            suneventvalid: [
                value => {
                    return !(value==='' || value === undefined || value === null) || this.$t('Select_event');
                }
            ],

            },
        };
    },
    methods : {

        handleInput : function () {
            this.updateValid();
            this.$emit('input', this.value)
        },

        handleFormValidity : function (valid) {
            this.localValidInput = Boolean(valid);
            this.$emit('update:validInput', this.localValidInput);
        },

        updateValid : function (){
            let valid = false;
            if (this.value.timeType==1) {
                valid = /^([01]\d?|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(this.value.time);
            }
            else if (this.value.timeType==2) {
                const hasSunEvent = !(this.value.sunEvent==='' || this.value.sunEvent === undefined || this.value.sunEvent === null);
                const validOffset = /^(-?)([01]\d?|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(this.value.solarOffset);
                valid = hasSunEvent && validOffset;
            }
            this.handleFormValidity(valid);
        },

        translateSunEvents: function (sunEvents) {
            sunEvents.forEach(se => {
              se.desc = this.$t(se.id) 
            })
            return sunEvents;
        },

        addTimeToSunEvents: function (sunEvents) {
            sunEvents.forEach(se => {
              se.desc = se.desc + ' (' + se.time.toTimeString().substring(0,8) + ')';
            })
            return sunEvents;
        },
        
        getSunEvents : function (){
            const app = this.$root && this.$root.$children ? this.$root.$children[0] : null;
            const sunWrapper = app ? app.sunWrapper : null;
            if (!sunWrapper || typeof sunWrapper.getTimes !== 'function') return [];
            return sunWrapper.getTimes(new Date());
        },
    },
    mounted() {
        this.updateValid();
    },

};
</script>

<style scoped>

</style>
