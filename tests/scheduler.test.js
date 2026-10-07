const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const compiledRequire = createRequire(require.resolve('../.homeybuild/app.js'));
const { DateTime, Settings } = compiledRequire('luxon');
const { ASSettings, TimeInfo, TimeType, DaysType } = require('../.homeybuild/src/CommonContainerClasses');
const { SettingsPersistance } = require('../.homeybuild/src/SettingsPersistance');
const { SunWrapper } = require('../.homeybuild/src/SunWrapper');
const { TriggerHandler, Trigger } = require('../.homeybuild/src/TriggerHandler');
const { FlowAndTokenHandler } = require('../.homeybuild/src/FlowAndTokenHandler');
const { MainApp } = require('../.homeybuild/src/MainApp');

function fixture(zone = 'Europe/Prague') {
    const timers = new Map();
    const errors = [];
    let timerId = 0;
    const values = new Map();
    const settings = new EventEmitter();
    settings.get = key => values.get(key);
    settings.set = (key, value) => { values.set(key, value); settings.emit('set', key); };
    const app = {
        log() {}, error(...args) { errors.push(args); },
        homey: {
            settings,
            clock: { getTimezone: () => zone },
            geolocation: { getLatitude: () => 50.08, getLongitude: () => 14.42 },
            setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
            clearTimeout(id) { timers.delete(id); },
            flow: {
                getTriggerCard: () => ({
                    getArgument: () => ({ registerAutocompleteListener() {} }),
                    registerRunListener() {}, async trigger() {}
                }),
                async createToken(id) { return { id, async setValue() {}, async unregister() {} }; }
            }
        }
    };
    return { app, timers, errors, values };
}

function schedules() {
    const settings = new ASSettings();
    const schedule = settings.addNewSchedule('Test', true);
    const token = schedule.addNewToken('Tag', 'number');
    const item = schedule.addNewScheduleItem(DaysType.DaysOfWeek, 127, TimeType.TimeOfDay, '', '12:00');
    return { settings, schedule, token, item };
}

test('new time and solar items preserve the constructor contract', () => {
    const { schedule, item } = schedules();
    assert.equal(item.mainTrigger.time, '12:00');
    assert.equal(item.mainTrigger.sunEvent, '');
    const solar = schedule.addNewScheduleItem(DaysType.DaysOfWeek, 127, TimeType.Solar, 'sunrise', '-00:30');
    assert.equal(solar.mainTrigger.sunEvent, 'sunrise');
    assert.equal(solar.mainTrigger.solarOffset, '-00:30');
});

test('legacy and current settings roundtrip, including monthly day 31', () => {
    const { settings, item } = schedules();
    item.daysType = DaysType.DaysOfMonth;
    item.daysArg = 2 ** 30;
    const persistence = new SettingsPersistance();
    for (const [version, text] of [[1, persistence.buildSettingsVersion1(settings)], [2, persistence.buildSettings(settings)]]) {
        assert.equal(persistence.readSettings(text), version);
        const restored = persistence.getSettings().schedules[0].scheduleItems[0];
        assert.deepEqual(restored.selectedDays, [31]);
        assert.equal(restored.mainTrigger.time, '12:00');
        assert.equal(restored.tokenSetters.length, 1);
    }
});

test('invalid persisted settings are rejected without replacing a valid model', () => {
    const { settings } = schedules();
    const persistence = new SettingsPersistance();
    const valid = persistence.buildSettings(settings);
    persistence.readSettings(valid);
    const previous = persistence.getSettings();
    for (const input of ['{', '{}', 'null', '{"settingsVersion":3,"settings":{"schedules":[]}}']) {
        assert.throws(() => persistence.readSettings(input));
        assert.equal(persistence.getSettings(), previous);
    }
    const invalid = JSON.parse(valid);
    invalid.settings.schedules[0].scheduleItems[0].mainTrigger.time = '25:61';
    assert.throws(() => persistence.readSettings(JSON.stringify(invalid)), /Invalid time/);
    assert.equal(persistence.getSettings(), previous);
});

