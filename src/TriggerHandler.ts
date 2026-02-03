'use strict';

import { executionAsyncResource } from "async_hooks";
import { App as HomeyApp } from "homey";
import { FlowAndTokenHandler } from "./FlowAndTokenHandler";
import { SunWrapper, SunEventInfo } from "./SunWrapper";
import { DateTime } from "luxon";

// this is copied from settings-src/src by build task. Not elegant, but...
import { ASSettings, Schedule, ScheduleItem, Token, DaysType, TimeType, TimeInfo } from "./CommonContainerClasses";

import { isMainThread } from "worker_threads";
//import { FlowCardTrigger, FlowCardAction, FlowToken } from "homey";

export class Trigger{
    constructor(triggerTime: DateTime, schedule:Schedule, scheduleItem:ScheduleItem) {
        this.triggerTime=triggerTime;
        this.schedule=schedule;
        this.scheduleItem=scheduleItem;
//        this.tokens=tokens; 
    }
    triggerTime:DateTime;
    schedule:Schedule;
    scheduleItem:ScheduleItem;
}


export class TriggerHandler {
    private selfie:TriggerHandler;
    private homeyApp:HomeyApp;
    private settings:ASSettings;
    private flowandtokenhandler:FlowAndTokenHandler;
    private sunWrapper:SunWrapper;
    private triggers:Trigger[];
    private runningtimer:NodeJS.Timeout;
    private localTimeZone:string;
    private readonly shortDayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    constructor(homeyApp:HomeyApp, settings:ASSettings, flowandtokenhandler:FlowAndTokenHandler, sunWrapper:SunWrapper) {
        this.selfie=this;
        this.homeyApp=homeyApp;
        this.settings=settings;
        this.flowandtokenhandler=flowandtokenhandler;
        this.sunWrapper=sunWrapper;
    }

    setSettings(settings:ASSettings)
    {
        this.settings = settings;
    }

    setupTriggers(mode:'startup'|'midnight'){
        this.localTimeZone = this.homeyApp.homey.clock.getTimezone();
        this.homeyApp.log("Local timezone: " + this.localTimeZone);
        this.homeyApp.log('Setting up Triggers');

        this.triggers = new Array();

        this.settings.schedules.forEach(schedule => {
            if (schedule.active){
                schedule.scheduleItems.forEach(scheduleitem => {
                    if (scheduleitem.daysType === DaysType.DaysOfWeek)
                    {
                        let now = DateTime.now();
                        let yesterday = DateTime.now().minus({day:1});
                        let tomorrow = DateTime.now().plus({day:1});
                        
                        //this.homeyApp.log('Now: ' + now.toString() + " Yesterday: " + yesterday.toString() + " Tomorrow: " + tomorrow.toString());

                        //this.homeyApp.log('before addScheduleItemToTriggers, date: ' + now);
                        //this.homeyApp.log('before addScheduleItemToTriggers, yesterday: ' + yesterday);
                        
                        this.addScheduleItemToTriggers(mode, yesterday, schedule, scheduleitem);
                        this.homeyApp.log('Testing triggers from current day.');
                        this.addScheduleItemToTriggers(mode, now, schedule, scheduleitem);
                        this.addScheduleItemToTriggers(mode, tomorrow, schedule, scheduleitem);
                    }
                })
            }
            else{
                this.homeyApp.log('Schedule ' + schedule.name + ' inactive, skipping');
            }
        })

        this.homeyApp.log('Summary all triggers');
        this.triggers.forEach(trigger => {
            this.homeyApp.log(
                'Schedule: ' + trigger.schedule.name +
                ', si: ' + trigger.scheduleItem.id +
                ', time: ' + trigger.triggerTime.toString() +
                (trigger.scheduleItem.mainTrigger.sunEvent ? '(' + trigger.scheduleItem.mainTrigger.sunEvent + ')' : '') +
                ', days: ' + trigger.scheduleItem.daysArg + '(' + this.formatDaysMask(trigger.scheduleItem.daysArg) + ')'
            );
        })

        this.homeyApp.log('Setting up Triggers done');
    }

    

