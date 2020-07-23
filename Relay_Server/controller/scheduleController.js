var Scheduler     = require("../models/scheduler"),
    Device        = require("../models/device"),
    schedule      = require('node-schedule'),
    ip            = require("ip"),
    async         = require("asyncawait/async"),
    await         = require("asyncawait/await"),
    localIP       = ip.address();

const MIN_SECOND = 0,
      MIN_MINUTE = 0,
      MIN_HOUR   = 0,
      MIN_DATE   = 1,
      MIN_MONTH  = 0,
      MIN_YEAR   = new Date().getFullYear(),
      MIN_DOW    = 0, // dayOfWeek
      
      MAX_SECOND = 59,
      MAX_MINUTE = 59,
      MAX_HOUR   = 23,
      MAX_DATE   = 31,
      MAX_MONTH  = 11,
      MAX_DOW    = 6;


var scheduleObj = {
    scheduleArr: [],
    // schedule_config: {
    //     
    // }
    buildSchedule: function(schedule_config){
        var scheduleObj = {};
        if(schedule_config['schedule']){
            // if we use short circuit evaluation on schedule['second'] to assign a value, and if schedule['second'] is 0, then this value will be ignored
            // and the right operand will be returned. This is not the behavior we want as second, minute, hour and month values can be 0
            let sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};
            
            const schedule  = schedule_config['schedule'] || undefined,
                  second    = sanitize_input(schedule['second']),
                  minute    = sanitize_input(schedule['minute']),
                  hour      = sanitize_input(schedule['hour']),
                  date      = Number(schedule['date'])  || undefined,
                  month     = sanitize_input(schedule['month']),
                  year      = Number(schedule['year']) || undefined,
                  dayOfWeek = (schedule['dayOfWeek']) ? Array.from(schedule['dayOfWeek']) : undefined;

            // Validate second input
            if(second !== undefined && !second.isNaN && Number.isInteger(second)){
                if(second >= MIN_SECOND && second <= MAX_SECOND){
                    scheduleObj['second'] = second;
                }else throw new Error(`second input must be >= ${MIN_SECOND} or <= ${MAX_SECOND}`);
            }else throw new Error("Invalid second input!");
            // Validate minute input
            if(minute !== undefined && !minute.isNaN && Number.isInteger(minute)){
                if(minute >= MIN_MINUTE && minute <= MAX_MINUTE){
                    scheduleObj['minute'] = minute;
                }else throw new Error(`Minute input must be >= ${MIN_MINUTE} or <= ${MAX_MINUTE}`);
            }else throw new Error("Invalid minute input!");
            // Validate hour input
            if(hour !== undefined && !hour.isNaN && Number.isInteger(hour)){
                if(hour >= MIN_HOUR && hour <= MAX_HOUR){
                    scheduleObj['hour'] = hour;
                }else throw new Error(`Minute input must be >= ${MIN_HOUR} or <= ${MAX_HOUR}`)
            }else throw new Error("Invalid hour input!");
            if(dayOfWeek !== undefined && dayOfWeek.length){
                console.log("dayOfWeek scheduling");
                let dayOfWeekArr = dayOfWeek.map(function(day){
                    // dayOfWeek = 0 - 6
                    if(!Number.isNaN(day) && Number(day) >= MIN_DOW && Number(day) <= MAX_DOW){
                        return parseInt(day);
                    }else throw new Error("Invalid day of week input.");
                });
                scheduleObj['dayOfWeek'] = dayOfWeekArr; 
            }
            // valid date input
            else if(date !== undefined && month !== undefined && year !== undefined){
                console.log("DATE BASED SCHEDULING");
                // DATE-BASED SCHEDULING
                if(date >= MIN_DATE && date <= MAX_DATE){
                    scheduleObj['date'] = date;
                }else throw new Error(`Date input must be >= ${MIN_DATE} or <= ${MAX_DATE}`);
                if(month >= MIN_MONTH && month <= MAX_MONTH){
                    scheduleObj['month'] = month;
                }else throw new Error(`Month input must be >= ${MIN_MONTH} or <= ${MAX_MONTH}`);
                if(year >= MIN_YEAR){
                    scheduleObj['year'] = year;
                    
                    let scheduleTestObj = new Date(year, month, date, hour, minute, second);
                    console.log("Date Obj: ", scheduleTestObj);
                    if(scheduleTestObj < new Date()) 
                        throw new Error("Schedule must occur in the future!");
                }else throw new Error(`Year input must be >= ${MIN_MONTH}  or <= ${MAX_MONTH}`);
            }
        }else throw new Error("Schedule details not found!");
        return scheduleObj;
    },
    // params 1: schedule_config
    // params 2:
    // params 3:
    // params 4: desired_state is 0 (off) or 1(on)
    // pre:
    // post:
    buildJob: function(schedule_config, activateRelayFn, context, gpio_pin, desired_state){
        let myScheduleObj = this.buildSchedule(schedule_config);

        let job = schedule.scheduleJob(myScheduleObj, function(){ activateRelayFn.call(context, gpio_pin, desired_state); });
        
        return job;
    },
    // invalidates any job. All  planned invocations will be canceled
    cancelSchedule: function(schedule_id, activateRelayFn, context){
        let self  = this,
            index = self.findScheduleIndex(schedule_id);
        if(index !== -1){   
        // cancel(reschedule) - when you set reschedule to true then the Job is newly scheduled afterwards
            console.log(`All Schedules for ${self.scheduleArr[index]['job'].nextInvocation()}`)
            self.scheduleArr[index]['job'].cancel();
            
            let schedule_config = self.scheduleArr[index]['schedule_config'],
                device_gpio     = schedule_config['device']['gpio'],
                today = new Date();
                
            let isScheduleActive = self.scheduleIsActive(schedule_config, today);
            
            if(isScheduleActive === true)
                activateRelayFn.call(context,  device_gpio, 0);
                

            console.log("Have been successfully canceled");
        }else{
            console.log("Schedule not found!");
            throw "Schedule not found!";
        }
            
    },
    // invalidates the next planned invocation or the job
    cancelNextSchedule: function(schedule_id, activateRelayFn, context){
        let self  = this,
            index = self.findScheduleIndex(schedule_id);
        if(index !== -1){
            
            let schedule_config = self.scheduleArr[index]['schedule_config'],
                device_gpio     = schedule_config['device']['gpio'];
                
            // cancelNext(reschedule) - when you set reschedule to true then the Job is newly scheduled afterwards
            console.log(`Next Schedule for ${self.scheduleArr[index]['job'].nextInvocation()}`)
            //activateRelayFn.call(context,  device_gpio, 0);
            self.scheduleArr[index]['job'].cancelNext();
            
            console.log("Has been successfully canceled");
        }else{
            console.log("Schedule not found!");
            throw "Schedule not found!";
        }
    },
    resumeSchedule: function(schedule_id, activateRelayFn, context){
        let self  = this,
            reschedule = true,
            index = self.findScheduleIndex(schedule_id);
        if(index !== -1){   
            console.log(`All Schedules for ${self.scheduleArr[index]['job'].nextInvocation()}`)
            let schedule_config = self.scheduleArr[index]['schedule_config'];
            
            let job = self.buildJob(
                schedule_config, 
                activateRelayFn, 
                context, 
                Number(schedule_config['device']['gpio']), 
                Boolean(schedule_config['device']['desired_state'])
            );

            self.scheduleArr[index]['job'] = job;
            console.log(`All Schedules for ${self.scheduleArr[index]['job'].nextInvocation()}`)
            console.log("Have been resumed");
            
            self.scheduleArr.forEach(function(schedule_obj){
                console.log(`my schedule config: ${JSON.stringify(schedule_obj)}`);
                let desired_state  = Boolean(schedule_obj['schedule_config']['device']['desired_state']),
                    nextScheduleId = schedule_obj['schedule_config']['schedule']['nextScheduleId'],
                    device_gpio    = Number(schedule_obj['schedule_config']['device']['gpio']);
                
                console.log("REGULAR SCHEDULING");
                if(nextScheduleId === undefined){
                    console.log("nextScheduleId is undefined");
                }else{
                    let today = new Date();
                    let isScheduleActive = self.scheduleIsActive(schedule_obj['schedule_config'], today);
                    if(isScheduleActive === true)
                        activateRelayFn.call(context,  device_gpio, desired_state);
                }
            });
            
            
        }else{
            console.log("Schedule not found!");
            throw "Schedule not found!";
        }
    },
    createSchedule: async function(new_schedule_config, activateRelayFn, context){
        let self              = this;
        let newScheduleResponse = await Scheduler.create(new_schedule_config);
        
        if(newScheduleResponse === undefined){
            return newScheduleResponse;
        }else{
            console.log(`await result: ${newScheduleResponse}`);
            let job = self.buildJob(
                new_schedule_config, 
                activateRelayFn, 
                context, 
                Number(newScheduleResponse['device']['gpio']), 
                Boolean(newScheduleResponse['device']['desired_state'])
            );
            var obj = { "schedule_config": newScheduleResponse, job };
            self.setSchedule(obj);
            return newScheduleResponse["_id"];
        }
    },
    findSameDaySchedulesAndRetIdxs: function(schedule_config){
        let self      = this,
            second    = Number(schedule_config['schedule']['second'])|| undefined,
            minute    = Number(schedule_config['schedule']['minute'])|| undefined,
            hour      = Number(schedule_config['schedule']['hour'])  || undefined,
            date      = Number(schedule_config['schedule']['date'])  || undefined,
            month     = Number(schedule_config['schedule']['month']) || undefined,
            year      = Number(schedule_config['schedule']['year'])  || undefined,
            gpio      = Number(schedule_config['device']['gpio'])    || undefined,
            dayOfWeek = (schedule_config['schedule']['dayOfWeek']) ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined,
            timestamp = new Date();
            
        let indices = [];
            
        // '00' from minute, second, or hour will create an invalid date object
        if(schedule_config['schedule']['second'] === '00'){
            second = 0;
        }
        if(schedule_config['schedule']['minute'] === '00'){
            minute = 0;
        }
        if(schedule_config['schedule']['hour'] == '00'){
            hour = 0;
        }
        timestamp.setHours(hour, minute, second);  
        let intersect = function(a, b){
            return a.filter(Set.prototype.has, new Set(b));
        }
        // recurrence based scheduling
        if(dayOfWeek !== undefined && dayOfWeek.length){ 
            console.log("Recurrence Based Scheduling");
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            self.scheduleArr.forEach(function(schedule_obj, index){
                let arr_second        = Number(schedule_obj['schedule_config']['schedule']['second'])|| undefined,
                    arr_minute        = Number(schedule_obj['schedule_config']['schedule']['minute'])|| undefined,
                    arr_hour          = Number(schedule_obj['schedule_config']['schedule']['hour'])  || undefined,
                    arr_date          = Number(schedule_obj['schedule_config']['schedule']['date'])  || undefined,
                    arr_month         = Number(schedule_obj['schedule_config']['schedule']['month']) || undefined,
                    arr_year          = Number(schedule_obj['schedule_config']['schedule']['year'])  || undefined,
                    arr_gpio          = Number(schedule_obj['schedule_config']['device']['gpio'])    || undefined,
                    arr_dayOfWeek     = (schedule_obj['schedule_config']['schedule']['dayOfWeek']) ? Array.from(schedule_obj['schedule_config']['schedule']['dayOfWeek']) : undefined;
                if(schedule_obj['schedule_config']['schedule']['nextScheduleId'] !== undefined && gpio === arr_gpio){
                    // recurrence based schedule compared to recurrence based scheduling
                    if(arr_dayOfWeek !== undefined && arr_dayOfWeek.length){
                        // the times these schedules are set for are all the same for recurrence based scheduling
                        let common_days = intersect(dayOfWeek, arr_dayOfWeek);
                        // are there common days between these recurrence-based schedules?
                        if(common_days.length > 0)
                            indices.push(index);
                    }
                    // recurrence based scheduling compared to date based scheduling
                    else if (arr_date !== undefined && arr_month !== undefined && arr_year !== undefined){
                        let arr_timestamp = new Date(arr_year, arr_month, arr_date, arr_hour, arr_minute, arr_second);
                        let arr_numDay = arr_timestamp.getDay();
                        if(dayOfWeek.includes(arr_numDay))
                            indices.push(index);
                    }
                    // otherwise, recurrence based scheduling compared check to daily 1 time - off schedules
                    else
                        indices.push(index);
                }
            });
        }
        // date based scheduling
        else if(date !== undefined && month !== undefined && year !== undefined){ 
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            self.scheduleArr.forEach(function(schedule_obj, index){
                let arr_date          = Number(schedule_obj['schedule_config']['schedule']['date'])  || undefined,
                    arr_month         = Number(schedule_obj['schedule_config']['schedule']['month']) || undefined,
                    arr_year          = Number(schedule_obj['schedule_config']['schedule']['year'])  || undefined,
                    arr_gpio          = Number(schedule_obj['schedule_config']['device']['gpio'])    || undefined,
                    arr_dayOfWeek     = (schedule_obj['schedule_config']['schedule']['dayOfWeek']) ? Array.from(schedule_obj['schedule_config']['schedule']['dayOfWeek']) : undefined;
                
                if(schedule_obj['schedule_config']['schedule']['nextScheduleId'] !== undefined && gpio === arr_gpio){
                    // date based scheduling compared to recurrence based scheduling
                    if(arr_dayOfWeek !== undefined && arr_dayOfWeek.length){
                        let datebased_timestamp = new Date(year, month, date, hour, minute, second);
                        let datebased_numDay = datebased_timestamp.getDay();
                        
                        if(arr_dayOfWeek.includes(datebased_numDay))
                            indices.push(index);
                    }
                    // date based scheduling compared to date based scheduling
                    else if (arr_date !== undefined && arr_month !== undefined && arr_year !== undefined){
                        if(date === arr_date && month === arr_month && year === arr_year)
                            indices.push(index);
                    }
                    // otherwise, date based scheduling compared check to 1 time - off schedules
                    else
                        indices.push(index);
                }
            });
        }
        // otherwise, everyday 1 time - off schedules
        else{
            // loop through our schedules and find another schedule that runs on same days as the schedule we are trying to add
            self.scheduleArr.forEach(function(schedule_obj, index){
                let arr_date      = Number(schedule_obj['schedule_config']['schedule']['date'])  || undefined,
                    arr_month     = Number(schedule_obj['schedule_config']['schedule']['month']) || undefined,
                    arr_year      = Number(schedule_obj['schedule_config']['schedule']['year'])  || undefined,
                    arr_gpio      = Number(schedule_obj['schedule_config']['device']['gpio'])    || undefined,
                    arr_dayOfWeek = (schedule_obj['schedule_config']['schedule']['dayOfWeek']) ? Array.from(schedule_obj['schedule_config']['schedule']['dayOfWeek']) : undefined;
                    
                if(schedule_obj['schedule_config']['schedule']['nextScheduleId'] !== undefined && gpio === arr_gpio){
                //if(schedule_obj["_id"] !== schedule_id){
                    // everyday 1 time - off schedules compared to recurrence based scheduling
                    if(arr_dayOfWeek !== undefined && arr_dayOfWeek.length)
                        indices.push(index);
                    // everyday 1 time - off schedules compared to date based scheduling
                    else if (arr_date !== undefined && arr_month !== undefined && arr_year !== undefined)
                        indices.push(index);
                    // otherwise, 1 time - off schedules compared check to everyday 1 time - off schedules
                    else
                        indices.push(index);
                }
            });
            
        }
        return indices;
    },
    areSchedulesOnSameDay: function(schedule_config){

    },
    isScheduleOverlapping: function(on_schedule_config, off_schedule_config){
        let self              = this,
            new_on_second     = Number(on_schedule_config['schedule']['second'])  || undefined,
            new_on_minute     = Number(on_schedule_config['schedule']['minute'])  || undefined,
            new_on_hour       = Number(on_schedule_config['schedule']['hour'  ])  || undefined,
            
            new_off_second    = Number(off_schedule_config['schedule']['second']) || undefined,
            new_off_minute    = Number(off_schedule_config['schedule']['minute']) || undefined,
            new_off_hour      = Number(off_schedule_config['schedule']['hour'])   || undefined, 
            new_on_timestamp  = new Date(),
            new_off_timestamp = new Date();
            
        let conflictMsg = "",
            indices     = [];
        
        console.log("in isScheduleOverlapping");
        // '00' from minute, second, or hour will create an invalid date object
        if(on_schedule_config['schedule']['second'] === '00')
            new_on_second = 0;
        if(on_schedule_config['schedule']['minute'] === '00')
            new_on_minute = 0;
        if(on_schedule_config['schedule']['hour'] == '00')
            new_on_hour = 0;
        // '00' from minute, second, or hour will create an invalid date object
        if(off_schedule_config['schedule']['second'] === '00')
            new_off_second = 0;
        if(off_schedule_config['schedule']['minute'] === '00')
            new_off_minute = 0;
        if(off_schedule_config['schedule']['hour'] == '00')
            new_off_hour = 0;
            
        new_on_timestamp.setHours(new_on_hour, new_on_minute, new_on_second);  
        new_off_timestamp.setHours(new_off_hour, new_off_minute, new_off_second);
        
        indices = self.findSameDaySchedulesAndRetIdxs(on_schedule_config);
        console.log("indexes: " + indices);
        
        indices.forEach(function(index){
            if(index >= 0){
                let arr_on_schedule_obj    = self.scheduleArr[index],
                    arr_on_schedule_config = arr_on_schedule_obj['schedule_config'],
                    arr_on_second          = arr_on_schedule_config['schedule']['second'],
                    arr_on_minute          = arr_on_schedule_config['schedule']['minute'],
                    arr_on_hour            = arr_on_schedule_config['schedule']['hour'],
                    arr_off_mongo_id       = arr_on_schedule_config['schedule']['nextScheduleId'].toString(),
                    arr_on_timestamp       = new Date();
                
                
                let arr_off_schedule_index  = self.findScheduleIndex(arr_off_mongo_id),
                    arr_off_schedule_obj    = self.scheduleArr[arr_off_schedule_index],
                    arr_off_schedule_config = arr_off_schedule_obj['schedule_config'],
                    arr_off_second          = arr_off_schedule_config['schedule']['second'],
                    arr_off_minute          = arr_off_schedule_config['schedule']['minute'],
                    arr_off_hour            = arr_off_schedule_config['schedule']['hour'],
                    arr_off_timestamp       = new Date();
                    
                arr_on_timestamp.setHours(arr_on_hour, arr_on_minute, arr_on_second);
                arr_off_timestamp.setHours(arr_off_hour, arr_off_minute, arr_off_second);
                
                console.log(`on_timestamp ${new_on_timestamp}, timestamp: ${arr_on_timestamp}, off_timestamp" ${new_off_timestamp}, timestamp1: ${arr_off_timestamp}`);
                
                let timestamp_options   = { hour: 'numeric', minute: 'numeric', hour12: true },
                    fixed_on_timestamp  = new_on_timestamp.toLocaleString('en-US', timestamp_options),
                    fixed_timestamp1    = arr_on_timestamp.toLocaleString('en-US', timestamp_options),
                    fixed_timestamp2    = arr_off_timestamp.toLocaleString('en-US', timestamp_options),
                    fixed_off_timestamp = new_off_timestamp.toLocaleString('en-US', timestamp_options);
                
                if(new_on_timestamp <= arr_on_timestamp && new_off_timestamp >= arr_off_timestamp)
                   conflictMsg += `Schedule is overlapping`;
            }
        });
        if(conflictMsg !== "")
            throw new Error(conflictMsg);
    },
    isScheduleConflicting: function(schedule_config){
        let self      = this,
            second    = Number(schedule_config['schedule']['second'])|| undefined,
            minute    = Number(schedule_config['schedule']['minute'])|| undefined,
            hour      = Number(schedule_config['schedule']['hour'])  || undefined,
            dayOfWeek = (schedule_config['schedule']['dayOfWeek']) ? Array.from(schedule_config['schedule']['dayOfWeek']) : undefined,
            timestamp = new Date();
            
        let conflictMsg = "",
            indices    = [];

        console.log("in isScheduleConflicting");
        let handleScheduleConflictsMsg = function(isScheduleConflicting, schedule_obj){
            if(isScheduleConflicting){
                console.log("In handleScheduleConflictsMsg");
                let second = schedule_obj['schedule']['second'],
                    minute = schedule_obj['schedule']['minute'],
                    hour   = schedule_obj['schedule']['hour'],
                    offScheduleId = schedule_obj['schedule']['nextScheduleId'].toString();
                    
                let on_timestamp  = new Date(),
                    off_timestamp = new Date();
                    
                on_timestamp.setHours(hour, minute, second);
                let offScheduleIndex = self.findScheduleIndex(offScheduleId);
                
                if(offScheduleIndex !== -1){
                    let off_schedule_config    = self.scheduleArr[offScheduleIndex]['schedule_config'],
                        off_schedule_second    = off_schedule_config['schedule']['second'],
                        off_schedule_minute    = off_schedule_config['schedule']['minute'],
                        off_schedule_hour      = off_schedule_config['schedule']['hour'];
                    off_timestamp.setHours(off_schedule_hour, off_schedule_minute, off_schedule_second);
                    let timestamp_options = { hour: 'numeric', minute: 'numeric', hour12: true };
                    
                    let fixed_on_timestamp = on_timestamp.toLocaleString('en-US', timestamp_options);
                    let fixed_timestamp = timestamp.toLocaleString('en-US', timestamp_options);
                    let fixed_off_timestamp = off_timestamp.toLocaleString('en-US', timestamp_options);
                    return `New Schedule timestamp - ${fixed_timestamp} Conflicts with ON - ${fixed_on_timestamp} and OFF - ${fixed_off_timestamp}`;
                   // return `New Schedule timestamp - Conflicts with ON - and OFF - , offScheduleIndex: `;
                }else
                    console.log("offScheduleIndex === -1");
            }else{
                console.log("No schedule conflict");
                return "";
            }
        }
        // '00' from minute, second, or hour will create an invalid date object
        if(schedule_config['schedule']['second'] === '00')
            second = 0;
        if(schedule_config['schedule']['minute'] === '00')
            minute = 0;
        if(schedule_config['schedule']['hour'] == '00')
            hour = 0;
            
        timestamp.setHours(hour, minute, second);  
        
        indices = self.findSameDaySchedulesAndRetIdxs(schedule_config);
        console.log("indexes: " + indices);
        
        indices.forEach(function(index){
            if(index >= 0){
                let schedule_obj          = self.scheduleArr[index],
                    isScheduleConflicting = self.scheduleIsActive(schedule_obj['schedule_config'], timestamp);
                console.log("491: index >= 0");
                conflictMsg += handleScheduleConflictsMsg(isScheduleConflicting, schedule_obj['schedule_config']);
            }
        });
        if(conflictMsg !== ""){
            throw new Error(conflictMsg);
        }
    },
    // Finds the next_schedule_config that's associated with the prev_schedule_config
    // and returns the boolean result of whether the 2nd argument, timestamp is greater than or equal to 
    // the timestamp within the prev_schedule_config object and is also less tan the timestamp within 
    // the next_schedule_config object
    // Comparison does not use date, or day of week, but assumes these schedules are happening on the same day
    scheduleIsActive: function(on_schedule_config, timestamp){
        let self = this,
            result = false,
            sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};
            
        // check to see if 1 of the schedules is active right now.
        if(on_schedule_config === undefined || on_schedule_config === null){
            return result;
        }
        let on_schedule_second = sanitize_input(on_schedule_config['schedule']['second']),
            on_schedule_minute = sanitize_input(on_schedule_config['schedule']['minute']),
            on_schedule_hour   = sanitize_input(on_schedule_config['schedule']['hour']),
            desired_state      = Boolean(on_schedule_config['device']['desired_state']),
            onScheduleId       = on_schedule_config['schedule']['prevScheduleId'],
            offScheduleId      = on_schedule_config['schedule']['nextScheduleId'];
            
        // schedules could be loaded out of order. For example, we could be looking at the schedule that turns the outlet off. we need to first look at the schedule that turns the outlet on
        if(desired_state !== undefined && desired_state === true && onScheduleId === undefined && offScheduleId !== undefined){ // 'on' schedule
            console.log("Processing 'on' schedule");
            let offScheduleIndex = self.findScheduleIndex(on_schedule_config['schedule']['nextScheduleId'].toString());
    
            if(offScheduleIndex !== -1){
                let today                  = new Date(),
                    on_schedule_timestamp  = new Date(),
                    off_schedule_timestamp = new Date(),
                    off_schedule_config    = self.scheduleArr[offScheduleIndex]['schedule_config'],
                    off_schedule_second    = sanitize_input(off_schedule_config['schedule']['second']),
                    off_schedule_minute    = sanitize_input(off_schedule_config['schedule']['minute']),
                    off_schedule_hour      = sanitize_input(off_schedule_config['schedule']['hour']);
                        
                on_schedule_timestamp.setHours(on_schedule_hour, on_schedule_minute, on_schedule_second);
                off_schedule_timestamp.setHours(off_schedule_hour, off_schedule_minute, off_schedule_second);
                
                // console.log(`prev_schedule_timestamp: ${prev_schedule_timestamp}`);
                // console.log(`today timestamp:  ${today}`);
                // console.log(`next_schedule_timestamp: ${next_schedule_timestamp}`);
                if(timestamp >= on_schedule_timestamp && timestamp < off_schedule_timestamp)
                    result = true;
            }else{ // schedule not found
                console.log("Schedule not found!!");
            }
            
        }else{
            console.log("There is a problem with the inputs given.")
            console.log(`desired_state: ${desired_state}`);
            console.log(`prevScheduleId:  ${onScheduleId}`);
            console.log(`nextScheduleId:  ${offScheduleId}`);
        }
        return result;
    },
    getSchedules: function(activateRelayFn, context){
        let self = this,
            sanitize_input = (input) => {return (Number(input) === 0) ? Number(input) : Number(input) || undefined};

        Device.findOne({local_ip: localIP}, function(err, myDevices){
            if(err){
                console.log(err);
            }else{
                
                try{
                   let deviceSchedulePromise = async () => { return await Scheduler.find({'device.id': myDevices["_id"]}); }
                   
                    deviceSchedulePromise().then(function(result){
                        console.log(`result: ${result}`);
                        return result;
                    }, function(err){
                        console.log(`err: ${err}`);
                    }).then(function(schedule_configs){
                        console.log(`schedule_configs: ${schedule_configs}`);
                        schedule_configs.forEach(function(schedule_config){
                            console.log(`schedule_config: ${schedule_config}`);
                            let job = self.buildJob(
                                schedule_config, 
                                activateRelayFn, 
                                context, 
                                Number(schedule_config['device']['gpio']), 
                                Boolean(schedule_config['device']['desired_state'])
                            );
                            var obj = {"schedule_config": schedule_config, job};
                            self.setSchedule(obj);
                        });
                        console.log(`Done processing schedules: ${self.scheduleArr.length}`);
                        self.scheduleArr.forEach(function(schedule_obj){
                            console.log("my schedule config: " + JSON.stringify(schedule_obj));
                            let date          = Number(schedule_obj['schedule_config']['schedule']['date'])  || undefined,
                                month         = sanitize_input(schedule_obj['schedule_config']['schedule']['month']),
                                year          = Number(schedule_obj['schedule_config']['schedule']['year']) || undefined,
                                dayOfWeek     = (schedule_obj['schedule_config']['schedule']['dayOfWeek']) ? Array.from(schedule_obj['schedule_config']['schedule']['dayOfWeek']) : undefined,
                                today         = new Date(),
                                desired_state = Boolean(schedule_obj['schedule_config']['device']['desired_state']),
                                device_gpio   = Number(schedule_obj['schedule_config']['device']['gpio']);
                                
                            console.log("REGULAR SCHEDULING");
                            let offScheduleId = schedule_obj['schedule_config']['schedule']['nextScheduleId'];
                            if(offScheduleId === undefined){
                                console.log("offScheduleId is undefined");
                            }else{
                                let today = new Date()
                                let isScheduleActive = self.scheduleIsActive(schedule_obj['schedule_config'], today);
                                if(isScheduleActive === true)
                                    activateRelayFn.call(context,  device_gpio, desired_state);
                            }
                        });
                    }).catch(function(err){
                        console.log(`Error caught: ${err}`);
                    })
                   
                }catch(err){
                    console.log(`Error caught: ${err}`);
                }
            }
        });
    },
    setSchedule: function(new_schedule_config, index){
        let self = this;
        if(index !== undefined){
            if(typeof index !== Number){
                throw new Error("index is not a number!");
            }else if(index > self.scheduleArr.length){
                throw new Error("index provided is not valid!")
            }else{
                self.scheduleArr[index] = null;
                self.scheduleArr[index] = new_schedule_config;
            }
        }else{
            self.scheduleArr.push(new_schedule_config);
        }
    },
    editSchedule: function(schedule_id, updated_schedule_config, activateRelayFn, context){
        let self  = this,
            schedule_conflict = false,
            index = self.findScheduleIndex(schedule_id);
        console.log(`schedule_id: ${schedule_id}`);
        console.log(`updateSchedule: ${updated_schedule_config}`);
        console.log(self.scheduleArr);
        if(index !== -1){
            console.log(`Match found at index: ${index}`);

            //schedule_conflict ^= self.isScheduleConflicting(updated_schedule_config, schedule_id); // true - there is a schedule conflict
            Scheduler.findByIdAndUpdate(schedule_id, {$set: updated_schedule_config}, (err, schedule) => {
                if(err){
                    console.log(err);
                    throw err;
                } else {
                    self.scheduleArr[index]['job'].cancel();
                    console.log("Schedule canceled and removed!");
                    let job = self.buildJob(
                        updated_schedule_config, 
                        activateRelayFn, 
                        context, 
                        Number(updated_schedule_config['device']['gpio']), 
                        Boolean(updated_schedule_config['device']['desired_state'])
                    );
                    let updated_schedule_device = updated_schedule_config['device'],
                        updated_schedule_schedule = updated_schedule_config['schedule'];
                    
                    let schedule_config = {
                        "device": updated_schedule_device,
                        "schedule": updated_schedule_schedule,
                        "_id": schedule['_id']
                    };
                    // self.scheduleArr[index].updateSchedule(updated_schedule_device, updated_schedule_schedule, job);
                    // let schedule_config1 = new Schedule_Config(updated_schedule_device, updated_schedule_schedule, schedule["_id"]);
                    var obj = {"schedule_config": schedule_config, job};
                    self.scheduleArr[index] = null;
                    self.scheduleArr[index] = obj;
                    //self.setSchedule(obj, index);
                    // CHANGE NEEDED: does not account for updating the 'ON' schedule to an earlier time that would make the schedule be active
                    self.scheduleArr.forEach(function(schedule_obj){
                        console.log(`my schedule config: ${JSON.stringify(schedule_obj)}`);
                        let desired_state  = Boolean(schedule_obj['schedule_config']['device']['desired_state']),
                            nextScheduleId = schedule_obj['schedule_config']['schedule']['nextScheduleId'],
                            device_gpio    = Number(schedule_obj['schedule_config']['device']['gpio']);
                        
                        console.log("REGULAR SCHEDULING");
                        if(nextScheduleId === undefined){
                            console.log("nextScheduleId is undefined");
                        }else{
                            let today                   = new Date();
                            let isScheduleActive = self.scheduleIsActive(schedule_obj['schedule_config'], today);
                            if(isScheduleActive === true)
                                activateRelayFn.call(context,  device_gpio, desired_state);
                            else
                                activateRelayFn.call(context, device_gpio, 0);  
                        }
                    });
                }
            });
        }else{
            console.log("Schedule not found!");
            throw "Schedule not found!";
        }
    },
    deleteSchedule: function(schedule_id){
        let self = this;
        let index = this.findScheduleIndex(schedule_id);
        console.log(`Deleting Schedule Function: ${index}`);
        if(index !== -1){
            console.log(`Match found at index: ${index}`);
            Scheduler.findByIdAndRemove(schedule_id, (err) => {
                if(err){
                    console.log(err);
                    throw err;
                }
                else{
                    console.log("in else");
                    self.scheduleArr[index]['job'].cancel();
                    console.log("Schedule canceled and removed!\n");
                    self.scheduleArr.splice(index, 1);
                    console.log(self.scheduleArr.length);
                }
            });
        }else{
            throw "Schedule not found!";
        }
    },
    findScheduleIndex: function(schedule_id){
        return this.scheduleArr.findIndex((scheduleObj) => scheduleObj['schedule_config']['_id'] == schedule_id);
    }
}
module.exports = scheduleObj;