test('solar dates and offsets use Homey timezone and absent polar events stay invalid', () => {
    const { app } = fixture('Asia/Tokyo');
    const sw = new SunWrapper();
    sw.webInit(35.68, 139.69, 'Asia/Tokyo');
    const handler = new TriggerHandler(app, new ASSettings(), {}, sw);
    handler.setupTriggers('startup');
    const date = DateTime.fromISO('2026-10-07T00:00', { zone: 'Asia/Tokyo' });
    const info = new TimeInfo(TimeType.Solar, '', 'sunrise', '00:30');
    const result = handler.getTimeInfoTime(info, date);
    const expected = DateTime.fromJSDate(sw.getTime(date.toJSDate(), 'sunrise').time, { zone: 'Asia/Tokyo' }).plus({ minutes: 30 });
    assert.equal(result.toMillis(), expected.toMillis());
    assert.equal(result.toISODate(), '2026-10-07');
    sw.webInit(89, 0, 'UTC');
    assert.ok(Number.isNaN(sw.getTime(new Date('2026-06-21T12:00:00Z'), 'sunset').time.getTime()));
    const count = compiledRequire('suncalc').times.length;
    sw.webInit(89, 0, 'UTC');
    assert.equal(compiledRequire('suncalc').times.length, count);
});

test('Homey civil dates determine adjacent-day triggers near UTC midnight', () => {
    const { app } = fixture('Asia/Tokyo');
    const { settings, item } = schedules();
    item.mainTrigger.time = '12:00';
    const previousNow = Settings.now;
    Settings.now = () => Date.parse('2026-10-06T23:30:00Z');
    try {
        const handler = new TriggerHandler(app, settings, {}, new SunWrapper());
        handler.setupTriggers('startup');
        assert.equal(handler.triggers.length, 1);
        assert.equal(handler.triggers[0].triggerTime.toISODate(), '2026-10-07');
        assert.ok(handler.dayHitTest(DaysType.DaysOfMonth, 2 ** 30, DateTime.fromISO('2026-10-31')));
    } finally { Settings.now = previousNow; }
});

test('stopping during a token write prevents Flow dispatch and timer resurrection', async () => {
    const { app, timers } = fixture();
    const { settings, schedule, item } = schedules();
    let completeWrite;
    const pending = new Promise(resolve => { completeWrite = resolve; });
    let fired = 0;
    const flow = { setTokenValue: () => pending, async triggerFlow() { fired++; } };
    const handler = new TriggerHandler(app, settings, flow, new SunWrapper());
    handler.setupTriggers('startup');
    handler.triggers = [new Trigger(DateTime.now(), schedule, item)];
    handler.startTimer();
    handler.timerCallback('execute');
    handler.stopTimer();
    completeWrite();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fired, 0);
    assert.equal(timers.size, 0);
});

test('Flow rejection is logged once and the failed trigger is consumed', async () => {
    const { app, errors, timers } = fixture();
    const { settings, schedule, item } = schedules();
    let fired = 0;
    const flow = { async setTokenValue() {}, async triggerFlow() { fired++; throw new Error('Flow failed'); } };
    const handler = new TriggerHandler(app, settings, flow, new SunWrapper());
    handler.setupTriggers('startup');
    handler.triggers = [new Trigger(DateTime.now(), schedule, item)];
    handler.startTimer();
    // Simulate delivery of the scheduled callback: delivered timers are no longer pending.
    timers.clear();
    handler.timerCallback('execute');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fired, 1);
    assert.equal(handler.triggers.length, 0);
    assert.match(String(errors[0][1]), /Flow failed/);
    assert.equal(timers.size, 1);
    handler.stopTimer();
});