    //resolve the triggering time of a ScheduleItem, taking into account randomness, sun stuff and similar. Based on the date passed in.
    private getTriggerTime(si:ScheduleItem, date:DateTime):DateTime {
        let resTime:DateTime;
        try {
            if (!si.randomTrigger.used) resTime = this.getTimeInfoTime(si.mainTrigger, date);
            else {
                let mtTime:DateTime = this.getTimeInfoTime(si.mainTrigger, date);
                let rtTime:DateTime = this.getTimeInfoTime(si.randomTrigger, date);
                if (rtTime<mtTime) rtTime = rtTime.plus({days:1});
                let msdiff = rtTime.diff(mtTime);
                let offset = Math.random() * msdiff.milliseconds;
                let resDate = mtTime.plus(offset);
    
                //this.homeyApp.log('Random Time mt: ' + mtTime.toString() + ' rt: ' + rtTime.toString() + ' diff: ' + msdiff.toString() + 
                //    ' offset: ' + offset*1000*60 + 'minutes, resdate: ' + resDate.toString());
    
                resTime = resDate;
            }
            if (si.triggerFirstOf.used) {
                let firstTime:DateTime = this.getTimeInfoTime(si.triggerFirstOf, date);
                resTime = DateTime.fromMillis(Math.min(firstTime.toMillis(), resTime.toMillis()));
            } 
            if (si.triggerLastOf.used) {
                let lastTime:DateTime = this.getTimeInfoTime(si.triggerLastOf, date);
                resTime = DateTime.fromMillis(Math.max(lastTime.toMillis(), resTime.toMillis()));
            } 
    
                
        } catch (error) {
            this.homeyApp.log('Not able to calc trigger time for schedule: ' + si.schedule.name + " si id: " + si.id + ". Config likely corrupt. Skipping.");
            return null;
        }
        return resTime;

    }

    //return local time midnight, based on date in local timezone
    private getMidnightLocalTimeForDate(date:DateTime):DateTime {
        let midnight = date.setZone(this.localTimeZone).startOf("day"); //.plus({days:1});
        //this.homeyApp.log("date: " + date.toString() + " midnight: " + midnight.toString());
        return midnight;
    }

    private getTimeInfoTime(ti:TimeInfo, date:DateTime):DateTime {
        let dateAtMidnightCallingDate = this.getMidnightLocalTimeForDate(date);
        let dateString = dateAtMidnightCallingDate.toISODate();
        let timeString:string;
        let offset=0;
        
        if (ti.timeType == TimeType.TimeOfDay) {
            timeString = ti.time;
        }
        else if (ti.timeType == TimeType.Solar) {
            let sei:SunEventInfo = this.sunWrapper.getTime(date.toJSDate(), ti.sunEvent);
            if (sei === undefined) {
                this.homeyApp.log('Undefined sunevent returned, returning null. Sunevent passed: ' + ti.sunEvent);
                return null;
            }
            timeString = DateTime.fromJSDate(sei.time).toISOTime();
            offset = this.parseOffset(ti.solarOffset);
        }
        return DateTime.fromISO(dateString+"T"+timeString, {zone:this.localTimeZone}).plus(offset);
    }