test('global tags use schedule plus token identity and propagate write errors', async () => {
    const { app } = fixture();
    const { settings, token } = schedules();
    const second = settings.addNewSchedule('Other', true);
    const otherToken = second.addNewTokenInternal(token.id, 'Other tag', 'number');
    const writes = [];
    app.homey.flow.createToken = async id => ({ id, async unregister() {}, async setValue(value) { writes.push([id, value]); } });
    const handler = new FlowAndTokenHandler(app, settings.schedules);
    await handler.setupTokens();
    writes.length = 0;
    await handler.setTokenValue(otherToken, '1,5');
    assert.deepEqual(writes, [['schedule2-token1', 1.5]]);
    handler.tokenWrappers[1].flowToken.setValue = async () => { throw new Error('Write failed'); };
    await assert.rejects(() => handler.setTokenValue(otherToken, 2), /Write failed/);
});

test('rapid settings reloads serialize token registration and keep one timer/listener', async () => {
    const { app, values, timers } = fixture();
    const { settings } = schedules();
    values.set('settings', new SettingsPersistance().buildSettings(settings));
    let registrations = 0;
    let maxRegistrations = 0;
    app.homey.flow.createToken = async id => {
        registrations++;
        maxRegistrations = Math.max(maxRegistrations, registrations);
        await new Promise(resolve => setImmediate(resolve));
        registrations--;
        return { id, async unregister() {}, async setValue() {} };
    };
    const main = new MainApp(app);
    await main.init();
    await Promise.all([main.reinit(), main.reinit(), main.reinit()]);
    assert.equal(maxRegistrations, 1);
    assert.equal(timers.size, 1);
    assert.equal(app.homey.settings.listenerCount('set'), 1);
    const previousTimer = main.triggerHandler;
    values.set('settings', '{');
    await assert.rejects(() => main.reinit());
    assert.equal(main.triggerHandler, previousTimer);
    assert.equal(timers.size, 1);
    await main.destroy();
    assert.equal(timers.size, 0);
    assert.equal(app.homey.settings.listenerCount('set'), 0);
});

test('invalid startup settings do not overwrite stored data or block settings repair', async () => {
    const { app, values, errors } = fixture();
    values.set('settings', '{');
    const main = new MainApp(app);
    await main.init();
    assert.equal(values.get('settings'), '{');
    assert.ok(values.has('geolocation'));
    assert.equal(errors.length, 1);
    await main.destroy();
});

test('compiled Homey entrypoint directly exports an App subclass', () => {
    const fs = require('node:fs');
    const vm = require('node:vm');
    class HomeyApp {}
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../.homeybuild/app.js'), 'utf8'), {
        module, exports: module.exports,
        require: id => id === 'homey' ? { App: HomeyApp } : compiledRequire(id)
    });
    assert.equal(typeof module.exports, 'function');
    assert.ok(module.exports.prototype instanceof HomeyApp);
});

test('the declared schedule-state API has a compiled handler', async () => {
    const { app, values } = fixture();
    const { settings } = schedules();
    values.set('settings', new SettingsPersistance().buildSettings(settings));
    const result = await require('../.homeybuild/api').getScheduleState({ homey: app.homey });
    assert.deepEqual(result, [{ id: 1, name: 'Test', active: true }]);
});

test('single-digit hours accepted by the settings form resolve correctly', () => {
    const { app } = fixture();
    const handler = new TriggerHandler(app, new ASSettings(), {}, new SunWrapper());
    handler.setupTriggers('startup');
    const result = handler.getTimeInfoTime(new TimeInfo(TimeType.TimeOfDay, '1:02', '', ''), DateTime.now());
    assert.equal(result.hour, 1);
    assert.equal(result.minute, 2);
});

test('model deletion and token-setter helpers return their documented result', () => {
    const { settings, schedule, token, item } = schedules();
    assert.equal(item.deleteTokenSetter(token.id), true);
    assert.equal(item.deleteTokenSetter(token.id), false);
    const setter = item.addNewTokenSetterByIdWithVal(token.id, 3);
    assert.equal(setter.value, 3);
    assert.equal(item.addNewTokenSetterByIdWithVal(999, 3), null);
    assert.equal(schedule.deleteScheduleItem(item.id), true);
    assert.equal(schedule.deleteToken(token.id), true);
    assert.equal(settings.deleteSchedule(schedule.id), true);
    assert.equal(settings.deleteSchedule(schedule.id), false);
});

test('midnight refresh includes a trigger exactly at midnight', () => {
    const { app, timers } = fixture('UTC');
    const { settings, item } = schedules();
    item.mainTrigger.time = '00:00';
    const previousNow = Settings.now;
    let now = Date.parse('2026-10-07T23:59:59Z');
    Settings.now = () => now;
    try {
        const handler = new TriggerHandler(app, settings, {}, new SunWrapper());
        handler.setupTriggers('startup');
        handler.startTimer();
        now = Date.parse('2026-10-08T00:00:00Z');
        timers.clear();
        handler.timerCallback('idle');
        assert.equal(handler.triggers.length, 1);
        assert.equal(handler.triggers[0].triggerTime.toMillis(), now);
        assert.equal(timers.size, 1);
        handler.stopTimer();
    } finally { Settings.now = previousNow; }
});

test('invalid solar event identifiers cannot be saved', () => {
    const { settings, item } = schedules();
    item.mainTrigger = new TimeInfo(TimeType.Solar, '', '00:00', '00:00');
    const persistence = new SettingsPersistance();
    assert.throws(() => persistence.readSettings(persistence.buildSettings(settings)), /Invalid time or solar event/);
});

test('a random occurrence fired before midnight is not sampled and fired again', () => {
    const { app } = fixture('UTC');
    const { settings, item } = schedules();
    item.mainTrigger.time = '23:00';
    item.randomTrigger = new TimeInfo(TimeType.TimeOfDay, '01:00', '', '');
    const previousNow = Settings.now;
    const previousRandom = Math.random;
    let now = Date.parse('2026-10-07T12:00:00Z');
    Settings.now = () => now;
    Math.random = () => 0.1;
    try {
        const handler = new TriggerHandler(app, settings, {}, new SunWrapper());
        handler.setupTriggers('startup');
        assert.equal(handler.triggers.length, 1);
        assert.equal(handler.triggers[0].triggerTime.toISOTime().slice(0, 5), '23:12');
        handler.removeTrigger(handler.triggers[0]);
        now = Date.parse('2026-10-08T00:00:00Z');
        Math.random = () => 0.9;
        handler.setupTriggers('midnight');
        assert.equal(handler.triggers.length, 1);
        assert.equal(handler.triggers[0].triggerTime.toISOTime().slice(0, 5), '23:12');
        assert.equal(handler.triggers[0].triggerTime.toISODate(), '2026-10-08');
        assert.equal(handler.randomTimes.size, 3);
    } finally { Settings.now = previousNow; Math.random = previousRandom; }
});

test('a random occurrence sampled after midnight retains its time until execution', () => {
    const { app } = fixture('UTC');
    const { settings, item } = schedules();
    item.mainTrigger.time = '23:00';
    item.randomTrigger = new TimeInfo(TimeType.TimeOfDay, '01:00', '', '');
    const previousNow = Settings.now;
    const previousRandom = Math.random;
    let now = Date.parse('2026-10-07T12:00:00Z');
    Settings.now = () => now;
    Math.random = () => 0.9;
    try {
        const handler = new TriggerHandler(app, settings, {}, new SunWrapper());
        handler.setupTriggers('startup');
        const expected = Date.parse('2026-10-08T00:48:00Z');
        now = Date.parse('2026-10-08T00:00:00Z');
        Math.random = () => 0.1;
        handler.setupTriggers('midnight');
        assert.equal(handler.triggers[0].triggerTime.toMillis(), expected);
        now = Date.parse('2026-10-10T00:00:00Z');
        handler.setupTriggers('midnight');
        assert.equal(handler.randomTimes.size, 3);
        handler.setSettings(settings);
        assert.equal(handler.randomTimes.size, 0);
    } finally { Settings.now = previousNow; Math.random = previousRandom; }
});