    private addScheduleItemToTriggers(mode:'startup'|'midnight', date:DateTime, s:Schedule, si:ScheduleItem){
        //this.homeyApp.log('addScheduleItemToTriggers, date: ' + date);

        let now = DateTime.now();
        let triggerTime:DateTime;
//        let dateAtMidnightToday = new Date(now.getFullYear(),now.getMonth(), now.getDate());
//        let dateAtMidnightCallingDate = new Date(date.getFullYear(),date.getMonth(), date.getDate());
        let dateAtMidnightToday = this.getMidnightLocalTimeForDate(now);
        let dateAtMidnightCallingDate = this.getMidnightLocalTimeForDate(date);

        //this.homeyApp.log('dateAtMidnightToday: ' + dateAtMidnightToday.toString() + " dateAtMidnightCallingDate: " + dateAtMidnightCallingDate.toString());
        //this.homeyApp.log('addScheduleItemToTriggers, midnight: ' + dateAtMidnightToday);

        triggerTime = this.getTriggerTime(si, dateAtMidnightCallingDate);
        if (!this.isValidDate(triggerTime)) {
            this.logSkip('invalid-trigger-time', s, si, triggerTime, dateAtMidnightCallingDate);
            return; //
        }

        let dateNextMidnight = dateAtMidnightToday.plus({days:1});
        let isSameDay = dateAtMidnightCallingDate.toMillis() === dateAtMidnightToday.toMillis();
        if (!isSameDay && triggerTime >= dateAtMidnightToday && triggerTime < dateNextMidnight) {
            this.homeyApp.log(
                'Spillover trigger candidate from ' +
                dateAtMidnightCallingDate.toISODate() +
                ' into today: schedule=' + s.name +
                ', si=' + si.id +
                ', time=' + triggerTime.toString()
            );
        }


        if (si.onlyTriggerIfBefore.used){
            let onlyTriggerIfBeforeTime = this.getTimeInfoTime(si.onlyTriggerIfBefore, dateAtMidnightCallingDate)
            if (this.isValidDate(onlyTriggerIfBeforeTime)) {
                if (triggerTime >= onlyTriggerIfBeforeTime) {
                    this.logSkip(
                        'after-before-condition',
                        s,
                        si,
                        triggerTime,
                        dateAtMidnightCallingDate,
                        'trigger=' + triggerTime.toString() + ' >= before=' + onlyTriggerIfBeforeTime.toString()
                    );
                    return; //
                }
            }
            else {
                this.homeyApp.log('Only trigger if before is not a valid date. Not evaluated. schedule: ' + s.name + ', si: ' + si.id);
            }
        }

        if (si.onlyTriggerIfAfter.used){
            let onlyTriggerIfAfterTime = this.getTimeInfoTime(si.onlyTriggerIfAfter, dateAtMidnightCallingDate)
            if (this.isValidDate(onlyTriggerIfAfterTime)) {
                if (triggerTime <= onlyTriggerIfAfterTime) {
                    this.logSkip(
                        'before-after-condition',
                        s,
                        si,
                        triggerTime,
                        dateAtMidnightCallingDate,
                        'trigger=' + triggerTime.toString() + ' <= after=' + onlyTriggerIfAfterTime.toString()
                    );
                    return; //
                }
            }
            else {
                this.homeyApp.log('Only trigger if after is not a valid date. Not evaluated. schedule: ' + s.name + ', si: ' + si.id);
            }
        }

        if (!this.dayHitTest(si.daysType, si.daysArg, date)){
            let dayofweek = date.setZone(this.localTimeZone).weekday;
            let dayName = this.shortDayNames[dayofweek - 1] || String(dayofweek);
            this.logSkip(
                'dayhit-failed',
                s,
                si,
                triggerTime,
                dateAtMidnightCallingDate,
                'weekday=' + dayofweek + '(' + dayName + '), daysArg=' + si.daysArg + '(' + this.formatDaysMask(si.daysArg) + ')'
            );
            return;
        }

        //this.homeyApp.log('Trigger compare: ' + triggerTime.toString() + ' : ' + dateAtMidnightToday.toString() + ' : ' + dateNextMidnight.toString()) ;

        if (triggerTime<dateAtMidnightToday) {
            this.logSkip('before-midnight', s, si, triggerTime, dateAtMidnightCallingDate);
            return; //time has already passed, a little crude but it will likely work :-)
        }
        else if (triggerTime>=dateNextMidnight) {
            this.logSkip('next-day', s, si, triggerTime, dateAtMidnightCallingDate);
            return; //time will be added next round, a little crude but it will likely work :-)

        } else if (mode == 'startup' && triggerTime < now) {
            this.logSkip('before-now', s, si, triggerTime, dateAtMidnightCallingDate, 'now=' + now.toString());
            return; //time has already passed, a little crude but it will likely work :-)
        }
        
        let trigger = new Trigger(triggerTime,s,si);

        this.triggers.push(trigger);
        if (trigger.scheduleItem.mainTrigger.timeType == TimeType.TimeOfDay)
            this.homeyApp.log('Trigger added, schedule: ' + trigger.schedule.name + ', si: ' + trigger.scheduleItem.id + ', Time: ' + trigger.triggerTime.toString());
        else if (trigger.scheduleItem.mainTrigger.timeType == TimeType.Solar)
            this.homeyApp.log('Trigger added, schedule: ' + trigger.schedule.name + ', si: ' + trigger.scheduleItem.id + ', Solar: ' + trigger.scheduleItem.mainTrigger.sunEvent + '(' + trigger.triggerTime.toString() + ')');
        //this.homeyApp.log(trigger);        
    }

    private isValidDate(d:DateTime) {
        try {
            return d instanceof DateTime && !isNaN(d.hour);
        }
        catch (error) {
            return false;  
        }
    }

    //return milliseconds offset
    private parseOffset(offsetString:string):number {
        if (offsetString == '') return null;
        
        let negative = 1;
        if (offsetString.trim()[0] == '-') {
            negative = -1;
            offsetString = offsetString.replace('-','');
        }

        return this.parseTime(offsetString)*negative;
    } 
    
    //return milliseconds since midnight
    private parseTime(timeString:string):number {
        let res:number = 0;
        if (timeString == '') return null;
        let parts = timeString.trim().split(':');
        if (parts.length==2){
            res = (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60) * 1000;
        }
        else if (parts.length==3){
            res = (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000;
        }
        else
            this.homeyApp.log('Incorrect time format: ' + timeString);

        return res;
    } 

    private dayHitTest(daystype:DaysType, days:number, date:DateTime){
        let dayofweek = date.setZone(this.localTimeZone).weekday;
        //if (dayofweek===0) dayofweek=7; //sunday returns 0 we want it to be 7

        let dayofweekbit = 1 << (dayofweek - 1);

        let hit = (dayofweekbit & days) > 0;

        //this.homeyApp.log('Current day: ' + dayofweek + ', days: ' + this.dec2bin(days) + ', daybit: ' + this.dec2bin(dayofweekbit) + ', hit: ' + hit);
        return hit;
    }

    private dec2bin(dec){
        return (dec >>> 0).toString(2);
    }

    private formatDaysMask(days:number):string {
        let names:string[] = [];
        for (let i = 1; i <= 7; i++) {
            if ((days & (1 << (i - 1))) !== 0) {
                names.push(this.shortDayNames[i - 1] || String(i));
            }
        }
        return names.length ? names.join(',') : 'none';
    }

    private logSkip(reason:string, s:Schedule, si:ScheduleItem, triggerTime:DateTime, date:DateTime, extra?:string) {
        let dateStr = date ? date.toISODate() : 'unknown';
        let timeStr = triggerTime ? triggerTime.toString() : 'null';
        let msg =
            'Skip trigger: reason=' + reason +
            ', schedule=' + s.name +
            ', si=' + si.id +
            ', date=' + dateStr +
            ', time=' + timeStr +
            ', daysType=' + DaysType[si.daysType] +
            ', daysArg=' + si.daysArg + '(' + this.formatDaysMask(si.daysArg) + ')';
        if (extra) msg += ', ' + extra;
        this.homeyApp.log(msg);
    }
    
    private timerCallback(arg: 'execute'|'next'|'idle'|'midnight') {

        let earliesttrigger:Trigger;
        if (this.triggers.length>0) earliesttrigger = this.triggers.sort((a, b) => (a.triggerTime > b.triggerTime) ? 1 : -1)[0];

        if (arg === 'execute') {
            //this.homeyApp.log('Execute!');
            if (earliesttrigger != null) {
                // Set tokens and then trigger flow.
                let tokenSetPromises = earliesttrigger.scheduleItem.tokenSetters.map(ts => {
                    return this.flowandtokenhandler.setTokenValue(ts.token, ts.value);
                });

                Promise.all(tokenSetPromises).then(() => {
                    this.flowandtokenhandler.triggerFlow(earliesttrigger.scheduleItem.tokenSetters.map(ts=>ts.token), earliesttrigger);

                    this.removeTrigger(earliesttrigger);
                    //this.homeyApp.log('Removed trigger from list: ' + earliesttrigger);
                    
                    this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), 100);
                    
                    //this.homeyApp.log('Execution done');
                }).catch(error => {
                    this.homeyApp.log('Error while setting token values before trigger: ' + error);
                    this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), 100);
                });
                
            }     
        } 
        else if (arg === 'next') {
            //this.homeyApp.log('Next');

            if (earliesttrigger != null) {
                //let now = new Date();
                
                //let delta = earliesttrigger.triggerTime.diffNow('milliseconds', { conversionAccuracy: 'longterm' }).toMillis();
                let delta = earliesttrigger.triggerTime.diffNow().toMillis();
                if (delta < 100) delta = 100;
                if (delta > 60000) {
                    delta = 60000;
                    this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), delta);
                }
                else {
                    this.runningtimer = setTimeout(function() { this.timerCallback('execute'); }.bind(this), delta);                  
                }
            }
            else
            {
                this.runningtimer = setTimeout(function() { this.timerCallback('idle'); }.bind(this), 100);               
            }

        }
        else if (arg === 'idle') {
            //this.homeyApp.log('Idle');

            //No more timers this day, lets wait for a new day. :-)
            let now = DateTime.now();
            let midnight = this.getMidnightLocalTimeForDate(now).plus({days:1});

            let delta = midnight.diffNow().toMillis();
            //let delta = midnight.diffNow('milliseconds', { conversionAccuracy: 'longterm' }).toMillis();
            if (delta > 60000) {
                delta = 60000;
                this.runningtimer = setTimeout(function() { this.timerCallback('idle'); }.bind(this), delta);
            }
            else{
                
                this.runningtimer = setTimeout(function() { this.timerCallback('midnight'); }.bind(this), delta);
            }
        }
        else if (arg === 'midnight') {
            this.homeyApp.log('Midnight, getting new triggers for today!');
            this.homeyApp.log('Time is: ' + DateTime.now().toISOTime());
            this.setupTriggers('midnight');
            this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), 100);
            
        }
        else {
            //unexpected!
            this.homeyApp.log('Somehow we ended up with a timer callback that has unknown arg: ' + arg);
            this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), 60000);     
            }
        }

        private removeTrigger(trigger) {
        for( var i = 0; i < this.triggers.length; i++){ 
        
            if ( this.triggers[i] === trigger) { 
        
            this.triggers.splice(i, 1); 
            }
        }
    }

    startTimer() {
        this.runningtimer = setTimeout(function() { this.timerCallback('next'); }.bind(this), 5000);
    }

    stopTimer() {
        if (this.runningtimer!=null)
            clearTimeout(this.runningtimer);
    }    
}
    


    


